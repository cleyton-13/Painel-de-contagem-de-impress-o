package gui

import (
	_ "embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

//go:embed spx_gui.ps1
var guiScript string

// AbrirTela inicializa a interface gráfica moderna (Windows Forms) para
// preenchimento dos dados das impressoras, testes de ping e configuração do servidor.
func AbrirTela() error {
	exePath, err := os.Executable()
	if err != nil {
		exePath = "spx-agent.exe"
	}
	baseDir := filepath.Dir(exePath)
	ps1Path := filepath.Join(baseDir, "spx_gui.ps1")

	// Prepend UTF-8 BOM so Windows PowerShell 5.1 always decodes characters properly
	bom := []byte{0xEF, 0xBB, 0xBF}
	scriptBytes := append(bom, []byte(guiScript)...)

	// Garante que o arquivo spx_gui.ps1 exista na pasta do executável
	if err := os.WriteFile(ps1Path, scriptBytes, 0644); err != nil {
		// Se não conseguir gravar na pasta local por permissão, grava no Temp
		ps1Path = filepath.Join(os.TempDir(), "spx_gui.ps1")
		_ = os.WriteFile(ps1Path, scriptBytes, 0644)
	}

	cmd := exec.Command("powershell.exe",
		"-NoProfile",
		"-ExecutionPolicy", "Bypass",
		"-Sta",
		"-WindowStyle", "Hidden",
		"-File", ps1Path,
		"-ExePath", exePath,
	)
	cmd.Dir = baseDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	fmt.Println("====================================================")
	fmt.Println("  SPX Impressoras BI - Assistente Visual (GUI)")
	fmt.Println("  Abrindo telas para preencher dados das impressoras...")
	fmt.Println("====================================================")

	return cmd.Run()
}
