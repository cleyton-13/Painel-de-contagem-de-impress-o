package main

import (
	"fmt"
	"log"
	"os"

	"golang.org/x/sys/windows/svc"

	"spx-agent/config"
	"spx-agent/service"
	"spx-agent/updater"
)

const Versao = "2.1.0"

func main() {
	// Se iniciado pelo Windows Service Manager (SCM), executa como servico
	if service.IsWindowsService() {
		service.SetupLogger()
		err := svc.Run(service.ServiceName, &service.SPXService{})
		if err != nil {
			log.Fatalf("Falha executando servico: %v", err)
		}
		return
	}

	// Execucao via Console / Linha de Comando (CLI)
	if len(os.Args) < 2 {
		printBanner()
		printAjuda()
		return
	}

	cmd := os.Args[1]

	switch cmd {
	case "run", "exec":
		printBanner()
		cfg, err := config.LoadConfig()
		if err != nil {
			fmt.Printf("Erro carregando config: %v\n", err)
			return
		}
		fmt.Printf("Unidade: %s\nServidor: %s\nImpressoras: %v\n\n", cfg.Unidade, cfg.ServidorBase, cfg.Impressoras)
		service.ExecutarCicloCompleto(cfg)

	case "update":
		printBanner()
		cfg, _ := config.LoadConfig()
		fmt.Println("Verificando se ha atualizacoes no servidor...")
		if atualizado, err := updater.VerificarEAtualizar(cfg); err != nil {
			fmt.Printf("Erro na verificacao: %v\n", err)
		} else if atualizado {
			fmt.Println("Agente atualizado com sucesso!")
		} else {
			fmt.Println("Voce ja esta usando a versao mais recente.")
		}

	case "service":
		if len(os.Args) < 3 {
			fmt.Println("Uso: spx-agent service [install|remove|start|stop]")
			return
		}
		sub := os.Args[2]
		switch sub {
		case "install":
			if err := service.InstallService(); err != nil {
				fmt.Printf("Erro: %v\n", err)
			} else {
				fmt.Println("Servico SPXAgentService instalado com sucesso! Inicializacao automatica habilitada.")
			}
		case "remove", "uninstall":
			if err := service.RemoveService(); err != nil {
				fmt.Printf("Erro: %v\n", err)
			} else {
				fmt.Println("Servico SPXAgentService removido com sucesso!")
			}
		case "start":
			if err := service.StartService(); err != nil {
				fmt.Printf("Erro: %v\n", err)
			} else {
				fmt.Println("Servico iniciado com sucesso!")
			}
		case "stop":
			if err := service.StopService(); err != nil {
				fmt.Printf("Erro: %v\n", err)
			} else {
				fmt.Println("Servico parado com sucesso!")
			}
		default:
			fmt.Printf("Subcomando desconhecido: %s\n", sub)
		}

	case "config":
		printBanner()
		cfg, _ := config.LoadConfig()
		fmt.Printf("Configuracao carregada de %s:\n", config.GetConfigPath())
		fmt.Printf("  Unidade:          %s\n", cfg.Unidade)
		fmt.Printf("  Servidor:         %s\n", cfg.ServidorBase)
		fmt.Printf("  Endpoint:         %s\n", cfg.EndpointIngestao)
		fmt.Printf("  Impressoras:      %v\n", cfg.Impressoras)
		fmt.Printf("  Horarios Disparo: %v\n", cfg.HorariosDisparo)
		fmt.Printf("  Auto-Update:      %v\n", cfg.AutoUpdate)

	case "version", "-v", "--version":
		fmt.Printf("SPX Agent v%s (Windows 64-bit)\n", Versao)

	default:
		printBanner()
		printAjuda()
	}
}

func printBanner() {
	fmt.Printf("====================================================\n")
	fmt.Printf("  SPX Impressoras BI - Agente Coletor v%s\n", Versao)
	fmt.Printf("====================================================\n\n")
}

func printAjuda() {
	fmt.Println("Comandos disponiveis:")
	fmt.Println("  spx-agent run              Executa um ciclo completo de coleta e envio no terminal")
	fmt.Println("  spx-agent config           Exibe as configuracoes ativas do agente")
	fmt.Println("  spx-agent update           Verifica e instala atualizacoes do servidor central")
	fmt.Println("  spx-agent service install  Instala o agente como Windows Service (inicializacao automatica)")
	fmt.Println("  spx-agent service remove   Remove o Windows Service")
	fmt.Println("  spx-agent service start    Inicia o Windows Service")
	fmt.Println("  spx-agent service stop     Para o Windows Service")
	fmt.Println("  spx-agent version          Exibe a versao atual do binario")
}
