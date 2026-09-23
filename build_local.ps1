$source = "\\192.168.68.162\DESENVOLVIMENTO\Painel de impressoras BI\Saida"
$target = "C:\temp\PainelBI"

Write-Host "1. Criando pasta temporaria..."
if (-not (Test-Path $target)) { New-Item -ItemType Directory -Path $target -Force }

Write-Host "2. Copiando arquivos (excluindo node_modules e .next)..."
robocopy $source $target /MIR /XD node_modules .next .git Logs_do_servidor /XF *.log /R:1 /W:1 /NDL /NFL /NJH /NJS

Set-Location $target

Write-Host "3. Instalando dependencias..."
npm install

Write-Host "4. Compilando o projeto..."
npx prisma generate
npm run build

if (Test-Path "$target\.next\BUILD_ID") {
    Write-Host "5. Build concluido! Copiando pasta .next de volta para o servidor..."
    robocopy "$target\.next" "$source\.next" /MIR /R:1 /W:1 /NDL /NFL /NJH /NJS
    Write-Host "Sucesso! Pode reiniciar o painel."
} else {
    Write-Host "ERRO NO BUILD!"
}
