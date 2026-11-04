package sender

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"strings"
	"time"

	"spx-agent/collector"
	"spx-agent/config"
)

type IngestaoPayload struct {
	Unidade  string              `json:"unidade"`
	Leituras []collector.Leitura `json:"leituras"`
}

type IngestaoResponse struct {
	Success     bool     `json:"success"`
	Unidade     string   `json:"unidade"`
	NewReadings int      `json:"newReadings"`
	Atualizadas int      `json:"atualizadas"`
	Duplicadas  int      `json:"duplicadas"`
	Erros       []string `json:"erros"`
}

var sharedHTTPClient = &http.Client{
	Timeout: 30 * time.Second,
	Transport: &http.Transport{
		Proxy:               http.ProxyFromEnvironment,
		MaxIdleConns:        10,
		MaxIdleConnsPerHost: 4,
		IdleConnTimeout:     60 * time.Second,
		TLSHandshakeTimeout: 10 * time.Second,
		TLSClientConfig: &tls.Config{
			MinVersion:         tls.VersionTLS12,
			InsecureSkipVerify: true, // Suporte a certificados internos autoassinados
		},
	},
}

func EnviarLeituras(cfg *config.Config, leituras []collector.Leitura) error {
	if len(leituras) == 0 {
		log.Println("[SENDER] Nenhuma leitura para enviar.")
		return nil
	}

	payload := IngestaoPayload{
		Unidade:  cfg.Unidade,
		Leituras: leituras,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("erro serializando JSON: %w", err)
	}

	base := strings.TrimRight(strings.TrimSpace(cfg.ServidorBase), "/")
	if base == "" {
		base = "http://localhost:3000"
	}
	if !strings.HasPrefix(base, "http://") && !strings.HasPrefix(base, "https://") {
		base = "http://" + base
	}
	endpoint := strings.TrimSpace(cfg.EndpointIngestao)
	if endpoint == "" {
		endpoint = "/api/ingestao/direto"
	}
	if !strings.HasPrefix(endpoint, "/") {
		endpoint = "/" + endpoint
	}
	url := fmt.Sprintf("%s%s", base, endpoint)
	log.Printf("[SENDER] Enviando %d leituras para %s (Unidade: %s)...", len(leituras), url, cfg.Unidade)

	maxTentativas := 8
	baseDelay := 3.0

	for tentativa := 1; tentativa <= maxTentativas; tentativa++ {
		req, err := http.NewRequest("POST", url, bytes.NewReader(jsonData))
		if err != nil {
			return fmt.Errorf("erro criando request: %w", err)
		}

		req.Header.Set("Content-Type", "application/json; charset=utf-8")
		if cfg.ApiKey != "" {
			req.Header.Set("x-api-key", cfg.ApiKey)
			req.Header.Set("Authorization", "Bearer "+cfg.ApiKey)
		}

		resp, err := sharedHTTPClient.Do(req)
		if err == nil {
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
			_ = resp.Body.Close()

			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				var ingResp IngestaoResponse
				_ = json.Unmarshal(body, &ingResp)
				log.Printf("[SENDER] [SUCESSO] Tentativa %d/%d: Novas=%d, Atualizadas=%d, Duplicadas=%d",
					tentativa, maxTentativas, ingResp.NewReadings, ingResp.Atualizadas, ingResp.Duplicadas)
				return nil
			}

			log.Printf("[SENDER] Servidor retornou HTTP %d (Tentativa %d/%d): %s",
				resp.StatusCode, tentativa, maxTentativas, string(body))

			// Erros definitivos de autenticacao ou payload invalido nao devem travar em retry
			if resp.StatusCode == 400 || resp.StatusCode == 401 || resp.StatusCode == 403 || resp.StatusCode == 413 {
				return fmt.Errorf("envio rejeitado pelo servidor (HTTP %d): verifique API Key e configuracao", resp.StatusCode)
			}
		} else {
			log.Printf("[SENDER] Falha na conexao (Tentativa %d/%d): %v", tentativa, maxTentativas, err)
		}

		if tentativa < maxTentativas {
			delaySec := time.Duration(baseDelay*math.Pow(1.8, float64(tentativa-1))) * time.Second
			if delaySec > 90*time.Second {
				delaySec = 90 * time.Second
			}
			log.Printf("[SENDER] Aguardando %v antes do proximo retry...", delaySec)
			time.Sleep(delaySec)
		}
	}

	return fmt.Errorf("falha definitiva no envio apos %d tentativas", maxTentativas)
}
