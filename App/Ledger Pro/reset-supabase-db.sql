<#
.SYNOPSIS
Reinicia la base de datos Supabase usando solo los archivos de migración existentes.

.DESCRIPTION
Este script elimina el esquema público del target PostgreSQL y aplica las migraciones de
`supabase/migrations` en orden. No modifica ningún código de la app ni los archivos de
migración existentes.

.NOTES
- Requiere `psql` disponible en PATH.
- Usa la variable de entorno `DATABASE_URL` o el parámetro `-DatabaseUrl`.
- Solo reconstruye la estructura según las migraciones; no conserva datos.
#>

param(
    [string]$DatabaseUrl = $env:DATABASE_URL
)

if (-not $DatabaseUrl) {
    Write-Error "No se encontró DATABASE_URL. Establezca la variable de entorno DATABASE_URL o pase -DatabaseUrl '<url>'."
    exit 1
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Error "No se encontró el comando 'psql' en PATH. Instale PostgreSQL o agregue psql al PATH."
    exit 1
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$migrationsDir = Join-Path $scriptRoot 'supabase' 'migrations'

if (-not (Test-Path $migrationsDir)) {
    Write-Error "No existe el directorio de migraciones: $migrationsDir"
    exit 1
}

Write-Host "Usando DATABASE_URL=$DatabaseUrl"
Write-Host "Recreando el esquema público y aplicando migraciones..."

$dropSql = "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
$dropResult = & psql $DatabaseUrl -v ON_ERROR_STOP=1 -c $dropSql
if ($LASTEXITCODE -ne 0) {
    Write-Error "Error al recrear el esquema público."
    exit $LASTEXITCODE
}

Get-ChildItem -Path $migrationsDir -Filter '*.sql' | Sort-Object Name | ForEach-Object {
    Write-Host "Ejecutando migración: $($_.Name)"
    & psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $_.FullName
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Fallo al ejecutar $($_.Name)."
        exit $LASTEXITCODE
    }
}

Write-Host "La base de datos ha sido reconstruida con la estructura de migraciones."
