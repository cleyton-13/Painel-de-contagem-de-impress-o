package collector

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"strconv"
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

type PrinterIdentity struct {
	Serial    string `json:"serial"`
	Modelo    string `json:"modelo"`
	UpdatedAt string `json:"updatedAt"`
}

const (
	OIDModelo         = "1.3.6.1.2.1.1.1.0"
	OIDModeloRFC      = "1.3.6.1.2.1.25.3.2.1.3.1"
	OIDSerial         = "1.3.6.1.2.1.43.5.1.1.17.1"
	OIDSerialBrother  = "1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.10.0"
	OIDPaginasTotal   = "1.3.6.1.2.1.43.10.2.1.4.1.1"
	OIDPaginasPB      = "1.3.6.1.4.1.18334.1.1.1.5.7.2.2.1.5.1.2"
	OIDPaginasPBFall  = "1.3.6.1.4.1.18334.1.1.1.5.7.2.3.1.5.1.2"
	OIDPaginasColor   = "1.3.6.1.4.1.18334.1.1.1.5.7.2.2.1.5.2.2"
	OIDPaginasColFall = "1.3.6.1.4.1.18334.1.1.1.5.7.2.3.1.5.1.1"

	maxConcurrentSNMP = 20
)

func getIdentityCachePath() string {
	return filepath.Join(filepath.Dir(config.GetConfigPath()), "cache_impressoras.json")
}

func loadIdentityCache() map[string]PrinterIdentity {
	cache := make(map[string]PrinterIdentity)
	data, err := os.ReadFile(getIdentityCachePath())
	if err != nil || len(data) == 0 {
		return cache
	}
	clean := bytes.TrimPrefix(data, []byte{0xEF, 0xBB, 0xBF})
	_ = json.Unmarshal(clean, &cache)
	return cache
}

func saveIdentityCache(cache map[string]PrinterIdentity) {
	if len(cache) == 0 {
		return
	}
	if data, err := json.MarshalIndent(cache, "", "  "); err == nil {
		_ = os.WriteFile(getIdentityCachePath(), data, 0644)
	}
}

// ColetaParalela consulta as impressoras em paralelo com semaforo controlado e cache local de identidade
func ColetaParalela(cfg *config.Config) []Leitura {
	var wg sync.WaitGroup
	var mu sync.Mutex
	var resultados []Leitura

	identities := loadIdentityCache()
	cacheDirty := false
	sem := make(chan struct{}, maxConcurrentSNMP)

	log.Printf("[COLLECTOR] Iniciando varredura paralela em %d impressora(s)...", len(cfg.Impressoras))
	inicio := time.Now()

	for _, ip := range cfg.Impressoras {
		ip = strings.TrimSpace(ip)
		if ip == "" || strings.HasPrefix(ip, "#") {
			continue
		}

		wg.Add(1)
		go func(targetIP string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			mu.Lock()
			known := identities[targetIP]
			mu.Unlock()

			leitura := consultarImpressora(targetIP, cfg, known)

			mu.Lock()
			if leitura.Status == "Online" {
				validSerial := leitura.Serial != "" && !strings.EqualFold(leitura.Serial, "N/A")
				validModelo := leitura.Modelo != "" && !strings.EqualFold(leitura.Modelo, "Desconhecido") && !strings.EqualFold(leitura.Modelo, "Erro SNMP")
				if validSerial || validModelo {
					updated := known
					if validSerial {
						updated.Serial = leitura.Serial
					}
					if validModelo {
						updated.Modelo = leitura.Modelo
					}
					updated.UpdatedAt = leitura.DataHora
					if updated != known {
						identities[targetIP] = updated
						cacheDirty = true
					}
				}
			}
			resultados = append(resultados, leitura)
			if leitura.Status == "Online" {
				log.Printf("[COLLECTOR] %s -> Modelo: %s | Serial: %s | Total: %d (PB: %d, Color: %d)", targetIP, leitura.Modelo, leitura.Serial, leitura.PaginasTotal, leitura.PaginasPB, leitura.PaginasColor)
			} else {
				log.Printf("[COLLECTOR] %s -> [OFFLINE] Serial: %s", targetIP, leitura.Serial)
			}
			mu.Unlock()
		}(ip)
	}

	wg.Wait()
	if cacheDirty {
		saveIdentityCache(identities)
	}

	duracao := time.Since(inicio)
	log.Printf("[COLLECTOR] Varredura concluida em %v. Total de leituras: %d", duracao, len(resultados))
	return resultados
}

