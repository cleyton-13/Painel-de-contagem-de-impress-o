param(
    [string]$ExePath = ""
)

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

if (-not $ExePath) {
    $ExePath = Join-Path $PSScriptRoot "spx-agent.exe"
}
$baseDir = Split-Path -Parent $ExePath
if (-not (Test-Path $baseDir)) { $baseDir = $PSScriptRoot }

$cfgPath = Join-Path $baseDir "config.json"
$impPath = Join-Path $baseDir "impressoras.txt"

# Default config object
$cfg = [PSCustomObject]@{
    unidade = "Matriz"
    servidorBase = "http://localhost:3000"
    apiKey = "spx-secret-key-12345"
    snmpCommunity = "public"
    snmpTimeoutSec = 2
    horariosDisparo = @("08:00", "12:00", "18:00")
    impressoras = @()
}

if (Test-Path $cfgPath) {
    try {
        $raw = Get-Content $cfgPath -Raw -Encoding UTF8
        $loaded = $raw | ConvertFrom-Json
        if ($loaded.unidade) { $cfg.unidade = $loaded.unidade }
        if ($loaded.servidorBase) { $cfg.servidorBase = $loaded.servidorBase }
        if ($loaded.apiKey) { $cfg.apiKey = $loaded.apiKey }
        if ($loaded.snmpCommunity) { $cfg.snmpCommunity = $loaded.snmpCommunity }
        if ($loaded.snmpTimeoutSec) { $cfg.snmpTimeoutSec = $loaded.snmpTimeoutSec }
        if ($loaded.horariosDisparo) { $cfg.horariosDisparo = $loaded.horariosDisparo }
        if ($loaded.impressoras) { $cfg.impressoras = $loaded.impressoras }
    } catch { }
}

if (Test-Path $impPath) {
    $lines = Get-Content $impPath -Encoding UTF8 | ForEach-Object { $_.Trim().TrimStart([char]0xfeff) } | Where-Object { $_ -ne "" -and -not $_.StartsWith("#") }
    if ($lines.Count -gt 0) { $cfg.impressoras = @($lines) }
}

