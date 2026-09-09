-- ============================================================
-- Geo-ubicación de clientes — usada por Cobros Móvil (cobrador en
-- terreno captura la ubicación del cliente al momento de la visita).
-- ============================================================

ALTER TABLE facturacion.clientes
    ADD COLUMN IF NOT EXISTS geo_latitud       DECIMAL(10,7),
    ADD COLUMN IF NOT EXISTS geo_longitud      DECIMAL(10,7),
    ADD COLUMN IF NOT EXISTS geo_capturada_at  TIMESTAMPTZ;

-- ── Verificación sugerida después de correr esta migración ──
--   SELECT geo_latitud, geo_longitud, geo_capturada_at FROM facturacion.clientes LIMIT 1;
