# ============================================================
# setup_sri_deploy.ps1
# Sube el .p12 de Ernesto Eguez a Supabase Storage y
# configura los secrets de la Edge Function sri-signer
# ============================================================
# PREREQUISITOS:
#   1. Supabase CLI instalado: https://supabase.com/docs/guides/cli
#   2. Haber ejecutado: supabase login
#   3. Haber ejecutado: supabase link --project-ref alttjjytmcrixghxavbt
# ============================================================

$PROJECT_REF  = "alttjjytmcrixghxavbt"
$P12_LOCAL    = "C:\SmartPoint_EE\Fact_Electronica_2024\Release_20260112\Release\WCF\cert.p12"
$P12_BUCKET   = "firmas_electronicas"
$P12_PATH     = "0907388268001/cert.p12"
$RESEND_KEY   = "re_fdeWZNQK_KiyAyPggAhYp1oXNU4FMwLwC"

Write-Host "========================================"
Write-Host " RestoFlow - Setup Facturacion Electronica"
Write-Host "========================================"

# 1. Verificar Supabase CLI
try {
    $supabaseVer = supabase --version 2>&1
    Write-Host "[OK] Supabase CLI: $supabaseVer"
} catch {
    Write-Error "Supabase CLI no encontrado. Instálalo: https://supabase.com/docs/guides/cli"
    exit 1
}

# 2. Verificar que el .p12 existe
if (-not (Test-Path $P12_LOCAL)) {
    Write-Error ".p12 no encontrado en: $P12_LOCAL"
    Write-Host "Ajusta la variable P12_LOCAL en este script."
    exit 1
}
Write-Host "[OK] .p12 encontrado: $P12_LOCAL"

# 3. Configurar Secrets de la Edge Function
Write-Host ""
Write-Host "Configurando secrets de la Edge Function..."
supabase secrets set RESEND_API_KEY=$RESEND_KEY --project-ref $PROJECT_REF

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] RESEND_API_KEY configurado"
} else {
    Write-Warning "Error configurando RESEND_API_KEY. Intentalo manualmente:"
    Write-Host "  supabase secrets set RESEND_API_KEY=$RESEND_KEY --project-ref $PROJECT_REF"
}

# 4. Desplegar la Edge Function
Write-Host ""
Write-Host "Desplegando Edge Function sri-signer..."
supabase functions deploy sri-signer --project-ref $PROJECT_REF --no-verify-jwt

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Edge Function sri-signer desplegada exitosamente"
} else {
    Write-Error "Error al desplegar la Edge Function. Revisa los logs."
    exit 1
}

# 5. Subir el .p12 a Supabase Storage via API REST
Write-Host ""
Write-Host "Subiendo .p12 a Supabase Storage..."

$SUPABASE_URL     = "https://alttjjytmcrixghxavbt.supabase.co"
$SERVICE_ROLE_KEY = Read-Host "Ingresa tu SUPABASE_SERVICE_ROLE_KEY (la encuentras en Supabase > Project Settings > API)"

$uploadUrl = "$SUPABASE_URL/storage/v1/object/$P12_BUCKET/$P12_PATH"

$headers = @{
    "Authorization" = "Bearer $SERVICE_ROLE_KEY"
    "Content-Type"  = "application/x-pkcs12"
    "x-upsert"      = "true"
}

$p12Bytes = [System.IO.File]::ReadAllBytes($P12_LOCAL)

try {
    $response = Invoke-RestMethod -Uri $uploadUrl -Method PUT -Headers $headers -Body $p12Bytes
    Write-Host "[OK] .p12 subido a Storage: $P12_BUCKET/$P12_PATH"
    Write-Host $response
} catch {
    Write-Error "Error subiendo .p12: $($_.Exception.Message)"
    Write-Host "Respuesta: $($_.Exception.Response)"
}

# 6. Resumen final
Write-Host ""
Write-Host "========================================"
Write-Host " CONFIGURACION COMPLETADA"
Write-Host "========================================"
Write-Host ""
Write-Host "Pasos restantes en el portal de Supabase:"
Write-Host ""
Write-Host " 1. Ejecuta la migracion SQL:"
Write-Host "    supabase\migrations\20260226_sri_electronico_completo.sql"
Write-Host ""
Write-Host " 2. Verifica en Supabase Dashboard > Storage que el bucket"
Write-Host "    'firmas_electronicas' existe y contiene:"
Write-Host "    -> 0907388268001/Ernesto0907388268_2024.p12"
Write-Host ""
Write-Host " 3. Verifica en Edge Functions > sri-signer que el secret"
Write-Host "    RESEND_API_KEY esta configurado."
Write-Host ""
Write-Host " 4. Haz una factura de prueba en la app."
Write-Host "    El comprobante debe quedar en estado AUTORIZADO (ambiente PRUEBAS)"
Write-Host ""