$xamlString = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="SPX Impressoras BI - Assistente do Agente"
        Height="730" Width="1040"
        MinHeight="650" MinWidth="880"
        WindowStartupLocation="CenterScreen"
        Background="#080C16"
        Foreground="#E2E8F0"
        FontFamily="Segoe UI, Inter, Arial">
    <Window.Resources>
        <!-- Modern Rounded Button Style -->
        <Style x:Key="ModernBtn" TargetType="Button">
            <Setter Property="Background" Value="#1E293B"/>
            <Setter Property="Foreground" Value="#F8FAFC"/>
            <Setter Property="FontWeight" Value="SemiBold"/>
            <Setter Property="FontSize" Value="12"/>
            <Setter Property="Padding" Value="14,8"/>
            <Setter Property="BorderThickness" Value="1"/>
            <Setter Property="BorderBrush" Value="#334155"/>
            <Setter Property="Cursor" Value="Hand"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border x:Name="border"
                                Background="{TemplateBinding Background}"
                                BorderBrush="{TemplateBinding BorderBrush}"
                                BorderThickness="{TemplateBinding BorderThickness}"
                                CornerRadius="8"
                                Padding="{TemplateBinding Padding}">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                        <ControlTemplate.Triggers>
                            <Trigger Property="IsMouseOver" Value="True">
                                <Setter TargetName="border" Property="Background" Value="#2D3B55"/>
                                <Setter TargetName="border" Property="BorderBrush" Value="#3B82F6"/>
                            </Trigger>
                            <Trigger Property="IsPressed" Value="True">
                                <Setter TargetName="border" Property="Background" Value="#1E293B"/>
                            </Trigger>
                            <Trigger Property="IsEnabled" Value="False">
                                <Setter TargetName="border" Property="Opacity" Value="0.45"/>
                            </Trigger>
                        </ControlTemplate.Triggers>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>

        <!-- Primary Action Button (Blue Accent) -->
        <Style x:Key="PrimaryBtn" TargetType="Button" BasedOn="{StaticResource ModernBtn}">
            <Setter Property="Background" Value="#2563EB"/>
            <Setter Property="BorderBrush" Value="#3B82F6"/>
            <Setter Property="Foreground" Value="#FFFFFF"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border x:Name="border"
                                Background="{TemplateBinding Background}"
                                BorderBrush="{TemplateBinding BorderBrush}"
                                BorderThickness="1"
                                CornerRadius="8"
                                Padding="{TemplateBinding Padding}">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                        <ControlTemplate.Triggers>
                            <Trigger Property="IsMouseOver" Value="True">
                                <Setter TargetName="border" Property="Background" Value="#1D4ED8"/>
                                <Setter TargetName="border" Property="BorderBrush" Value="#60A5FA"/>
                            </Trigger>
                            <Trigger Property="IsPressed" Value="True">
                                <Setter TargetName="border" Property="Background" Value="#1E40AF"/>
                            </Trigger>
                            <Trigger Property="IsEnabled" Value="False">
                                <Setter TargetName="border" Property="Opacity" Value="0.45"/>
                            </Trigger>
                        </ControlTemplate.Triggers>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>

        <!-- Success Button (Emerald) -->
        <Style x:Key="SuccessBtn" TargetType="Button" BasedOn="{StaticResource ModernBtn}">
            <Setter Property="Background" Value="#059669"/>
            <Setter Property="BorderBrush" Value="#10B981"/>
            <Setter Property="Foreground" Value="#FFFFFF"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border x:Name="border"
                                Background="{TemplateBinding Background}"
                                BorderBrush="{TemplateBinding BorderBrush}"
                                BorderThickness="1"
                                CornerRadius="8"
                                Padding="{TemplateBinding Padding}">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                        <ControlTemplate.Triggers>
                            <Trigger Property="IsMouseOver" Value="True">
                                <Setter TargetName="border" Property="Background" Value="#047857"/>
                            </Trigger>
                        </ControlTemplate.Triggers>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>

        <!-- Danger Button (Rose Red) -->
        <Style x:Key="DangerBtn" TargetType="Button" BasedOn="{StaticResource ModernBtn}">
            <Setter Property="Background" Value="#1E1622"/>
            <Setter Property="BorderBrush" Value="#881337"/>
            <Setter Property="Foreground" Value="#FDA4AF"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border x:Name="border"
                                Background="{TemplateBinding Background}"
                                BorderBrush="{TemplateBinding BorderBrush}"
                                BorderThickness="1"
                                CornerRadius="8"
                                Padding="{TemplateBinding Padding}">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                        <ControlTemplate.Triggers>
                            <Trigger Property="IsMouseOver" Value="True">
                                <Setter TargetName="border" Property="Background" Value="#991B1B"/>
                                <Setter TargetName="border" Property="BorderBrush" Value="#EF4444"/>
                                <Setter Property="Foreground" Value="#FFFFFF"/>
                            </Trigger>
                        </ControlTemplate.Triggers>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>

        <!-- Modern Input Style -->
        <Style x:Key="ModernTextBox" TargetType="TextBox">
            <Setter Property="Background" Value="#111827"/>
            <Setter Property="Foreground" Value="#F8FAFC"/>
            <Setter Property="CaretBrush" Value="#38BDF8"/>
            <Setter Property="BorderBrush" Value="#1F2937"/>
            <Setter Property="BorderThickness" Value="1"/>
            <Setter Property="Padding" Value="12,8"/>
            <Setter Property="FontSize" Value="13"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="TextBox">
                        <Border x:Name="border"
                                Background="{TemplateBinding Background}"
                                BorderBrush="{TemplateBinding BorderBrush}"
                                BorderThickness="{TemplateBinding BorderThickness}"
                                CornerRadius="8">
                            <ScrollViewer x:Name="PART_ContentHost" Margin="{TemplateBinding Padding}"/>
                        </Border>
                        <ControlTemplate.Triggers>
                            <Trigger Property="IsFocused" Value="True">
                                <Setter TargetName="border" Property="BorderBrush" Value="#3B82F6"/>
                                <Setter TargetName="border" Property="Background" Value="#0F172A"/>
                            </Trigger>
                        </ControlTemplate.Triggers>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>

        <!-- Modern Radio Tab Button Style -->
        <Style x:Key="NavTabBtn" TargetType="RadioButton">
            <Setter Property="Background" Value="Transparent"/>
            <Setter Property="Foreground" Value="#94A3B8"/>
            <Setter Property="FontSize" Value="13"/>
            <Setter Property="FontWeight" Value="SemiBold"/>
            <Setter Property="Padding" Value="18,10"/>
            <Setter Property="Cursor" Value="Hand"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="RadioButton">
                        <Border x:Name="tabBorder"
                                Background="{TemplateBinding Background}"
                                CornerRadius="8"
                                Padding="{TemplateBinding Padding}"
                                Margin="0,0,8,0">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                        <ControlTemplate.Triggers>
                            <Trigger Property="IsMouseOver" Value="True">
                                <Setter TargetName="tabBorder" Property="Background" Value="#1E293B"/>
                                <Setter Property="Foreground" Value="#E2E8F0"/>
                            </Trigger>
                            <Trigger Property="IsChecked" Value="True">
                                <Setter TargetName="tabBorder" Property="Background" Value="#2563EB"/>
                                <Setter Property="Foreground" Value="#FFFFFF"/>
                            </Trigger>
                        </ControlTemplate.Triggers>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>
    </Window.Resources>

    <Grid>
        <Grid.RowDefinitions>
            <!-- Header -->
            <RowDefinition Height="74"/>
            <!-- Nav Bar -->
            <RowDefinition Height="52"/>
            <!-- Content Area -->
            <RowDefinition Height="*"/>
            <!-- Console Area -->
            <RowDefinition Height="185"/>
        </Grid.RowDefinitions>

        <!-- HEADER -->
        <Border Grid.Row="0" Background="#0F172A" BorderBrush="#1E293B" BorderThickness="0,0,0,1" Padding="24,0">
            <Grid VerticalAlignment="Center">
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="Auto"/>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>

                <!-- Brand / Logo Area -->
                <StackPanel Grid.Column="0" Orientation="Horizontal" VerticalAlignment="Center">
                    <Border Background="#2563EB" CornerRadius="10" Width="40" Height="40" Margin="0,0,14,0">
                        <Path Fill="#FFFFFF" Stretch="Uniform" Width="20" Height="20" HorizontalAlignment="Center" VerticalAlignment="Center"
                              Data="M19 8h-1V3H6v5H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zM8 5h8v3H8V5zm8 12v2H8v-4h8v2zm2-2v-2H6v2H4v-4c0-.55.45-1 1-1h14c.55 0 1 .45 1 1v4h-2z"/>
                    </Border>
                    <StackPanel VerticalAlignment="Center">
                        <StackPanel Orientation="Horizontal">
                            <TextBlock Text="SPX Impressoras BI" FontSize="17" FontWeight="Bold" Foreground="#F8FAFC" Margin="0,0,8,0"/>
                            <Border Background="#1E293B" CornerRadius="4" Padding="6,2" VerticalAlignment="Center">
                                <TextBlock Text="v2.1 Enterprise" FontSize="10" FontWeight="SemiBold" Foreground="#94A3B8"/>
                            </Border>
                        </StackPanel>
                        <TextBlock Text="Agente Autonomo de Telemetria e Monitoramento SNMP" FontSize="11" Foreground="#64748B"/>
                    </StackPanel>
                </StackPanel>

                <!-- Service Status Pill -->
                <StackPanel Grid.Column="1" HorizontalAlignment="Center" Orientation="Horizontal" VerticalAlignment="Center">
                    <Border x:Name="pnlServicePill" Background="#132320" BorderBrush="#065F46" BorderThickness="1" CornerRadius="20" Padding="14,6">
                        <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
                            <Ellipse x:Name="dotServiceStatus" Width="8" Height="8" Fill="#10B981" Margin="0,0,8,0"/>
                            <TextBlock x:Name="lblServiceStatus" Text="SERVICO: VERIFICANDO..." FontSize="11" FontWeight="Bold" Foreground="#34D399"/>
                        </StackPanel>
                    </Border>
                </StackPanel>

                <!-- Main Fast Action -->
                <StackPanel Grid.Column="2" Orientation="Horizontal" VerticalAlignment="Center">
                    <Button x:Name="btnFastRun" Content="EXECUTAR COLETA AGORA" Style="{StaticResource PrimaryBtn}" Padding="20,10"/>
                </StackPanel>
            </Grid>
        </Border>

        <!-- NAV BAR / TABS -->
        <Border Grid.Row="1" Background="#0C1222" BorderBrush="#1E293B" BorderThickness="0,0,0,1" Padding="24,0">
            <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
                <RadioButton x:Name="tabBtnImpressoras" Content="Impressoras (IPs)" Style="{StaticResource NavTabBtn}" IsChecked="True"/>
                <RadioButton x:Name="tabBtnServidor" Content="Servidor e Filial" Style="{StaticResource NavTabBtn}"/>
                <RadioButton x:Name="tabBtnServico" Content="Servico Windows" Style="{StaticResource NavTabBtn}"/>
            </StackPanel>
        </Border>

        <!-- MAIN CONTENT PANELS (Tabs Swapped via Visibility) -->
        <Grid Grid.Row="2" Margin="24,18">
            <!-- TAB 1: IMPRESSORAS -->
            <Grid x:Name="panelImpressoras" Visibility="Visible">
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="330"/>
                </Grid.ColumnDefinitions>

                <!-- Left: Big IP Editor Card -->
                <Border Grid.Column="0" Background="#0F172A" BorderBrush="#1E293B" BorderThickness="1" CornerRadius="12" Padding="22" Margin="0,0,16,0">
                    <Grid>
                        <Grid.RowDefinitions>
                            <RowDefinition Height="Auto"/>
                            <RowDefinition Height="Auto"/>
                            <RowDefinition Height="*"/>
                            <RowDefinition Height="Auto"/>
                        </Grid.RowDefinitions>

                        <DockPanel Grid.Row="0" Margin="0,0,0,6">
                            <StackPanel Orientation="Horizontal" DockPanel.Dock="Left">
                                <TextBlock Text="Lista de Enderecos IP das Impressoras" FontSize="14" FontWeight="Bold" Foreground="#F8FAFC"/>
                            </StackPanel>
                            <Border DockPanel.Dock="Right" Background="#1E293B" CornerRadius="6" Padding="8,4">
                                <TextBlock x:Name="lblIpsCount" Text="0 impressoras cadastradas" FontSize="11" FontWeight="SemiBold" Foreground="#38BDF8"/>
                            </Border>
                        </DockPanel>

                        <TextBlock Grid.Row="1" Text="Insira um endereco IPv4 por linha ou separados por virgula. Linhas iniciadas com '#' serao ignoradas."
                                   FontSize="11" Foreground="#64748B" Margin="0,0,0,12"/>

                        <!-- Multiline TextBox for IPs -->
                        <TextBox x:Name="txtIpsBox" Grid.Row="2" Style="{StaticResource ModernTextBox}"
                                 AcceptsReturn="True" VerticalScrollBarVisibility="Auto" FontFamily="Consolas, monospace" FontSize="13"
                                 TextWrapping="Wrap" Margin="0,0,0,14"/>

                        <DockPanel Grid.Row="3">
                            <Button x:Name="btnLimparIps" Content="Limpar Lista" Style="{StaticResource DangerBtn}" DockPanel.Dock="Left"/>
                            <Button x:Name="btnSalvarImp" Content="Salvar Lista de Impressoras" Style="{StaticResource SuccessBtn}" DockPanel.Dock="Right" Padding="22,9"/>
                        </DockPanel>
                    </Grid>
                </Border>

                <!-- Right: Quick Diagnostics Card -->
                <Border Grid.Column="1" Background="#0F172A" BorderBrush="#1E293B" BorderThickness="1" CornerRadius="12" Padding="22">
                    <StackPanel>
                        <TextBlock Text="Diagnostico de Rede Local" FontSize="14" FontWeight="Bold" Foreground="#F8FAFC" Margin="0,0,0,6"/>
                        <TextBlock Text="Teste a comunicacao ICMP (Ping) diretamente da maquina para as impressoras cadastradas."
                                   FontSize="11" Foreground="#64748B" TextWrapping="Wrap" Margin="0,0,0,18"/>

                        <Button x:Name="btnPingSel" Content="Testar IP Selecionado / Linha Atual" Style="{StaticResource ModernBtn}"
                                HorizontalAlignment="Stretch" Margin="0,0,0,12"/>

                        <Button x:Name="btnPingAll" Content="Testar Todas as Impressoras" Style="{StaticResource ModernBtn}"
                                HorizontalAlignment="Stretch" Margin="0,0,0,20"/>

                        <Border Background="#111827" BorderBrush="#1F2937" BorderThickness="1" CornerRadius="10" Padding="14" Margin="0,0,0,12">
                            <StackPanel>
                                <TextBlock Text="Dica Operacional" FontWeight="Bold" FontSize="11" Foreground="#94A3B8" Margin="0,0,0,4"/>
                                <TextBlock Text="Se o status for OFFLINE, certifique-se de que a impressora esta ligada, com o cabo de rede conectado e no mesmo segmento do agente."
                                           FontSize="11" Foreground="#64748B" TextWrapping="Wrap"/>
                            </StackPanel>
                        </Border>
                    </StackPanel>
                </Border>
            </Grid>

            <!-- TAB 2: SERVIDOR & FILIAL -->
            <Grid x:Name="panelServidor" Visibility="Collapsed">
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="*"/>
                </Grid.ColumnDefinitions>

                <!-- Left: Conexao Card -->
                <Border Grid.Column="0" Background="#0F172A" BorderBrush="#1E293B" BorderThickness="1" CornerRadius="12" Padding="22" Margin="0,0,16,0">
                    <StackPanel>
                        <TextBlock Text="Identificacao e Servidor Central" FontSize="14" FontWeight="Bold" Foreground="#F8FAFC" Margin="0,0,0,4"/>
                        <TextBlock Text="Configure a identificacao desta unidade e o endereco do painel central." FontSize="11" Foreground="#64748B" Margin="0,0,0,18"/>

                        <TextBlock Text="Nome da Unidade / Filial:" FontSize="12" FontWeight="SemiBold" Foreground="#CBD5E1" Margin="0,0,0,6"/>
                        <TextBox x:Name="txtUnidade" Style="{StaticResource ModernTextBox}" Margin="0,0,0,14"/>

                        <TextBlock Text="URL Base do Servidor Central (BI):" FontSize="12" FontWeight="SemiBold" Foreground="#CBD5E1" Margin="0,0,0,6"/>
                        <TextBox x:Name="txtSrvBase" Style="{StaticResource ModernTextBox}" Margin="0,0,0,14"/>

                        <TextBlock Text="Chave de Autenticacao (API Key):" FontSize="12" FontWeight="SemiBold" Foreground="#CBD5E1" Margin="0,0,0,20"/>
                        <TextBox x:Name="txtApiKey" Style="{StaticResource ModernTextBox}" Margin="0,0,0,20"/>

                        <StackPanel Orientation="Horizontal">
                            <Button x:Name="btnTestSrv" Content="Testar Conexao com Servidor" Style="{StaticResource ModernBtn}" Margin="0,0,12,0"/>
                            <Button x:Name="btnSalvarSrv" Content="Salvar Parametros" Style="{StaticResource SuccessBtn}" Padding="22,9"/>
                        </StackPanel>
                    </StackPanel>
                </Border>

                <!-- Right: SNMP & Disparos Card -->
                <Border Grid.Column="1" Background="#0F172A" BorderBrush="#1E293B" BorderThickness="1" CornerRadius="12" Padding="22">
                    <StackPanel>
                        <TextBlock Text="Protocolo SNMP e Agendamentos" FontSize="14" FontWeight="Bold" Foreground="#F8FAFC" Margin="0,0,0,4"/>
                        <TextBlock Text="Ajustes de comunicacao MIB e horarios de sincronizacao." FontSize="11" Foreground="#64748B" Margin="0,0,0,18"/>

                        <TextBlock Text="Comunidade SNMP (Padrao: public):" FontSize="12" FontWeight="SemiBold" Foreground="#CBD5E1" Margin="0,0,0,6"/>
                        <TextBox x:Name="txtSnmpComm" Style="{StaticResource ModernTextBox}" Margin="0,0,0,14"/>

                        <TextBlock Text="Timeout SNMP em Segundos (Padrao: 2):" FontSize="12" FontWeight="SemiBold" Foreground="#CBD5E1" Margin="0,0,0,6"/>
                        <TextBox x:Name="txtSnmpTimeout" Style="{StaticResource ModernTextBox}" Margin="0,0,0,14"/>

                        <TextBlock Text="Horarios de Disparo Automatico (separados por virgula):" FontSize="12" FontWeight="SemiBold" Foreground="#CBD5E1" Margin="0,0,0,6"/>
                        <TextBox x:Name="txtHorarios" Style="{StaticResource ModernTextBox}" Margin="0,0,0,20"/>
                    </StackPanel>
                </Border>
            </Grid>

            <!-- TAB 3: SERVICO WINDOWS -->
            <Grid x:Name="panelServico" Visibility="Collapsed">
                <Border Background="#0F172A" BorderBrush="#1E293B" BorderThickness="1" CornerRadius="12" Padding="24">
                    <Grid>
                        <Grid.RowDefinitions>
                            <RowDefinition Height="Auto"/>
                            <RowDefinition Height="Auto"/>
                            <RowDefinition Height="Auto"/>
                            <RowDefinition Height="*"/>
                        </Grid.RowDefinitions>

                        <TextBlock Grid.Row="0" Text="Gerenciamento do Servico em Segundo Plano (Windows Service)" FontSize="15" FontWeight="Bold" Foreground="#F8FAFC" Margin="0,0,0,4"/>
                        <TextBlock Grid.Row="1" Text="O servico SPXAgentService executa de forma autonoma e silenciosa, inicializando junto ao Windows." FontSize="12" Foreground="#64748B" Margin="0,0,0,22"/>

                        <Border Grid.Row="2" Background="#111827" BorderBrush="#1F2937" BorderThickness="1" CornerRadius="10" Padding="18" Margin="0,0,0,24">
                            <DockPanel>
                                <StackPanel DockPanel.Dock="Left" VerticalAlignment="Center">
                                    <TextBlock Text="Status Atual do Servico:" FontSize="12" Foreground="#94A3B8" Margin="0,0,0,4"/>
                                    <TextBlock x:Name="lblSvcDetail" Text="SPXAgentService: Nao Instalado" FontSize="16" FontWeight="Bold" Foreground="#F8FAFC"/>
                                </StackPanel>
                                <Button x:Name="btnRefreshSvc" Content="Atualizar Status" Style="{StaticResource ModernBtn}" DockPanel.Dock="Right" VerticalAlignment="Center"/>
                            </DockPanel>
                        </Border>

                        <StackPanel Grid.Row="3" Orientation="Horizontal" VerticalAlignment="Top">
                            <Button x:Name="btnSvcInstall" Content="Instalar e Iniciar Servico" Style="{StaticResource SuccessBtn}" Padding="22,12" Margin="0,0,12,0"/>
                            <Button x:Name="btnSvcStop" Content="Parar Servico" Style="{StaticResource ModernBtn}" Padding="18,12" Margin="0,0,12,0"/>
                            <Button x:Name="btnSvcRemove" Content="Desinstalar Servico" Style="{StaticResource DangerBtn}" Padding="18,12"/>
                        </StackPanel>
                    </Grid>
                </Border>
            </Grid>
        </Grid>

        <!-- CONSOLE / TERMINAL (Real-time logs) -->
        <Border Grid.Row="3" Background="#060911" BorderBrush="#1E293B" BorderThickness="0,1,0,0" Padding="24,12,24,16">
            <Grid>
                <Grid.RowDefinitions>
                    <RowDefinition Height="Auto"/>
                    <RowDefinition Height="*"/>
                </Grid.RowDefinitions>

                <DockPanel Grid.Row="0" Margin="0,0,0,8">
                    <StackPanel Orientation="Horizontal" DockPanel.Dock="Left" VerticalAlignment="Center">
                        <TextBlock Text="Console de Operacoes e Eventos" FontSize="11" FontWeight="Bold" Foreground="#64748B"/>
                    </StackPanel>
                    <Button x:Name="btnLimparConsole" Content="Limpar Console" Style="{StaticResource ModernBtn}" DockPanel.Dock="Right" Padding="10,4" FontSize="11"/>
                </DockPanel>

                <Border Grid.Row="1" Background="#030712" BorderBrush="#111827" BorderThickness="1" CornerRadius="8">
                    <TextBox x:Name="txtConsole" Background="Transparent" Foreground="#38BDF8" BorderThickness="0"
                             FontFamily="Consolas, Cascadia Code, monospace" FontSize="11.5"
                             IsReadOnly="True" AcceptsReturn="True" VerticalScrollBarVisibility="Auto" Padding="12,8"/>
                </Border>
            </Grid>
        </Border>
    </Grid>