func offlineReading(ip, dataHora, defaultModelo string, known PrinterIdentity) Leitura {
	serial := "N/A"
	if known.Serial != "" && !strings.EqualFold(known.Serial, "N/A") {
		serial = known.Serial
	}
	modelo := defaultModelo
	if known.Modelo != "" && !strings.EqualFold(known.Modelo, "Desconhecido") {
		modelo = known.Modelo
	}
	return Leitura{
		IP:       ip,
		Serial:   serial,
		Modelo:   modelo,
		DataHora: dataHora,
		Status:   "Offline",
	}
}

func isValidPDU(pdu gosnmp.SnmpPDU) bool {
	if pdu.Value == nil {
		return false
	}
	switch pdu.Type {
	case gosnmp.NoSuchObject, gosnmp.NoSuchInstance, gosnmp.EndOfMibView, gosnmp.Null:
		return false
	default:
		return true
	}
}

func getSingleOID(snmp *gosnmp.GoSNMP, oid string) (gosnmp.SnmpPDU, bool) {
	res, err := snmp.Get([]string{oid})
	if err != nil || res == nil || res.Error != gosnmp.NoError || len(res.Variables) == 0 {
		return gosnmp.SnmpPDU{}, false
	}
	pdu := res.Variables[0]
	if !isValidPDU(pdu) {
		return gosnmp.SnmpPDU{}, false
	}
	return pdu, true
}

func consultarImpressora(ip string, cfg *config.Config, known PrinterIdentity) Leitura {
	dataHora := time.Now().Format("2006-01-02 15:04:05")

	// Wake-up seguro na porta HTTP 80 (evita porta RAW 9100 que imprime lixo em termicas/JetDirect)
	acordarImpressora(ip)

	timeout := time.Duration(cfg.SNMPTimeoutSec) * time.Second
	if timeout <= 0 {
		timeout = 3 * time.Second
	}
	community := strings.TrimSpace(cfg.SNMPCommunity)
	if community == "" {
		community = "public"
	}

	snmp := &gosnmp.GoSNMP{
		Target:    ip,
		Port:      161,
		Community: community,
		Version:   gosnmp.Version2c,
		Timeout:   timeout,
		Retries:   2,
	}

	if err := snmp.Connect(); err != nil {
		return offlineReading(ip, dataHora, "Desconhecido", known)
	}
	defer func() {
		if snmp.Conn != nil {
			_ = snmp.Conn.Close()
		}
	}()

	// 1. Consulta OIDs padrao RFC (separados dos proprietarios Konica para nao quebrar SNMPv1 / outras marcas)
	rfcOIDs := []string{OIDModelo, OIDSerial, OIDPaginasTotal}
	res, err := snmp.Get(rfcOIDs)
	if err != nil || res == nil || res.Error != gosnmp.NoError {
		// Fallback para SNMPv1 consultando OIDs individualmente (em SNMPv1 um NoSuchName invalida o pacote inteiro)
		snmp.Version = gosnmp.Version1
		pduTotal, okTotal := getSingleOID(snmp, OIDPaginasTotal)
		pduMod, okMod := getSingleOID(snmp, OIDModelo)
		if !okTotal && !okMod {
			return offlineReading(ip, dataHora, "Erro SNMP", known)
		}
		var modelo, serial string
		var total int64
		if okMod {
			modelo = formatPDUString(pduMod.Value)
		}
		if okTotal {
			total = formatPDUInt(pduTotal.Value)
		}
		if pduSer, okSer := getSingleOID(snmp, OIDSerial); okSer {
			serial = formatPDUString(pduSer.Value)
		}
		return finalizeOnlineReading(snmp, ip, dataHora, modelo, serial, total, known)
	}

	var modelo, serial string
	var total int64
	gotAnything := false

	for _, pdu := range res.Variables {
		if !isValidPDU(pdu) {
			continue
		}
		gotAnything = true
		oidName := strings.TrimPrefix(pdu.Name, ".")
		switch {
		case strings.HasPrefix(oidName, OIDModelo):
			modelo = formatPDUString(pdu.Value)
		case strings.HasPrefix(oidName, OIDSerial):
			serial = formatPDUString(pdu.Value)
		case strings.HasPrefix(oidName, OIDPaginasTotal):
			total = formatPDUInt(pdu.Value)
		}
	}

	if !gotAnything {
		return offlineReading(ip, dataHora, "Erro SNMP", known)
	}

	return finalizeOnlineReading(snmp, ip, dataHora, modelo, serial, total, known)
}

