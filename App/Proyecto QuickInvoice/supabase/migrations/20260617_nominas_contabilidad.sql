-- ===== Referencias a comprobantes LP en tablas de nómina =====
-- Permite anular asientos LP automáticamente al revertir un proceso de nómina.

ALTER TABLE nominas.periodos
    ADD COLUMN IF NOT EXISTS lp_comprobante_rol_id  TEXT,
    ADD COLUMN IF NOT EXISTS lp_comprobante_prov_id TEXT;

ALTER TABLE nominas.anticipos
    ADD COLUMN IF NOT EXISTS lp_comprobante_id TEXT;

ALTER TABLE nominas.finiquitos
    ADD COLUMN IF NOT EXISTS lp_comprobante_id TEXT;
