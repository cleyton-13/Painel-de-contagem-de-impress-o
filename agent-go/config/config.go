package config

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	Unidade          string   `json:"unidade"`
	ServidorBase     string   `json:"servidorBase"`
	EndpointIngestao string   `json:"endpointIngestao"`
	ApiKey           string   `json:"apiKey"`
	Impressoras      []string `json:"impressoras"`
	SNMPCommunity    string   `json:"snmpCommunity"`
	SNMPTimeoutSec   int      `json:"snmpTimeoutSec"`
	HorariosDisparo  []string `json:"horariosDisparo"`
	AutoUpdate       bool     `json:"autoUpdate"`
}

func DefaultConfig() *Config {
	return &Config{
		Unidade:          "Matriz",
		ServidorBase:     "http://localhost:3000",
		EndpointIngestao: "/api/ingestao/direto",
		ApiKey:           "",
		Impressoras:      []string{},
		SNMPCommunity:    "public",
		SNMPTimeoutSec:   2,
		HorariosDisparo:  []string{"08:00", "12:00", "16:00", "20:00"},
		AutoUpdate:       true,
	}
}

func GetConfigPath() string {
	exePath, err := os.Executable()
	if err != nil {
		return "config.json"
	}
	return filepath.Join(filepath.Dir(exePath), "config.json")
}

// NormalizarHorario converte "8:00" ou "8:5" em "08:00" / "08:05"
func NormalizarHorario(raw string) (string, bool) {
	clean := strings.TrimSpace(raw)
	parts := strings.Split(clean, ":")
	if len(parts) < 2 {
		return "", false
	}
	h, errH := strconv.Atoi(strings.TrimSpace(parts[0]))
	m, errM := strconv.Atoi(strings.TrimSpace(parts[1]))
	if errH != nil || errM != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return "", false
	}
	return fmt.Sprintf("%02d:%02d", h, m), true
}

func normalizarListaHorarios(horarios []string) []string {
	seen := make(map[string]bool)
	var norm []string
	for _, h := range horarios {
		if hhmm, ok := NormalizarHorario(h); ok && !seen[hhmm] {
			seen[hhmm] = true
			norm = append(norm, hhmm)
		}
	}
	if len(norm) == 0 {
		return []string{"08:00", "12:00", "16:00", "20:00"}
	}
	return norm
}

func LoadConfig() (*Config, error) {
	cfgPath := GetConfigPath()
	baseDir := filepath.Dir(cfgPath)

	cfg := DefaultConfig()

	// 1. Tenta carregar config.json existente (removendo eventual UTF-8 BOM do PowerShell 5.1)
	data, err := os.ReadFile(cfgPath)
	if err == nil {
		cleanData := bytes.TrimSpace(bytes.TrimPrefix(data, []byte{0xEF, 0xBB, 0xBF}))
		if len(cleanData) > 0 {
			if unmarshalErr := json.Unmarshal(cleanData, cfg); unmarshalErr != nil {
				// NUNCA sobrescreve um config.json existente caso esteja com erro de sintaxe
				return nil, fmt.Errorf("erro lendo %s: %w", cfgPath, unmarshalErr)
			}

			cfg.HorariosDisparo = normalizarListaHorarios(cfg.HorariosDisparo)
			if cfg.EndpointIngestao == "" {
				cfg.EndpointIngestao = "/api/ingestao/direto"
			}
			if cfg.SNMPCommunity == "" {
				cfg.SNMPCommunity = "public"
			}
			if cfg.SNMPTimeoutSec <= 0 {
				cfg.SNMPTimeoutSec = 2
			}

			// Se impressoras.txt existir, sincroniza lista de IPs (incluindo quando esvaziada)
			impTxtPath := filepath.Join(baseDir, "impressoras.txt")
			if txtIps, exists := loadImpressorasTxt(impTxtPath); exists {
				cfg.Impressoras = txtIps
			}
			return cfg, nil
		}
	}

	// 2. Se config.json nao existia, tenta migrar de config.local.ps1
	ps1Path := filepath.Join(baseDir, "config.local.ps1")
	if ps1Data, err := os.ReadFile(ps1Path); err == nil {
		parsePs1Config(string(bytes.TrimPrefix(ps1Data, []byte{0xEF, 0xBB, 0xBF})), cfg)
	}

	if ips, exists := loadImpressorasTxt(filepath.Join(baseDir, "impressoras.txt")); exists {
		cfg.Impressoras = ips
	}
	cfg.HorariosDisparo = normalizarListaHorarios(cfg.HorariosDisparo)

	// Salva apenas na criacao inicial quando o arquivo nao existia
	_ = SaveConfig(cfg)
	return cfg, nil
}

func SaveConfig(cfg *Config) error {
	cfg.HorariosDisparo = normalizarListaHorarios(cfg.HorariosDisparo)
	if cfg.EndpointIngestao == "" {
		cfg.EndpointIngestao = "/api/ingestao/direto"
	}

	var lines []string
	seenIPs := make(map[string]bool)
	for _, ip := range cfg.Impressoras {
		ip = strings.TrimSpace(strings.TrimPrefix(ip, "\ufeff"))
		if ip != "" && !strings.HasPrefix(ip, "#") && !seenIPs[ip] {
			seenIPs[ip] = true
			lines = append(lines, ip)
		}
	}
	cfg.Impressoras = lines

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	cfgErr := os.WriteFile(GetConfigPath(), data, 0644)

	// Sincroniza tambem o impressoras.txt sem BOM
	baseDir := filepath.Dir(GetConfigPath())
	impPath := filepath.Join(baseDir, "impressoras.txt")
	impContent := ""
	if len(lines) > 0 {
		impContent = strings.Join(lines, "\r\n") + "\r\n"
	}
	_ = os.WriteFile(impPath, []byte(impContent), 0644)

	return cfgErr
}

func loadImpressorasTxt(path string) ([]string, bool) {
	f, err := os.Open(path)
	if err != nil {
		return nil, false
	}
	defer f.Close()

	ips := []string{}
	seen := make(map[string]bool)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		line = strings.TrimPrefix(line, "\ufeff")
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "#") && !seen[line] {
			seen[line] = true
			ips = append(ips, line)
		}
	}
	return ips, true
}

func parsePs1Config(content string, cfg *Config) {
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "$Unidade") {
			cfg.Unidade = extractPs1Val(line)
		} else if strings.HasPrefix(line, "$Servidor_Base") {
			cfg.ServidorBase = extractPs1Val(line)
		} else if strings.HasPrefix(line, "$Endpoint_Ingestao") {
			cfg.EndpointIngestao = extractPs1Val(line)
		} else if strings.HasPrefix(line, "$ApiKey") {
			cfg.ApiKey = extractPs1Val(line)
		}
	}
}

func extractPs1Val(line string) string {
	parts := strings.SplitN(line, "=", 2)
	if len(parts) == 2 {
		val := strings.TrimSpace(parts[1])
		val = strings.Trim(val, `"'`)
		return val
	}
	return ""
}
