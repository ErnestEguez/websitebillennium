-- =====================================================
-- MIGRACIÓN CRÍTICA: Agregar columnas SRI a tabla comprobantes
-- ejecutar en: Supabase Dashboard → SQL Editor
-- Este script agrega las columnas que necesita la función sri-signer
-- =====================================================

-- 1. Columnas para el proceso de facturación electrónica
ALTER TABLE public.comprobantes
  ADD COLUMN IF NOT EXISTS xml_firmado TEXT,
  ADD COLUMN IF NOT EXISTS observaciones_sri TEXT;

-- 2. Verificar que existan las columnas de autorización
-- (pueden ya existir, el IF NOT EXISTS lo maneja)
ALTER TABLE public.comprobantes
  ADD COLUMN IF NOT EXISTS autorizacion_numero TEXT,
  ADD COLUMN IF NOT EXISTS fecha_autorizacion TIMESTAMPTZ;

-- 3. Agregar campo razon_social a empresas (necesario para el XML)
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS razon_social TEXT;

-- 4. Actualizar razon_social desde nombre para empresas existentes
UPDATE public.empresas
SET razon_social = nombre
WHERE razon_social IS NULL AND nombre IS NOT NULL;

-- 5. Crear bucket firmas_electronicas si no existe
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'firmas_electronicas',
  'firmas_electronicas',
  false,
  5242880,
  ARRAY['application/x-pkcs12', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- 6. Política para que service_role (Edge Function) pueda leer firmas
DROP POLICY IF EXISTS "firma_service_role_quickinvoice" ON storage.objects;
CREATE POLICY "firma_service_role_quickinvoice"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'firmas_electronicas');

-- 7. Política para usuarios autenticados subir su firma
DROP POLICY IF EXISTS "firma_upload_auth" ON storage.objects;
CREATE POLICY "firma_upload_auth"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'firmas_electronicas');

DROP POLICY IF EXISTS "firma_read_auth" ON storage.objects;
CREATE POLICY "firma_read_auth"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'firmas_electronicas');

-- 8. Notificar a PostgREST que recargue el schema
NOTIFY pgrst, 'reload schema';

-- 9. Verificar resultado
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'comprobantes'
  AND column_name IN ('xml_firmado', 'observaciones_sri', 'autorizacion_numero', 'fecha_autorizacion', 'estado_sri')
ORDER BY column_name;
