# Copia los archivos del módulo (carpeta entregable ..\Solution_Radar) al proyecto de prueba.
# Ejecútalo cada vez que cambies algo en ..\Solution_Radar.
$ErrorActionPreference = 'Stop'
$origen  = Join-Path $PSScriptRoot '..\Solution_Radar'
$destino = Join-Path $PSScriptRoot 'Solution_Radar'

$carpetas = @(
    'Controllers',
    'Models\ModuloDinamico',
    'DataAccess\CapturasDinamicas',
    'Views\CapturasDinamicas',
    'CSS\Page2026\CapturasDinamicas',
    'Scripts\CapturasDinamicas'
)

foreach ($c in $carpetas) {
    $src = Join-Path $origen $c
    $dst = Join-Path $destino $c
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    Copy-Item -Path (Join-Path $src '*') -Destination $dst -Recurse -Force
    Write-Host "Copiado: $c"
}
Write-Host 'Sincronización terminada.' -ForegroundColor Green
