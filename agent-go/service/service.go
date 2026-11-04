package service

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/eventlog"
	"golang.org/x/sys/windows/svc/mgr"

	"spx-agent/collector"
	"spx-agent/config"
	"spx-agent/sender"
	"spx-agent/updater"
)

const ServiceName = "SPXAgentService"
const ServiceDisplayName = "SPX Impressoras BI - Agente Coletor"
const ServiceDescription = "Coleta automatica e paralela de contadores de impressoras e envio para o Painel BI."

const maxLogSizeBytes = 5 * 1024 * 1024 // 5 MB

var cicloEmAndamento atomic.Bool

type SPXService struct{}

func (s *SPXService) Execute(args []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (ssec bool, errno uint32) {
	const cmdsAccepted = svc.AcceptStop | svc.AcceptShutdown
	changes <- svc.Status{State: svc.StartPending}

	cfg, err := config.LoadConfig()
	if err != nil {
		log.Printf("[SERVICE] Aviso carregando configuracao inicial: %v", err)
		cfg = config.DefaultConfig()
	}

	changes <- svc.Status{State: svc.Running, Accepts: cmdsAccepted}
	log.Println("[SERVICE] Servico SPX iniciado com sucesso.")

	updater.LimparBackups()

	stopCh := make(chan struct{})

	// 1. Disparo de inicializacao com delay seguro para aguardar a rede e DHCP
	go func() {
		select {
		case <-time.After(20 * time.Second):
			ExecutarCicloCompleto(cfg)
		case <-stopCh:
			return
		}
	}()

	// 2. Ticker de verificacao a cada 25 segundos com controle por data+hora ("2006-01-02 15:04")
	// Garante execucao multi-dia mesmo quando ha apenas 1 horario configurado.
	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	slotsExecutados := make(map[string]bool)

	for {
		select {
		case <-ticker.C:
			// Recarrega configuracao para refletir alteracoes salvas na GUI sem precisar reiniciar o servico
			if reloaded, err := config.LoadConfig(); err == nil && reloaded != nil {
				cfg = reloaded
			}

			agora := time.Now()
			hoje := agora.Format("2006-01-02")
			horaMinuto := agora.Format("15:04")

			// Limpa registros de dias anteriores para manter mapa enxuto
			for slotKey := range slotsExecutados {
				if !strings.HasPrefix(slotKey, hoje) {
					delete(slotsExecutados, slotKey)
				}
			}

			for _, h := range cfg.HorariosDisparo {
				normH, ok := config.NormalizarHorario(h)
				if !ok {
					continue
				}
				slotKey := hoje + " " + normH
				if normH == horaMinuto && !slotsExecutados[slotKey] {
					slotsExecutados[slotKey] = true
					log.Printf("[SERVICE] Horario programado alcancado (%s). Iniciando ciclo...", slotKey)
					go ExecutarCicloCompleto(cfg)
					break
				}
			}

		case c := <-r:
			switch c.Cmd {
			case svc.Interrogate:
				changes <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				log.Println("[SERVICE] Recebida ordem de parada...")
				close(stopCh)
				changes <- svc.Status{State: svc.StopPending}
				return
			default:
				log.Printf("[SERVICE] Comando nao suportado: %d", c.Cmd)
			}
		}
	}
}

func ExecutarCicloCompleto(cfg *config.Config) {
	if !cicloEmAndamento.CompareAndSwap(false, true) {
		log.Println("[CYCLE] Ja existe um ciclo de coleta/envio em execucao. Pulando disparo concorrente.")
		return
	}
	defer cicloEmAndamento.Store(false)

	// Recarrega configuracoes caso tenham mudado em disco
	if c, err := config.LoadConfig(); err == nil && c != nil {
		cfg = c
	} else if cfg == nil {
		cfg = config.DefaultConfig()
	}

	// 1. Auto-Update
	if cfg.AutoUpdate {
		if atualizado, err := updater.VerificarEAtualizar(cfg, false); err == nil && atualizado {
			if IsWindowsService() {
				log.Println("[CYCLE] Agente atualizado com sucesso! Encerrando processo (codigo 1) para reinicio automatico pelo SCM...")
				os.Exit(1) // Codigo nao-zero aciona imediatamente as RecoveryActions do Windows Service
			}
			log.Println("[CYCLE] Binario atualizado com sucesso! A nova versao sera usada nas proximas execucoes.")
		} else if err != nil {
			log.Printf("[CYCLE] Aviso no auto-update (prosseguindo com coleta): %v", err)
		}
	}

	// 2. Coleta SNMP Paralela
	if len(cfg.Impressoras) == 0 {
		log.Println("[CYCLE] Nenhuma impressora cadastrada para coletar. Use a interface grafica para adicionar os IPs.")
		return
	}
	leituras := collector.ColetaParalela(cfg)

	// 3. Envio HTTP
	if err := sender.EnviarLeituras(cfg, leituras); err != nil {
		log.Printf("[CYCLE] Falha no envio das leituras: %v", err)
	} else {
		log.Println("[CYCLE] Ciclo de coleta e envio concluido com sucesso.")
	}
}

// Funcoes de Gerenciamento do Servico Windows (Install / Remove / Start / Stop)

func InstallService() error {
	exePath, err := os.Executable()
	if err != nil {
		return err
	}

	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("erro conectando ao Service Manager (execute como Administrador): %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(ServiceName)
	if err == nil {
		_ = s.Close()
		return nil // Idempotente caso ja esteja instalado
	}

	configService := mgr.Config{
		ServiceType:      16, // Win32OwnProcess
		StartType:        mgr.StartAutomatic,
		ErrorControl:     mgr.ErrorNormal,
		LoadOrderGroup:   "",
		TagId:            0,
		Dependencies:     []string{"Tcpip"},
		ServiceStartName: "", // LocalSystem
		DisplayName:      ServiceDisplayName,
		Description:      ServiceDescription,
		DelayedAutoStart: true,
	}

	s, err = m.CreateService(ServiceName, exePath, configService)
	if err != nil {
		return fmt.Errorf("erro criando servico: %w", err)
	}
	defer s.Close()

	// Configura recuperacao automatica caso o servico caia ou reinicie para auto-update
	recoveryActions := []mgr.RecoveryAction{
		{Type: mgr.ServiceRestart, Delay: 5 * time.Second},
		{Type: mgr.ServiceRestart, Delay: 10 * time.Second},
		{Type: mgr.ServiceRestart, Delay: 30 * time.Second},
	}
	_ = s.SetRecoveryActions(recoveryActions, 86400)
	_ = s.SetRecoveryActionsOnNonCrashFailures(true)

	_ = eventlog.InstallAsEventCreate(ServiceName, eventlog.Error|eventlog.Warning|eventlog.Info)

	log.Printf("[INSTALL] Servico %s instalado com sucesso!", ServiceName)
	return nil
}

func RemoveService() error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("erro conectando ao Service Manager (execute como Administrador): %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(ServiceName)
	if err != nil {
		return fmt.Errorf("servico %s nao encontrado", ServiceName)
	}
	defer s.Close()

	// Solicita parada e aguarda ate 10s pela finalizacao limpa antes de remover
	if status, err := s.Query(); err == nil && status.State != svc.Stopped {
		_, _ = s.Control(svc.Stop)
		for i := 0; i < 20; i++ {
			time.Sleep(500 * time.Millisecond)
			if st, qErr := s.Query(); qErr != nil || st.State == svc.Stopped {
				break
			}
		}
	}

	if err := s.Delete(); err != nil {
		return fmt.Errorf("erro deletando servico: %w", err)
	}

	_ = eventlog.Remove(ServiceName)
	log.Printf("[REMOVE] Servico %s removido com sucesso!", ServiceName)
	return nil
}

func StartService() error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("erro conectando ao Service Manager (execute como Administrador): %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(ServiceName)
	if err != nil {
		return fmt.Errorf("servico %s nao encontrado: %w", ServiceName, err)
	}
	defer s.Close()

	if st, qErr := s.Query(); qErr == nil && (st.State == svc.Running || st.State == svc.StartPending) {
		return nil
	}

	if err := s.Start(); err != nil {
		return fmt.Errorf("erro iniciando servico: %w", err)
	}
	log.Printf("[START] Servico %s iniciado!", ServiceName)
	return nil
}

func StopService() error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("erro conectando ao Service Manager (execute como Administrador): %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(ServiceName)
	if err != nil {
		return fmt.Errorf("servico %s nao encontrado: %w", ServiceName, err)
	}
	defer s.Close()

	if st, qErr := s.Query(); qErr == nil && st.State == svc.Stopped {
		return nil
	}

	if _, err := s.Control(svc.Stop); err != nil {
		return fmt.Errorf("erro parando servico: %w", err)
	}
	log.Printf("[STOP] Servico %s parado com sucesso!", ServiceName)
	return nil
}

func IsWindowsService() bool {
	isService, err := svc.IsWindowsService()
	if err != nil {
		return false
	}
	return isService
}

type rotatingLogWriter struct {
	mu      sync.Mutex
	logPath string
	oldPath string
	file    *os.File
	size    int64
}

func newRotatingLogWriter(logDir string) (*rotatingLogWriter, error) {
	w := &rotatingLogWriter{
		logPath: filepath.Join(logDir, "spx-agent.log"),
		oldPath: filepath.Join(logDir, "spx-agent.old.log"),
	}
	if err := w.openOrRotate(); err != nil {
		return nil, err
	}
	return w, nil
}

func (w *rotatingLogWriter) openOrRotate() error {
	if fi, err := os.Stat(w.logPath); err == nil {
		if fi.Size() >= maxLogSizeBytes {
			_ = os.Remove(w.oldPath)
			_ = os.Rename(w.logPath, w.oldPath)
		} else {
			w.size = fi.Size()
		}
	}
	f, err := os.OpenFile(w.logPath, os.O_RDWR|os.O_CREATE|os.O_APPEND, 0644)
	if err != nil {
		return err
	}
	w.file = f
	return nil
}

func (w *rotatingLogWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.file == nil {
		if err := w.openOrRotate(); err != nil {
			return 0, err
		}
	}

	if w.size+int64(len(p)) > maxLogSizeBytes {
		_ = w.file.Close()
		w.file = nil
		_ = os.Remove(w.oldPath)
		_ = os.Rename(w.logPath, w.oldPath)
		w.size = 0
		if err := w.openOrRotate(); err != nil {
			return 0, err
		}
	}

	n, err := w.file.Write(p)
	w.size += int64(n)
	return n, err
}

func SetupLogger() {
	if exe, err := os.Executable(); err == nil {
		logDir := filepath.Dir(exe)
		if writer, err := newRotatingLogWriter(logDir); err == nil {
			log.SetOutput(writer)
			log.SetFlags(log.Ldate | log.Ltime)
		}
	}
}
