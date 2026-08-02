-- ============================================================
-- CONSUMO DE IA (Gemini) POR EMPRESA
--
-- Gemini se usa hoy en 4 lugares: OCR de factura de proveedor
-- (Compra Inventario y Compra Servicio), screening de CV (Talento
-- Humano) y el asistente de voz (Nueva Factura). Los dos primeros
-- llamaban a Gemini DIRECTO DESDE EL NAVEGADOR con la API key
-- expuesta en el bundle público — se migran a una Edge Function
-- (gemini-client-proxy) igual que ya funcionan scan-invoice y
-- voice-assistant, y las 3 funciones ahora registran cada llamada
-- acá para poder ver consumo por empresa/mes desde una pantalla de
-- superadmin. Sin esto no había forma confiable de medir consumo:
-- una llamada hecha desde el navegador nunca pasa por el servidor.
--
-- Solo admin_plataforma puede leer esta tabla — es una herramienta
-- de costos de la plataforma, ninguna empresa debe ver su propio
-- consumo desde acá.
-- ============================================================

CREATE TABLE facturacion.consumo_ia (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id     UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    origen         TEXT NOT NULL CHECK (origen IN ('compra_inventario','compra_servicio','th_screening_cv','asistente_voz')),
    tokens_entrada INT,
    tokens_salida  INT,
    tokens_total   INT,
    exitoso        BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX idx_consumo_ia_empresa_fecha ON facturacion.consumo_ia(empresa_id, created_at);

ALTER TABLE facturacion.consumo_ia ENABLE ROW LEVEL SECURITY;

-- Solo lectura para admin_plataforma. Los inserts los hacen las Edge
-- Functions con la service_role key (bypassa RLS) — no se necesita
-- policy de INSERT para el rol authenticated.
CREATE POLICY "consumo_ia_admin_plataforma_select" ON facturacion.consumo_ia
    FOR SELECT USING (facturacion.es_admin_plataforma());

-- ============================================================
-- Verificación
-- ============================================================
-- SELECT origen, COUNT(*) FROM facturacion.consumo_ia
--   WHERE empresa_id = '<EMPRESA_ID>'
--     AND created_at >= '2026-08-01' AND created_at < '2026-09-01'
--   GROUP BY origen;

-- ============================================================
-- Rollback (comentado)
-- ============================================================
-- DROP TABLE IF EXISTS facturacion.consumo_ia;
