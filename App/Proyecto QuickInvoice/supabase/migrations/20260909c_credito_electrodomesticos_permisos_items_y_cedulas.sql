-- ============================================================
-- Ventas a Crédito de Electrodomésticos — permiso por ítem de menú
-- + captura de cédula de clientes/garantes
-- ============================================================
-- 1. Cada ítem del submenú "Ventas a Crédito" necesita su propio
--    permiso (perm_credito_electrodomesticos y perm_credito_cobros ya
--    existían desde Fase 0) — un cobrador solo debe ver Cancelación
--    Oficina, nada más del submenú.
-- 2. Captura de cédula (clientes y/o garantes, misma tabla clientes) —
--    2 imágenes por cliente, bucket privado por empresa.
-- ============================================================

ALTER TABLE facturacion.user_permisos
    ADD COLUMN IF NOT EXISTS perm_credito_solicitud        BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_credito_cobros_movil      BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_credito_consulta_cartera  BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_credito_estado_cuenta     BOOLEAN NOT NULL DEFAULT true;

-- ────────────────────────────────────────────────────────────
-- Cédula de clientes/garantes — 2 imágenes por cliente, path
-- (no URL pública: es un documento de identidad, bucket privado).
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturacion.clientes
    ADD COLUMN IF NOT EXISTS cedula_imagen1_path TEXT,
    ADD COLUMN IF NOT EXISTS cedula_imagen2_path TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cedulas_clientes', 'cedulas_clientes', false, 8388608,
        ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'image/heic'::text])
ON CONFLICT (id) DO NOTHING;

-- Convención de ruta: {empresa_id}/{cliente_id}_1.ext y {empresa_id}/{cliente_id}_2.ext
-- Mismo patrón de RLS inline (profiles UNION usuario_empresas) que ya
-- usa el resto de facturacion — no se depende de funciones helper de
-- public.* (get_my_empresa_id/is_oficina) que no forman parte del
-- patrón vigente de este proyecto.
DROP POLICY IF EXISTS "cedulas_clientes_empresa" ON storage.objects;
CREATE POLICY "cedulas_clientes_empresa"
ON storage.objects FOR ALL
TO authenticated
USING (
    bucket_id = 'cedulas_clientes'
    AND (storage.foldername(name))[1] IN (
        SELECT empresa_id::text FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id::text FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    )
)
WITH CHECK (
    bucket_id = 'cedulas_clientes'
    AND (storage.foldername(name))[1] IN (
        SELECT empresa_id::text FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id::text FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    )
);

-- ── Verificación sugerida después de correr esta migración ──
--   SELECT perm_credito_solicitud, perm_credito_cobros_movil,
--          perm_credito_consulta_cartera, perm_credito_estado_cuenta
--   FROM facturacion.user_permisos LIMIT 5;
--   SELECT id FROM storage.buckets WHERE id = 'cedulas_clientes';
