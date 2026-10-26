package collector

import (
	"fmt"
	"log"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/gosnmp/gosnmp"
	"spx-agent/config"
)

type Leitura struct {
	IP           string `json:"ip"`
	Serial       string `json:"serial"`
	Modelo       string `json:"modelo"`
	DataHora     string `json:"dataHora"`
	PaginasTotal int64  `json:"paginasTotal"`
	PaginasPB    int64  `json:"paginasPB"`
	PaginasColor int64  `json:"paginasColor"`
	Status       string `json:"status"`
}

const (
	OIDModelo        = "1.3.6.1.2.1.1.1.0"
	OIDModeloRFC     = "1.3.6.1.2.1.25.3.2.1.3.1"
	OIDSerial        = "1.3.6.1.2.1.43.5.1.1.17.1"
	OIDPaginasTotal  = "1.3.6.1.2.1.43.10.2.1.4.1.1"
	OIDPaginasPB     = "1.3.6.1.4.1.18334.1.1.1.5.7.2.2.1.5.1.2"
	OIDPaginasPBFall = "1.3.6.1.4.1.18334.1.1.1.5.7.2.3.1.5.1.2"
	OIDPaginasColor  = "1.3.6.1.4.1.18334.1.1.1.5.7.2.2.1.5.2.2"
	OIDPaginasColFall= "1.3.6.1.4.1.18334.1.1.1.5.7.2.3.1.5.1.1"
)

// ColetaParalela consulta todas as impressoras em paralelo via goroutines
func ColetaParalela(cfg *config.Config) []Leitura {
	var wg sync.WaitGroup
	var mu sync.Mutex
	var resultados []Leitura

	log.Printf("[COLLECTOR] Iniciando varredura paralela em %d impressora(s)...", len(cfg.Impressoras))
	inicio := time.Now()

	for _, ip := range cfg.Impressoras {
		ip = strings.TrimSpace(ip)
		if ip == "" {
			continue
		}

		wg.Add(1)
		go func(targetIP string) {
			defer wg.Done()
			leitura := consultarImpressora(targetIP, cfg)
			mu.Lock()
			resultados = append(resultados, leitura)
			mu.Unlock()
		}(ip)
	}

	wg.Wait()
	duracao := time.Since(inicio)
	log.Printf("[COLLECTOR] Varredura concluida em %v. Total de leituras: %d", duracao, len(resultados))
	return resultados
}

func consultarImpressora(ip string, cfg *config.Config) Leitura {
	dataHora := time.Now().Format("2006-01-02 15:04:05")

	// Wake-up ping na porta 9100 / 80 / 161 para tirar do modo repouso
	acordarImpressora(ip)

	timeout := time.Duration(cfg.SNMPTimeoutSec) * time.Second
	if timeout <= 0 {
		timeout = 3 * time.Second
	}

	snmp := &gosnmp.GoSNMP{
		Target:    ip,
		Port:      161,
		Community: cfg.SNMPCommunity,
		Version:   gosnmp.Version2c,
		Timeout:   timeout,
		Retries:   2,
	}

	err := snmp.Connect()
	if err != nil {
		return Leitura{
			IP: ip, Serial: "N/A", Modelo: "Desconhecido",
			DataHora: dataHora, Status: "Offline",
		}
	}
	defer func() {
		if snmp.Conn != nil {
			_ = snmp.Conn.Close()
		}
	}()

	oids := []string{
		OIDModelo, OIDSerial, OIDPaginasTotal,
		OIDPaginasPB, OIDPaginasColor,
	}

	res, err := snmp.Get(oids)
	if err != nil {
		// Tenta v1 se v2c falhar
		snmp.Version = gosnmp.Version1
		res, err = snmp.Get(oids)
		if err != nil {
			return Leitura{
				IP: ip, Serial: "N/A", Modelo: "Erro SNMP",
				DataHora: dataHora, Status: "Offline",
			}
		}
	}

	var modelo, serial string
	var total, pb, color int64

	for _, pdu := range res.Variables {
		oidName := strings.TrimPrefix(pdu.Name, ".")
		switch {
		case strings.HasPrefix(oidName, OIDModelo):
			modelo = formatPDUString(pdu.Value)
		case strings.HasPrefix(oidName, OIDSerial):
			serial = formatPDUString(pdu.Value)
		case strings.HasPrefix(oidName, OIDPaginasTotal):
			total = formatPDUInt(pdu.Value)
		case strings.HasPrefix(oidName, OIDPaginasPB):
			pb = formatPDUInt(pdu.Value)
		case strings.HasPrefix(oidName, OIDPaginasColor):
			color = formatPDUInt(pdu.Value)
		}
	}

	// Fallback para PB/Color caso nao venha no OID principal
	if pb == 0 {
		if resPb, err := snmp.Get([]string{OIDPaginasPBFall}); err == nil && len(resPb.Variables) > 0 {
			pb = formatPDUInt(resPb.Variables[0].Value)
		}
	}
	if color == 0 {
		if resCol, err := snmp.Get([]string{OIDPaginasColFall}); err == nil && len(resCol.Variables) > 0 {
			color = formatPDUInt(resCol.Variables[0].Value)
		}
	}

	// Fallback modelo RFC
	if modelo == "" || strings.EqualFold(modelo, "N/A") {
		if resMod, err := snmp.Get([]string{OIDModeloRFC}); err == nil && len(resMod.Variables) > 0 {
			modelo = formatPDUString(resMod.Variables[0].Value)
		}
	}

	// Regra especifica Konica Minolta c3300i (PB espelhado em Color)
	if strings.Contains(strings.ToLower(modelo), "c3300i") && pb > 0 && pb == color {
		color = 0
	}

	// Fallback inteligente para totalizacao
	if total == 0 && (pb > 0 || color > 0) {
		total = pb + color
	}
	// Se for monocromatica e pb nao veio explicitamente mas total veio
	if pb == 0 && color == 0 && total > 0 {
		pb = total
	}

	if serial == "" {
		serial = "N/A"
	}
	if modelo == "" {
		modelo = "Desconhecido"
	}

	return Leitura{
		IP:           ip,
		Serial:       serial,
		Modelo:       modelo,
		DataHora:     dataHora,
		PaginasTotal: total,
		PaginasPB:    pb,
		PaginasColor: color,
		Status:       "Online",
	}
}

func acordarImpressora(ip string) {
	// Envia um probe TCP rapido na porta 9100 (RAW Print) para acordar a controladora de rede
	d := net.Dialer{Timeout: 800 * time.Millisecond}
	conn, err := d.Dial("tcp", fmt.Sprintf("%s:9100", ip))
	if err == nil {
		conn.Close()
	}
}

func formatPDUString(val interface{}) string {
	if val == nil {
		return ""
	}
	var s string
	switch v := val.(type) {
	case []byte:
		s = string(v)
	case string:
		s = v
	default:
		s = fmt.Sprintf("%v", v)
	}
	return strings.Trim(s, "\x00 \t\r\n")
}

func formatPDUInt(val interface{}) int64 {
	if val == nil {
		return 0
	}
	switch v := val.(type) {
	case int:
		return int64(v)
	case int64:
		return v
	case uint:
		return int64(v)
	case uint64:
		return int64(v)
	default:
		return 0
	}
}
