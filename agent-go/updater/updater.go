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

func VerificarEAtualizar(cfg *config.Config) (bool, error) {
	if !cfg.AutoUpdate || cfg.ServidorBase == "" {
		return false, nil
	}

	base := strings.TrimRight(strings.TrimSpace(cfg.ServidorBase), "/")
	if !strings.HasPrefix(base, "http://") && !strings.HasPrefix(base, "https://") {
		base = "http://" + base
	}

	urlVersao := fmt.Sprintf("%s/api/agente/versao", base)
	client := &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			Proxy:           http.ProxyFromEnvironment,
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	resp, err := client.Get(urlVersao)
	if err != nil {
		return false, fmt.Errorf("erro consultando versao: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return false, fmt.Errorf("servidor retornou HTTP %d", resp.StatusCode)
	}

	var manifest VersaoManifest
	if err := json.NewDecoder(resp.Body).Decode(&manifest); err != nil {
		return false, fmt.Errorf("erro decodificando json: %w", err)
	}

	infoExe, ok := manifest.Arquivos["spx-agent.exe"]
	if !ok || infoExe.Sha256 == "" {
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

	log.Printf("[UPDATER] Nova versao detectada! Local=%s Remota=%s", currentHash[:8], infoExe.Sha256[:8])

	// 1. Download para arquivo temporario
	urlDownload := fmt.Sprintf("%s/api/agente/download?arquivo=spx-agent.exe", base)
	tmpExe := currentExe + ".tmp"
	oldExe := currentExe + ".old"

	dlResp, err := client.Get(urlDownload)
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

	if _, err := io.Copy(out, dlResp.Body); err != nil {
		out.Close()
		os.Remove(tmpExe)
		return false, fmt.Errorf("erro salvando tmp file: %w", err)
	}
	out.Close()

	// 2. Valida hash do download
	dlHash, err := calcularSha256(tmpExe)
	if err != nil || !strings.EqualFold(dlHash, infoExe.Sha256) {
		os.Remove(tmpExe)
		return false, fmt.Errorf("hash do arquivo baixado divergente. Atualizacao abortada")
	}

	// 3. Substituicao atomica no Windows:
	// O Windows permite renomear um executavel em execucao (mas nao deletar ou sobrescrever diretamente).
	_ = os.Remove(oldExe)
	if err := os.Rename(currentExe, oldExe); err != nil {
		os.Remove(tmpExe)
		return false, fmt.Errorf("erro renomeando binario atual: %w", err)
	}

	if err := os.Rename(tmpExe, currentExe); err != nil {
		// Rollback se falhar
		_ = os.Rename(oldExe, currentExe)
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

// LimparBackups remove eventuais .old deixados por atualizacoes anteriores
func LimparBackups() {
	if exe, err := os.Executable(); err == nil {
		old := exe + ".old"
		_ = os.Remove(old)
		tmp := exe + ".tmp"
		_ = os.Remove(tmp)
	}
}
