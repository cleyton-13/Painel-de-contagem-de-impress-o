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
	"time"
	"spx-agent/collector"
	"spx-agent/config"
)

type IngestaoPayload struct {
	Unidade  string              `json:"unidade"`
	Leituras []collector.Leitura `json:"leituras"`
}

type IngestaoResponse struct {
	Success       bool     `json:"success"`
	Unidade       string   `json:"unidade"`
	NewReadings   int      `json:"newReadings"`
	Atualizadas   int      `json:"atualizadas"`
	Duplicadas    int      `json:"duplicadas"`
	Erros         []string `json:"erros"`
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

	url := fmt.Sprintf("%s%s", cfg.ServidorBase, cfg.EndpointIngestao)
	log.Printf("[SENDER] Enviando %d leituras para %s (Unidade: %s)...", len(leituras), url, cfg.Unidade)

	// Cliente HTTP tolerante com timeout de 30s, suporte a HTTPS e Proxy corporativo
	client := &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			Proxy:           http.ProxyFromEnvironment,
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	maxTentativas := 10
	baseDelay := 3.0

	for tentativa := 1; tentativa <= maxTentativas; tentativa++ {
		req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
		if err != nil {
			return fmt.Errorf("erro criando request: %w", err)
		}

		req.Header.Set("Content-Type", "application/json; charset=utf-8")
		if cfg.ApiKey != "" {
			req.Header.Set("x-api-key", cfg.ApiKey)
			req.Header.Set("Authorization", "Bearer "+cfg.ApiKey)
		}

		resp, err := client.Do(req)
		if err == nil {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()

			if resp.StatusCode == 200 {
				var ingResp IngestaoResponse
				_ = json.Unmarshal(body, &ingResp)
				log.Printf("[SENDER] [SUCESSO] Tentativa %d/%d: Novas=%d, Atualizadas=%d, Duplicadas=%d",
					tentativa, maxTentativas, ingResp.NewReadings, ingResp.Atualizadas, ingResp.Duplicadas)
				return nil
			}

			log.Printf("[SENDER] Servidor retornou HTTP %d (Tentativa %d/%d): %s",
				resp.StatusCode, tentativa, maxTentativas, string(body))
		} else {
			log.Printf("[SENDER] Falha na conexao (Tentativa %d/%d): %v", tentativa, maxTentativas, err)
		}

		if tentativa < maxTentativas {
			delaySec := time.Duration(baseDelay*math.Pow(1.8, float64(tentativa-1))) * time.Second
			if delaySec > 2*time.Minute {
				delaySec = 2 * time.Minute
			}
			log.Printf("[SENDER] Aguardando %v antes do proximo retry...", delaySec)
			time.Sleep(delaySec)
		}
	}

	return fmt.Errorf("falha definitiva no envio apos %d tentativas", maxTentativas)
}
