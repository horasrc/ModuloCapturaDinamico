# Sincroniza el módulo, compila el proyecto de prueba y lo levanta en IIS Express.
$ErrorActionPreference = 'Stop'
$puerto  = 51234
$proyecto = Join-Path $PSScriptRoot 'Solution_Radar'

& (Join-Path $PSScriptRoot 'Sincronizar.ps1')

# Buscar MSBuild de Visual Studio 2022
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$msbuild = & $vswhere -latest -requires Microsoft.Component.MSBuild -find 'MSBuild\**\Bin\MSBuild.exe' | Select-Object -First 1
if (-not $msbuild) { throw 'No se encontró MSBuild de Visual Studio 2022.' }

Write-Host 'Compilando...' -ForegroundColor Cyan
& $msbuild (Join-Path $proyecto 'Solution_Radar.csproj') -restore -p:Configuration=Debug -v:minimal -nologo
if ($LASTEXITCODE -ne 0) { throw 'La compilación falló.' }

$iis = "$env:ProgramFiles\IIS Express\iisexpress.exe"
if (-not (Test-Path $iis)) { throw 'No se encontró IIS Express.' }

$url = "http://localhost:$puerto/CapturasDinamicas/Administrador"
Write-Host "Iniciando IIS Express en $url  (Ctrl+C para detener)" -ForegroundColor Green
Start-Process $url
& $iis "/path:$proyecto" "/port:$puerto" /clr:v4.0
