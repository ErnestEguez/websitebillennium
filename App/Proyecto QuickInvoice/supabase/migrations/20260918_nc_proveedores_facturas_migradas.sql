-- Notas de Crédito de Proveedores contra facturas migradas (sin compra_id
-- real, ver MigrarCxPPage.tsx) — mismo criterio ya usado en cartera_cxc y
-- creditos_electrodomesticos: compra_id pasa a ser opcional, se agrega
-- numero_documento_externo para identificar la factura de origen cuando
-- no hay una compra real detrás.
ALTER TABLE facturacion.notas_credito_proveedores
    ALTER COLUMN compra_id DROP NOT NULL;

ALTER TABLE facturacion.notas_credito_proveedores
    ADD COLUMN IF NOT EXISTS numero_documento_externo TEXT;

-- ── Verificación sugerida después de correr esta migración ──
--   SELECT numero_documento_externo FROM facturacion.notas_credito_proveedores LIMIT 5;
--   -- debe salir null en todas las filas existentes