</Window>
'@

$stringReader = [System.IO.StringReader]::new($xamlString)
$xmlReader = [System.Xml.XmlReader]::Create($stringReader)
$window = [System.Windows.Markup.XamlReader]::Load($xmlReader)

# Wire elements by name
$lblServiceStatus = $window.FindName("lblServiceStatus")
$dotServiceStatus = $window.FindName("dotServiceStatus")
$pnlServicePill = $window.FindName("pnlServicePill")
$btnFastRun = $window.FindName("btnFastRun")

$tabBtnImpressoras = $window.FindName("tabBtnImpressoras")
$tabBtnServidor = $window.FindName("tabBtnServidor")
$tabBtnServico = $window.FindName("tabBtnServico")

$panelImpressoras = $window.FindName("panelImpressoras")
$panelServidor = $window.FindName("panelServidor")
$panelServico = $window.FindName("panelServico")

$lblIpsCount = $window.FindName("lblIpsCount")
$txtIpsBox = $window.FindName("txtIpsBox")
$btnSalvarImp = $window.FindName("btnSalvarImp")
$btnLimparIps = $window.FindName("btnLimparIps")
$btnPingSel = $window.FindName("btnPingSel")
$btnPingAll = $window.FindName("btnPingAll")

$txtUnidade = $window.FindName("txtUnidade")
$txtSrvBase = $window.FindName("txtSrvBase")
$txtApiKey = $window.FindName("txtApiKey")
$btnTestSrv = $window.FindName("btnTestSrv")
$btnSalvarSrv = $window.FindName("btnSalvarSrv")

