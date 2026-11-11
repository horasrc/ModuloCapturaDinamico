# Crea la base de datos de pruebas "CapturaDinamica" en SQL Server LocalDB
# y ejecuta Script_CapturaDinamica.sql si las tablas no existen.
#   -Recrear  borra la base y la vuelve a crear (se pierden los datos).
param([switch]$Recrear)
$ErrorActionPreference = 'Stop'

$instancia = '(localdb)\MSSQLLocalDB'
$base      = 'CapturaDinamica'
$script    = Join-Path $PSScriptRoot '..\Solution_Radar\DataAccess\CapturasDinamicas\Script_CapturaDinamica.sql'

function Ejecutar-Sql([string]$catalogo, [string]$sql) {
    $cn = New-Object System.Data.SqlClient.SqlConnection("Data Source=$instancia;Initial Catalog=$catalogo;Integrated Security=True;Connect Timeout=60")
    $cn.Open()
    try {
        $cmd = $cn.CreateCommand()
        $cmd.CommandTimeout = 120
        $cmd.CommandText = $sql
        return $cmd.ExecuteScalar()
    } finally { $cn.Close() }
}

try {
    Ejecutar-Sql 'master' 'SELECT 1' | Out-Null
} catch {
    Write-Host "No se pudo conectar a $instancia." -ForegroundColor Red
    Write-Host 'Instala "SQL Server Express LocalDB" desde el Visual Studio Installer (componentes individuales).'
    throw
}

if ($Recrear) {
    Write-Host "Eliminando base $base..." -ForegroundColor Yellow
    Ejecutar-Sql 'master' "IF DB_ID('$base') IS NOT NULL BEGIN ALTER DATABASE [$base] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$base]; END" | Out-Null
}

$existe = Ejecutar-Sql 'master' "SELECT COUNT(*) FROM sys.databases WHERE name = '$base'"
if ($existe -eq 0) {
    Write-Host "Creando base $base en $instancia..."
    Ejecutar-Sql 'master' "CREATE DATABASE [$base]" | Out-Null
}

# El script es idempotente: crea lo que falte y agrega columnas nuevas sin borrar datos.
Write-Host 'Aplicando Script_CapturaDinamica.sql (crea o actualiza tablas)...'
$texto = [IO.File]::ReadAllText((Resolve-Path $script), [Text.Encoding]::UTF8)
$lotes = [regex]::Split($texto, '(?im)^\s*GO\s*$')
foreach ($lote in $lotes) {
    if ($lote.Trim().Length -gt 0) { Ejecutar-Sql $base $lote | Out-Null }
}
Write-Host 'Base lista. Si está vacía, las encuestas de ejemplo se cargan al abrir el módulo.' -ForegroundColor Green
