-- ============================================================
-- MIGRACIÓN: Facturación Electrónica Completa
-- Fecha: 2026-02-26
-- Descripción:
--   1. Agregar columnas a `comprobantes` para XML firmado y observaciones SRI
--   2. Crear Storage Buckets para .p12 y XMLs firmados
--   3. Configurar empresa Ernesto Eguez (RUC 0907388268001) con config_sri correcta
-- ============================================================

-- 1. Columnas nuevas en comprobantes
ALTER TABLE public.comprobantes
  ADD COLUMN IF NOT EXISTS xml_firmado TEXT,
  ADD COLUMN IF NOT EXISTS observaciones_sri TEXT;

-- 2. Asegurarse que la columna razon_social exista en empresas
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS razon_social TEXT;

-- 3. Crear storage buckets (ejecutar como service_role)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('firmas_electronicas', 'firmas_electronicas', false, 5242880, ARRAY['application/x-pkcs12'::text, 'application/octet-stream'::text])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('comprobantes_xml', 'comprobantes_xml', false, 10485760, ARRAY['application/xml'::text, 'text/xml'::text])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('logos', 'logos', true, 5242880, ARRAY['image/png'::text, 'image/jpeg'::text, 'image/webp'::text, 'image/gif'::text])
ON CONFLICT (id) DO NOTHING;

-- 4. Políticas de Storage para firmas_electronicas (solo service_role y oficina de la empresa)
DROP POLICY IF EXISTS "firma_service_role" ON storage.objects;
CREATE POLICY "firma_service_role"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'firmas_electronicas');

DROP POLICY IF EXISTS "firma_oficina_upload" ON storage.objects;
CREATE POLICY "firma_oficina_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'firmas_electronicas'
  AND (storage.foldername(name))[1] = (SELECT id::text FROM public.empresas WHERE id = public.get_my_empresa_id())
  AND public.is_oficina()
);

DROP POLICY IF EXISTS "firma_oficina_read" ON storage.objects;
CREATE POLICY "firma_oficina_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'firmas_electronicas'
  AND (storage.foldername(name))[1] = (SELECT id::text FROM public.empresas WHERE id = public.get_my_empresa_id())
  AND public.is_oficina()
);

-- 5. Políticas de Storage para comprobantes_xml
DROP POLICY IF EXISTS "xml_service_role" ON storage.objects;
CREATE POLICY "xml_service_role"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'comprobantes_xml');

DROP POLICY IF EXISTS "xml_oficina_read" ON storage.objects;
CREATE POLICY "xml_oficina_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'comprobantes_xml'
  AND (storage.foldername(name))[1] = (SELECT id::text FROM public.empresas WHERE id = public.get_my_empresa_id())
);

-- 6. Actualizar empresa de Ernesto Eguez con config_sri completa
--    NOTA: Reemplaza el UUID con el ID real de la empresa en producción.
--    Para encontrarlo: SELECT id FROM empresas WHERE ruc = '0907388268001';
UPDATE public.empresas
SET
  razon_social = 'EGUEZ RUIZ ERNESTO GUILLERMO',
  nombre = COALESCE(nombre, 'Mi Restaurante'),
  config_sri = config_sri || jsonb_build_object(
    'ambiente',           'PRUEBAS',
    'establecimiento',    '001',
    'punto_emision',      '001',
    'secuencial_inicio',  COALESCE((config_sri->>'secuencial_inicio')::int, 1),
    'firma_path',         '0907388268001/cert.p12',
    'firma_url',          '0907388268001/cert.p12',
    'firma_password',     'Passw0rd',
    'resend_from',        'facturas@restoflow.app'
  )
WHERE ruc = '0907388268001';

-- Si la empresa aún no existe (en pruebas locales), crearla de muestra:
INSERT INTO public.empresas (ruc, nombre, razon_ñasocial, direccion, telefono, config_sri)
VALUES (
  '0907388268001',
  'Mi Restaurante',
  'EGUEZ RUIZ ERNESTO GUILLERMO',
  'Guayaquil, Ecuador',
  '0999999999',
  '{
    "ambiente": "PRUEBAS",
    "establecimiento": "001",
    "punto_emision": "001",
    "secuencial_inicio": 1,
    "firma_path": "0907388268001/cert.p12",
    "firma_password": "Passw0rd",
    "resend_from": "facturas@restoflow.app"
  }'::jsonb
)
ON CONFLICT (ruc) DO NOTHING;

-- 7. Notificar a PostgREST del cambio de schema
NOTIFY pgrst, 'reload schema';