$txtSnmpComm = $window.FindName("txtSnmpComm")
$txtSnmpTimeout = $window.FindName("txtSnmpTimeout")
$txtHorarios = $window.FindName("txtHorarios")

$lblSvcDetail = $window.FindName("lblSvcDetail")
$btnRefreshSvc = $window.FindName("btnRefreshSvc")
$btnSvcInstall = $window.FindName("btnSvcInstall")
$btnSvcStop = $window.FindName("btnSvcStop")
$btnSvcRemove = $window.FindName("btnSvcRemove")

$btnLimparConsole = $window.FindName("btnLimparConsole")
$txtConsole = $window.FindName("txtConsole")

# Setup initial values
$txtUnidade.Text = [string]$cfg.unidade
$txtSrvBase.Text = [string]$cfg.servidorBase
$txtApiKey.Text = [string]$cfg.apiKey
$txtSnmpComm.Text = [string]$cfg.snmpCommunity
$txtSnmpTimeout.Text = [string]$cfg.snmpTimeoutSec
$txtHorarios.Text = ($cfg.horariosDisparo -join ", ")
$txtIpsBox.Text = ($cfg.impressoras -join "`r`n")

# Event Functions
function Log-Msg([string]$msg, [string]$tipo = "INFO") {
    $ts = (Get-Date).ToString("HH:mm:ss")
    $txtConsole.AppendText("[$ts][$tipo] $msg`r`n")
    $txtConsole.ScrollToEnd()
}

