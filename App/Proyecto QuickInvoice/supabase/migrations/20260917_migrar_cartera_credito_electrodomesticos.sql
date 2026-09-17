-- Migración de cartera de Ventas a Crédito de Electrodomésticos desde un
-- sistema externo (ej. Electrofertas) — mismo criterio ya usado para
-- cartera_cxc normal (20260610_reversar_pagos_cartera.sql y siguientes):
-- factura_id pasa a ser opcional para créditos migrados, que no tienen
-- una factura electrónica real emitida en este sistema detrás.
ALTER TABLE facturacion.creditos_electrodomesticos
    ALTER COLUMN factura_id DROP NOT NULL;

ALTER TABLE facturacion.creditos_electrodomesticos
    ADD COLUMN IF NOT EXISTS numero_documento_externo TEXT,
    ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'SISTEMA'
        CHECK (origen IN ('SISTEMA', 'MIGRACION'));

CREATE INDEX IF NOT EXISTS idx_credito_electro_origen
    ON facturacion.creditos_electrodomesticos(empresa_id, origen);

-- ── Verificación sugerida después de correr esta migración ──
--   SELECT origen, numero_documento_externo FROM facturacion.creditos_electrodomesticos LIMIT 5;
--   -- debe salir "SISTEMA" / null en todas las filas existentes
