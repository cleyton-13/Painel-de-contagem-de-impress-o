package service

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
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

type SPXService struct{}

func (s *SPXService) Execute(args []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (ssec bool, errno uint32) {
	const cmdsAccepted = svc.AcceptStop | svc.AcceptShutdown
	changes <- svc.Status{State: svc.StartPending}

	cfg, err := config.LoadConfig()
	if err != nil {
		log.Printf("[SERVICE] Erro carregando configuracao: %v", err)
	}

	changes <- svc.Status{State: svc.Running, Accepts: cmdsAccepted}
	log.Println("[SERVICE] Servico SPX iniciado com sucesso.")

	updater.LimparBackups()

	// 1. Disparo de inicializacao com delay seguro para aguardar a rede e DHCP
	go func() {
		time.Sleep(20 * time.Second)
		ExecutarCicloCompleto(cfg)
	}()

	// 2. Ticker de verificacao a cada 30 segundos para disparar nos horarios configurados
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	ultimoMinutoExecutado := ""

	for {
		select {
		case <-ticker.C:
			agora := time.Now()
			horaMinuto := agora.Format("15:04")

			if horaMinuto != ultimoMinutoExecutado {
				for _, h := range cfg.HorariosDisparo {
					if strings.TrimSpace(h) == horaMinuto {
						ultimoMinutoExecutado = horaMinuto
						log.Printf("[SERVICE] Horario programado alcancado (%s). Iniciando ciclo...", horaMinuto)
						go ExecutarCicloCompleto(cfg)
						break
					}
				}
			}

		case c := <-r:
			switch c.Cmd {
			case svc.Interrogate:
				changes <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				log.Println("[SERVICE] Recebida ordem de parada...")
				changes <- svc.Status{State: svc.StopPending}
				return
			default:
				log.Printf("[SERVICE] Comando nao suportado: %d", c.Cmd)
			}
		}
	}
}

func ExecutarCicloCompleto(cfg *config.Config) {
	// Recarrega configuracoes caso tenha mudado
	if c, err := config.LoadConfig(); err == nil {
		cfg = c
	}

	// 1. Auto-Update
	if cfg.AutoUpdate {
		if atualizado, err := updater.VerificarEAtualizar(cfg); err == nil && atualizado {
			log.Println("[CYCLE] Agente atualizado com sucesso! Reiniciando servico para carregar nova versao...")
			os.Exit(0) // O Service Control Manager do Windows reiniciara o servico automaticamente na nova versao
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
		return fmt.Errorf("erro conectando ao Service Manager: %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(ServiceName)
	if err == nil {
		s.Close()
		return fmt.Errorf("servico %s ja existe", ServiceName)
	}

	// Registra para iniciar com atraso apos o boot (Automatic Delayed Start)
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

	// Configura recuperacao automatica caso o servico caia ou feche para auto-update
	recoveryActions := []mgr.RecoveryAction{
		{Type: mgr.ServiceRestart, Delay: 5 * time.Second},
		{Type: mgr.ServiceRestart, Delay: 10 * time.Second},
		{Type: mgr.ServiceRestart, Delay: 30 * time.Second},
	}
	_ = s.SetRecoveryActions(recoveryActions, 86400)

	_ = eventlog.InstallAsEventCreate(ServiceName, eventlog.Error|eventlog.Warning|eventlog.Info)

	log.Printf("[INSTALL] Servico %s instalado com sucesso!", ServiceName)
	return nil
}

func RemoveService() error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()

	s, err := m.OpenService(ServiceName)
	if err != nil {
		return fmt.Errorf("servico %s nao encontrado", ServiceName)
	}
	defer s.Close()

	_, _ = s.Control(svc.Stop)
	time.Sleep(1 * time.Second)

	err = s.Delete()
	if err != nil {
		return fmt.Errorf("erro deletando servico: %w", err)
	}

	_ = eventlog.Remove(ServiceName)
	log.Printf("[REMOVE] Servico %s removido com sucesso!", ServiceName)
	return nil
}

func StartService() error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()

	s, err := m.OpenService(ServiceName)
	if err != nil {
		return fmt.Errorf("servico %s nao encontrado: %w", ServiceName, err)
	}
	defer s.Close()

	err = s.Start()
	if err != nil {
		return fmt.Errorf("erro iniciando servico: %w", err)
	}
	log.Printf("[START] Servico %s iniciado!", ServiceName)
	return nil
}

func StopService() error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()

	s, err := m.OpenService(ServiceName)
	if err != nil {
		return fmt.Errorf("servico %s nao encontrado: %w", ServiceName, err)
	}
	defer s.Close()

	_, err = s.Control(svc.Stop)
	if err != nil {
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

func SetupLogger() {
	if exe, err := os.Executable(); err == nil {
		logDir := filepath.Dir(exe)
		logPath := filepath.Join(logDir, "spx-agent.log")

		// Rotaciona o log se ultrapassar 5 MB para manter operacao leve e segura
		if fi, err := os.Stat(logPath); err == nil && fi.Size() > 5*1024*1024 {
			oldLog := filepath.Join(logDir, "spx-agent.old.log")
			_ = os.Remove(oldLog)
			_ = os.Rename(logPath, oldLog)
		}

		if f, err := os.OpenFile(logPath, os.O_RDWR|os.O_CREATE|os.O_APPEND, 0666); err == nil {
			log.SetOutput(f)
			log.SetFlags(log.Ldate | log.Ltime)
		}
	}
}