function AtualizarContadorIps {
    $linhas = $txtIpsBox.Text -split "[\r\n,;]+" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" -and -not $_.StartsWith("#") }
    $c = $linhas.Count
    if ($c -eq 1) {
        $lblIpsCount.Text = "1 impressora configurada"
    } else {
        $lblIpsCount.Text = "$c impressoras configuradas"
    }
}
AtualizarContadorIps

$txtIpsBox.Add_TextChanged({ AtualizarContadorIps })

# Tab navigation
$tabBtnImpressoras.Add_Checked({
    $panelImpressoras.Visibility = [System.Windows.Visibility]::Visible
    $panelServidor.Visibility = [System.Windows.Visibility]::Collapsed
    $panelServico.Visibility = [System.Windows.Visibility]::Collapsed
})

$tabBtnServidor.Add_Checked({
    $panelImpressoras.Visibility = [System.Windows.Visibility]::Collapsed
    $panelServidor.Visibility = [System.Windows.Visibility]::Visible
    $panelServico.Visibility = [System.Windows.Visibility]::Collapsed
})

$tabBtnServico.Add_Checked({
    $panelImpressoras.Visibility = [System.Windows.Visibility]::Collapsed
    $panelServidor.Visibility = [System.Windows.Visibility]::Collapsed
    $panelServico.Visibility = [System.Windows.Visibility]::Visible
    AtualizarStatusServico
})

