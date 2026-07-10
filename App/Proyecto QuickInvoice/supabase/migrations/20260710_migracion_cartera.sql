-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN DE CARTERA — soporte para cartera importada de sistemas externos
-- Fecha: 2026-07-10   Schema: facturacion
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Permitir comprobante_id NULL (registros migrados no tienen comprobante interno)
ALTER TABLE facturacion.cartera_cxc
    ALTER COLUMN comprobante_id DROP NOT NULL;

-- 2. Número de documento externo (referencia del sistema anterior)
ALTER TABLE facturacion.cartera_cxc
    ADD COLUMN IF NOT EXISTS numero_documento_externo TEXT;

-- 3. Origen del registro
ALTER TABLE facturacion.cartera_cxc
    ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'SISTEMA'
    CHECK (origen IN ('SISTEMA', 'MIGRACION'));

-- Índice para consultas por origen
CREATE INDEX IF NOT EXISTS idx_cartera_cxc_origen
    ON facturacion.cartera_cxc(empresa_id, origen);
