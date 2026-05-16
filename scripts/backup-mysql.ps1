# Respaldo MySQL (docker-compose en la raíz del repo).
# Uso: .\scripts\backup-mysql.ps1
# Alternativa sin mysqldump en PATH: cd back && node scripts/dump-db.mjs
# Salida: backups\fersua_dashboard_YYYYMMDD_HHMMSS.sql.gz

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$outDir = Join-Path $root "backups"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$sqlFile = Join-Path $outDir "fersua_dashboard_$stamp.sql"
$gzFile = "$sqlFile.gz"

Write-Host "Comprobando contenedor MySQL..."
docker compose ps mysql 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Iniciando MySQL con docker compose..."
  docker compose up -d mysql
  Start-Sleep -Seconds 8
}

Write-Host "Exportando base fersua_dashboard -> $sqlFile"
cmd /c "docker compose exec -T mysql mysqldump -ufersua -pfersua --single-transaction --routines --triggers --set-gtid-purged=OFF --default-character-set=utf8mb4 fersua_dashboard > `"$sqlFile`""

if (-not (Test-Path $sqlFile) -or (Get-Item $sqlFile).Length -lt 100) {
  throw "El respaldo parece vacío o falló. ¿Está Docker Desktop en ejecución?"
}

# Comprimir (requiere gzip en PATH o 7z; si no hay gzip, deja solo .sql)
$gzip = Get-Command gzip -ErrorAction SilentlyContinue
if ($gzip) {
  & gzip -f $sqlFile
  Write-Host "Listo: $gzFile"
} else {
  Write-Host "Listo (sin comprimir; instala gzip o comprime manualmente): $sqlFile"
}

Write-Host ""
Write-Host "Sube el archivo al VPS con scp, por ejemplo:"
Write-Host "  scp backups\fersua_dashboard_$stamp.sql.gz usuario@tu-vps:/tmp/"