function AtualizarStatusServico {
    $svc = Get-Service -Name "SPXAgentService" -ErrorAction SilentlyContinue
    if ($null -eq $svc) {
        $lblServiceStatus.Text = "SERVICO: NAO INSTALADO"
        $lblServiceStatus.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#94A3B8")
        $dotServiceStatus.Fill = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#64748B")
        $pnlServicePill.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#1E293B")
        $pnlServicePill.BorderBrush = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#334155")
        $lblSvcDetail.Text = "SPXAgentService: Nao Instalado neste computador"
        $lblSvcDetail.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#94A3B8")
    } elseif ($svc.Status -eq "Running") {
        $lblServiceStatus.Text = "SERVICO: EM EXECUCAO"
        $lblServiceStatus.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#34D399")
        $dotServiceStatus.Fill = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#10B981")
        $pnlServicePill.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#064E3B")
        $pnlServicePill.BorderBrush = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#059669")
        $lblSvcDetail.Text = "SPXAgentService: Em Execucao Automatica (Ativo)"
        $lblSvcDetail.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#34D399")
    } else {
        $lblServiceStatus.Text = "SERVICO: PARADO"
        $lblServiceStatus.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#FBBF24")
        $dotServiceStatus.Fill = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#F59E0B")
        $pnlServicePill.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#451A03")
        $pnlServicePill.BorderBrush = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#B45309")
        $lblSvcDetail.Text = "SPXAgentService: Parado"
        $lblSvcDetail.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#FBBF24")
    }
}