func finalizeOnlineReading(
	snmp *gosnmp.GoSNMP,
	ip, dataHora, modelo, serial string,
	total int64,
	known PrinterIdentity,
) Leitura {
	// 2. Fallback de Modelo RFC Host-Resources MIB
	if modelo == "" || strings.EqualFold(modelo, "N/A") {
		if pduMod, ok := getSingleOID(snmp, OIDModeloRFC); ok {
			modelo = formatPDUString(pduMod.Value)
		}
	}

	// 3. Fallback de Serial especifico Brother MIB (comum em equipamentos Brother onde Printer-MIB vem vazio)
	if serial == "" || strings.EqualFold(serial, "N/A") {
		if pduBro, ok := getSingleOID(snmp, OIDSerialBrother); ok {
			serial = formatPDUString(pduBro.Value)
		}
	}

	// 4. Contadores proprietarios Konica Minolta (18334) â€” consultados apenas quando suportados pela MIB
	var pb, color int64
	pbSupported := false
	usedPBFallback := false

	if pduPB, ok := getSingleOID(snmp, OIDPaginasPB); ok {
		pb = formatPDUInt(pduPB.Value)
		pbSupported = true
	} else if pduPBFall, okFall := getSingleOID(snmp, OIDPaginasPBFall); okFall {
		pb = formatPDUInt(pduPBFall.Value)
		pbSupported = true
		usedPBFallback = true
	}

	if pduCol, ok := getSingleOID(snmp, OIDPaginasColor); ok {
		color = formatPDUInt(pduCol.Value)
	} else if usedPBFallback {
		// OIDPaginasColFall so e consultado na familia Konica 2.3.x quando OIDPaginasColor nao existe
		if pduColFall, okFall := getSingleOID(snmp, OIDPaginasColFall); okFall {
			color = formatPDUInt(pduColFall.Value)
		}
	}

	// 5. Salvaguardas contra contadores espelhados/invalidos (ex: Konica c3300i ou monocromaticas)
	if strings.Contains(strings.ToLower(modelo), "c3300i") && pb > 0 && pb == color {
		color = 0
	}
	if total > 0 && pb >= total && color > 0 {
		// Se PB ja alcanca 100% do odometro total, qualquer leitura em Color e espelhamento de MIB
		color = 0
	}

	// 6. Reconciliacao consistente de total / PB
	if total == 0 && (pb > 0 || color > 0) {
		total = pb + color
	}
	if !pbSupported && pb == 0 && color == 0 && total > 0 {
		pb = total
	}

	// Preserva Serial/Modelo do cache local caso o firmware responda contador mas omita string
	if serial == "" || strings.EqualFold(serial, "N/A") {
		if known.Serial != "" {
			serial = known.Serial
		} else {
			serial = "N/A"
		}
	}
	if modelo == "" {
		if known.Modelo != "" {
			modelo = known.Modelo
		} else {
			modelo = "Desconhecido"
		}
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
	// Probe TCP na porta 80 (interface web embarcada) com net.JoinHostPort compativel com IPv4/IPv6
	d := net.Dialer{Timeout: 600 * time.Millisecond}
	conn, err := d.Dial("tcp", net.JoinHostPort(ip, "80"))
	if err == nil {
		_ = conn.Close()
		time.Sleep(250 * time.Millisecond)
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
		if v < 0 {
			return 0
		}
		return int64(v)
	case int32:
		if v < 0 {
			return 0
		}
		return int64(v)
	case int64:
		if v < 0 {
			return 0
		}
		return v
	case uint:
		if uint64(v) > math.MaxInt64 {
			return math.MaxInt64
		}
		return int64(v)
	case uint32:
		return int64(v)
	case uint64:
		if v > math.MaxInt64 {
			return math.MaxInt64
		}
		return int64(v)
	case []byte:
		s := strings.Trim(string(v), "\x00 \t\r\n")
		if parsed, err := strconv.ParseInt(s, 10, 64); err == nil && parsed > 0 {
			return parsed
		}
		return 0
	case string:
		s := strings.TrimSpace(v)
		if parsed, err := strconv.ParseInt(s, 10, 64); err == nil && parsed > 0 {
			return parsed
		}
		return 0
	default:
		bi := gosnmp.ToBigInt(val)
		if bi != nil && bi.Sign() > 0 {
			if bi.Cmp(big.NewInt(math.MaxInt64)) > 0 {
				return math.MaxInt64
			}
			return bi.Int64()
		}
		return 0
	}
}
