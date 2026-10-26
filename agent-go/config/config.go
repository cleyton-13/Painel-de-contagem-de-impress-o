package config

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
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
		Unidade:          "AE_PERUS",
		ServidorBase:     "http://localhost:3001",
		EndpointIngestao: "/api/ingestao/direto",
		ApiKey:           "homolog_dev_key_2026",
		Impressoras:      []string{"127.0.0.1"},
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

func LoadConfig() (*Config, error) {
	cfgPath := GetConfigPath()
	baseDir := filepath.Dir(cfgPath)

	cfg := DefaultConfig()

	// 1. Tenta carregar config.json existente
	data, err := os.ReadFile(cfgPath)
	if err == nil && len(data) > 0 {
		if err := json.Unmarshal(data, cfg); err == nil {
			if len(cfg.Impressoras) == 0 {
				cfg.Impressoras = loadImpressorasTxt(filepath.Join(baseDir, "impressoras.txt"))
			}
			return cfg, nil
		}
	}

	// 2. Se nao encontrou, tenta migrar de config.local.ps1
	ps1Path := filepath.Join(baseDir, "config.local.ps1")
	if ps1Data, err := os.ReadFile(ps1Path); err == nil {
		parsePs1Config(string(ps1Data), cfg)
	}

	ips := loadImpressorasTxt(filepath.Join(baseDir, "impressoras.txt"))
	if len(ips) > 0 {
		cfg.Impressoras = ips
	}

	// Salva apenas se o arquivo nao existia
	_ = SaveConfig(cfg)
	return cfg, nil
}

func SaveConfig(cfg *Config) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(GetConfigPath(), data, 0644)
}

func loadImpressorasTxt(path string) []string {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	var ips []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		line = strings.TrimPrefix(line, "\ufeff")
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "#") {
			ips = append(ips, line)
		}
	}
	return ips
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
