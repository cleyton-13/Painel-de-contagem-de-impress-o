package updater

import (
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"spx-agent/config"
)

type VersaoManifest struct {
	Versao          string                 `json:"versao"`
	DataAtualizacao string                 `json:"dataAtualizacao"`
	Arquivos        map[string]ArquivoInfo `json:"arquivos"`
}

type ArquivoInfo struct {
	Sha256       string `json:"sha256"`
	TamanhoBytes int64  `json:"tamanhoBytes"`
}

const maxBinaryBytes = 60 << 20 // Limite seguro de 60 MB para o executavel

var updaterTransport = &http.Transport{
	Proxy:                 http.ProxyFromEnvironment,
	MaxIdleConns:          4,
	IdleConnTimeout:       60 * time.Second,
	TLSHandshakeTimeout:   10 * time.Second,
	ResponseHeaderTimeout: 15 * time.Second,
	TLSClientConfig: &tls.Config{
		MinVersion:         tls.VersionTLS12,
		InsecureSkipVerify: true,
	},
}

var metaHTTPClient = &http.Client{
	Timeout:   20 * time.Second,
	Transport: updaterTransport,
}

var downloadHTTPClient = &http.Client{
	Timeout:   3 * time.Minute,
	Transport: updaterTransport,
}

func renameWithRetry(src, dst string) error {
	var lastErr error
	for i := 0; i < 4; i++ {
		if err := os.Rename(src, dst); err == nil {
			return nil
		} else {
			lastErr = err
			time.Sleep(500 * time.Millisecond)
		}
	}
	return lastErr
}

// VerificarEAtualizar consulta o manifesto remoto e atualiza o binario de forma atomica.
// Quando forcarManual=true, executa mesmo que cfg.AutoUpdate esteja desativado.
func VerificarEAtualizar(cfg *config.Config, forcarManual bool) (bool, error) {
	if (!forcarManual && !cfg.AutoUpdate) || strings.TrimSpace(cfg.ServidorBase) == "" {
		return false, nil
	}

	base := strings.TrimRight(strings.TrimSpace(cfg.ServidorBase), "/")
	if !strings.HasPrefix(base, "http://") && !strings.HasPrefix(base, "https://") {
		base = "http://" + base
	}

	urlVersao := fmt.Sprintf("%s/api/agente/versao", base)
	reqVer, err := http.NewRequest("GET", urlVersao, nil)
	if err != nil {
		return false, fmt.Errorf("erro criando request de versao: %w", err)
	}
	if cfg.ApiKey != "" {
		reqVer.Header.Set("x-api-key", cfg.ApiKey)
		reqVer.Header.Set("Authorization", "Bearer "+cfg.ApiKey)
	}

	resp, err := metaHTTPClient.Do(reqVer)
	if err != nil {
		return false, fmt.Errorf("erro consultando versao: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return false, fmt.Errorf("servidor retornou HTTP %d", resp.StatusCode)
	}

	var manifest VersaoManifest
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&manifest); err != nil {
		return false, fmt.Errorf("erro decodificando json: %w", err)
	}

	infoExe, ok := manifest.Arquivos["spx-agent.exe"]
	if !ok || len(infoExe.Sha256) < 64 {
		return false, nil // Ainda nao ha binario compilado registrado no servidor
	}

	currentExe, err := os.Executable()
	if err != nil {
		return false, err
	}

	currentHash, err := calcularSha256(currentExe)
	if err != nil {
		return false, err
	}

	if strings.EqualFold(currentHash, infoExe.Sha256) {
		return false, nil // Ja esta na versao mais recente
	}

	log.Printf("[UPDATER] Nova versao detectada (%s)! Local=%s Remota=%s",
		manifest.Versao, currentHash[:8], infoExe.Sha256[:8])

	// 1. Download para arquivo temporario com limite de tamanho
	urlDownload := fmt.Sprintf("%s/api/agente/download?arquivo=spx-agent.exe", base)
	tmpExe := currentExe + ".tmp"
	oldExe := currentExe + ".old"

	reqDl, err := http.NewRequest("GET", urlDownload, nil)
	if err != nil {
		return false, fmt.Errorf("erro criando request de download: %w", err)
	}
	if cfg.ApiKey != "" {
		reqDl.Header.Set("x-api-key", cfg.ApiKey)
		reqDl.Header.Set("Authorization", "Bearer "+cfg.ApiKey)
	}

	dlResp, err := downloadHTTPClient.Do(reqDl)
	if err != nil {
		return false, fmt.Errorf("erro baixando nova versao: %w", err)
	}
	defer dlResp.Body.Close()

	if dlResp.StatusCode != 200 {
		return false, fmt.Errorf("download retornou HTTP %d", dlResp.StatusCode)
	}

	out, err := os.Create(tmpExe)
	if err != nil {
		return false, fmt.Errorf("erro criando tmp file: %w", err)
	}

	if _, err := io.Copy(out, io.LimitReader(dlResp.Body, maxBinaryBytes)); err != nil {
		_ = out.Close()
		_ = os.Remove(tmpExe)
		return false, fmt.Errorf("erro salvando tmp file: %w", err)
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(tmpExe)
		return false, fmt.Errorf("erro fechando tmp file: %w", err)
	}

	// 2. Valida hash do download antes de promover
	dlHash, err := calcularSha256(tmpExe)
	if err != nil || !strings.EqualFold(dlHash, infoExe.Sha256) {
		_ = os.Remove(tmpExe)
		return false, fmt.Errorf("hash do arquivo baixado divergente. Atualizacao abortada")
	}

	// 3. Substituicao atomica no Windows com retry contra locks temporarios do Antivirus/Defender
	_ = os.Remove(oldExe)
	if err := renameWithRetry(currentExe, oldExe); err != nil {
		_ = os.Remove(tmpExe)
		return false, fmt.Errorf("erro renomeando binario atual: %w", err)
	}

	if err := renameWithRetry(tmpExe, currentExe); err != nil {
		// Rollback imediato se falhar
		_ = renameWithRetry(oldExe, currentExe)
		return false, fmt.Errorf("erro promovendo novo binario: %w", err)
	}

	log.Printf("[UPDATER] Binario atualizado com sucesso para SHA256 %s!", dlHash[:8])
	return true, nil
}

func calcularSha256(filePath string) (string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// LimparBackups remove eventuais .old / .tmp deixados por atualizacoes anteriores
func LimparBackups() {
	if exe, err := os.Executable(); err == nil {
		_ = os.Remove(exe + ".old")
		_ = os.Remove(exe + ".tmp")
	}
}