function SalvarTudo([bool]$notificar = $true) {
    $ips = $txtIpsBox.Text -split "[\r\n,;]+" | ForEach-Object { $_.Trim().TrimStart([char]0xfeff) } | Where-Object { $_ -ne "" -and -not $_.StartsWith("#") }
    $cfg.unidade = $txtUnidade.Text.Trim()
    $cfg.servidorBase = $txtSrvBase.Text.Trim()
    $cfg.apiKey = $txtApiKey.Text.Trim()
    $cfg.snmpCommunity = $txtSnmpComm.Text.Trim()
    $cfg.impressoras = @($ips)

    $toNum = 2
    if ([int]::TryParse($txtSnmpTimeout.Text.Trim(), [ref]$toNum)) { $cfg.snmpTimeoutSec = $toNum }

    $hrs = $txtHorarios.Text -split "[,;]+" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
    if ($hrs.Count -gt 0) { $cfg.horariosDisparo = @($hrs) }

    $jsonContent = $cfg | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($cfgPath, $jsonContent, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllLines($impPath, $ips, [System.Text.Encoding]::UTF8)

    $u = [string]$cfg.unidade
    $c = $ips.Count
    Log-Msg "Configuracoes gravadas com sucesso: Unidade '$u', $c impressora(s)." "SUCESSO"
    if ($notificar) {
        [System.Windows.MessageBox]::Show("Configuracoes e lista de impressoras salvas com sucesso!", "Salvo com Sucesso", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Information)
    }
}

$btnSalvarImp.Add_Click({ SalvarTudo $true })
$btnSalvarSrv.Add_Click({ SalvarTudo $true })
$btnLimparConsole.Add_Click({ $txtConsole.Clear() })

$btnLimparIps.Add_Click({
    $res = [System.Windows.MessageBox]::Show("Deseja realmente limpar toda a lista de impressoras?", "Confirmar Limpeza", [System.Windows.MessageBoxButton]::YesNo, [System.Windows.MessageBoxImage]::Question)
    if ($res -eq [System.Windows.MessageBoxResult]::Yes) {
        $txtIpsBox.Clear()
        AtualizarContadorIps
        Log-Msg "Lista de IPs limpa pelo usuario." "AVISO"
    }
})

$btnPingSel.Add_Click({
    $targetIp = ""
    if ($txtIpsBox.SelectionLength -gt 0) {
        $targetIp = $txtIpsBox.SelectedText.Trim()
    }
    if (-not $targetIp) {
        $lineIdx = $txtIpsBox.GetLineIndexFromCharacterIndex($txtIpsBox.CaretIndex)
        if ($lineIdx -ge 0 -and $lineIdx -lt $txtIpsBox.LineCount) {
            $targetIp = $txtIpsBox.GetLineText($lineIdx).Trim()
        }
    }
    if (-not $targetIp -or $targetIp.StartsWith("#")) {
        $linhas = $txtIpsBox.Text -split "[\r\n,;]+" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" -and -not $_.StartsWith("#") }
        if ($linhas.Count -gt 0) { $targetIp = $linhas[0] }
    }
    if (-not $targetIp) {
        Log-Msg "Nenhum IP valido encontrado para ping." "AVISO"
        return
    }
    $ip = $targetIp
    Log-Msg "Disparando ping de diagnostico para $ip..."
    $res = Test-Connection -ComputerName $ip -Count 2 -Quiet -ErrorAction SilentlyContinue
    if ($res) {
        Log-Msg "Impressora $ip respondeu ao ping com sucesso." "SUCESSO"
        [System.Windows.MessageBox]::Show("Impressora $ip online e respondendo!", "Ping OK", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Information)
    } else {
        Log-Msg "Impressora $ip NAO respondeu na rede local." "ERRO"
        [System.Windows.MessageBox]::Show("A impressora $ip nao respondeu.`nVerifique se o equipamento esta ligado e conectado ao cabo de rede.", "Falha no Ping", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Warning)
    }
})

$btnPingAll.Add_Click({
    $linhas = $txtIpsBox.Text -split "[\r\n,;]+" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" -and -not $_.StartsWith("#") }
    if ($linhas.Count -eq 0) {
        Log-Msg "Nenhuma impressora configurada para testar." "AVISO"
        return
    }
    Log-Msg "Varrendo conectividade de " + $linhas.Count + " impressora(s)..."
    $ok = 0
    foreach ($ip in $linhas) {
        $res = Test-Connection -ComputerName $ip -Count 1 -Quiet -ErrorAction SilentlyContinue
        if ($res) {
            Log-Msg "  [ONLINE]  $ip" "SUCESSO"
            $ok++
        } else {
            Log-Msg "  [OFFLINE] $ip (sem resposta)" "ERRO"
        }
    }
    Log-Msg "Teste finalizado: $ok de " + $linhas.Count + " impressoras online." "INFO"
})

$btnTestSrv.Add_Click({
    $url = $txtSrvBase.Text.Trim() + "/api/agente/versao"
    Log-Msg "Testando conexao com servidor central em $url..."
    try {
        $res = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 8 -ErrorAction Stop
        Log-Msg "Conexao com servidor OK! Versao remota: " + $res.versao "SUCESSO"
        [System.Windows.MessageBox]::Show("Conectividade estabelecida com sucesso com o servidor central!`nVersao do servidor: " + $res.versao, "Servidor Conectado", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Information)
    } catch {
        Log-Msg "Falha ao contatar servidor central: $_" "ERRO"
        [System.Windows.MessageBox]::Show("Nao foi possivel alcancar o servidor em $url.`nVerifique se o painel esta rodando e acessivel.", "Erro de Conexao", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Error)
    }
})

$btnFastRun.Add_Click({
    SalvarTudo $false
    Log-Msg "Iniciando ciclo de varredura SNMP e envio imediato..."
    if (-not (Test-Path $ExePath)) {
        Log-Msg "Executavel nao encontrado em: $ExePath" "ERRO"
        return
    }

    $btnFastRun.IsEnabled = $false
    $btnFastRun.Content = "COLETANDO CONTADORES..."

    $tempOut = Join-Path $baseDir "exec_temp.log"
    $tempErr = Join-Path $baseDir "exec_err.log"

    $proc = Start-Process -FilePath $ExePath -ArgumentList "run" -NoNewWindow -PassThru -RedirectStandardOutput $tempOut -RedirectStandardError $tempErr
    $proc.WaitForExit(35000)

    if (Test-Path $tempOut) {
        $out = Get-Content $tempOut -Raw -Encoding UTF8
        if ($out.Trim()) { Log-Msg $out.Trim() "INFO" }
        Remove-Item $tempOut -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path $tempErr) {
        $err = Get-Content $tempErr -Raw -Encoding UTF8
        if ($err.Trim()) { Log-Msg $err.Trim() "ERRO" }
        Remove-Item $tempErr -Force -ErrorAction SilentlyContinue
    }

    $btnFastRun.IsEnabled = $true
    $btnFastRun.Content = "EXECUTAR COLETA AGORA"
    Log-Msg "Ciclo de coleta finalizado com codigo de saida: " + $proc.ExitCode "SUCESSO"
})

$btnRefreshSvc.Add_Click({
    AtualizarStatusServico
    Log-Msg "Status do servico SPXAgentService atualizado." "INFO"
})

$btnSvcInstall.Add_Click({
    SalvarTudo $false
    Log-Msg "Instalando servico SPXAgentService no Windows..."
    Start-Process -FilePath $ExePath -ArgumentList "service install" -NoNewWindow -Wait
    Start-Process -FilePath $ExePath -ArgumentList "service start" -NoNewWindow -Wait
    AtualizarStatusServico
    Log-Msg "Servico instalado e iniciado com sucesso!" "SUCESSO"
    [System.Windows.MessageBox]::Show("Servico Windows SPXAgentService instalado e rodando em segundo plano!", "Servico Instalado", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Information)
})

$btnSvcStop.Add_Click({
    Log-Msg "Parando servico SPXAgentService..."
    Start-Process -FilePath $ExePath -ArgumentList "service stop" -NoNewWindow -Wait
    AtualizarStatusServico
    Log-Msg "Servico parado." "AVISO"
})

$btnSvcRemove.Add_Click({
    $res = [System.Windows.MessageBox]::Show("Tem certeza que deseja desinstalar o servico Windows do agente?", "Confirmar Remocao", [System.Windows.MessageBoxButton]::YesNo, [System.Windows.MessageBoxImage]::Question)
    if ($res -eq [System.Windows.MessageBoxResult]::Yes) {
        Log-Msg "Removendo servico SPXAgentService..."
        Start-Process -FilePath $ExePath -ArgumentList "service stop" -NoNewWindow -Wait
        Start-Process -FilePath $ExePath -ArgumentList "service remove" -NoNewWindow -Wait
        AtualizarStatusServico
        Log-Msg "Servico desinstalado do Windows." "AVISO"
    }
})

# Inicializacao
Log-Msg "Assistente Moderno SPX Impressoras iniciado com sucesso." "INFO"
$uStr = [string]$cfg.unidade
$sStr = [string]$cfg.servidorBase
Log-Msg "Filial ativa: $uStr | Servidor: $sStr" "INFO"
AtualizarStatusServico

[void]$window.ShowDialog()
