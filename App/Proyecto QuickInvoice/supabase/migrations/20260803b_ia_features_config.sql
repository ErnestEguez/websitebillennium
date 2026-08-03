-- ============================================================
-- FEATURE FLAGS DE IA (Gemini) POR EMPRESA — mismo patrón que
-- facturacion.sesion_unica_config (20260730_sesion_unica_fase1.sql):
-- cada empresa empieza deshabilitada (fila ausente = apagado), solo
-- admin_plataforma puede activarla, empresa por empresa. No es un
-- flag único como sesión única: son 3 usos de Gemini que el usuario
-- quiere autorizar por separado (OCR de compras, asistente de voz,
-- screening de CV en Talento Humano).
--
-- El chequeo real vive del lado del servidor (Edge Functions
-- gemini-client-proxy, scan-invoice, voice-assistant) — el frontend
-- también lo consulta para ocultar los botones correspondientes,
-- pero eso es solo UX, no la protección real.
-- ============================================================

CREATE TABLE facturacion.ia_features_config (
    empresa_id      UUID PRIMARY KEY REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    compras_enabled BOOLEAN NOT NULL DEFAULT false,  -- OCR factura proveedor (Compra Inventario y Compra Servicio)
    voz_enabled     BOOLEAN NOT NULL DEFAULT false,  -- Asistente de voz (Nueva Factura)
    cv_enabled      BOOLEAN NOT NULL DEFAULT false,  -- Screening de CV (Talento Humano)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_by      UUID REFERENCES facturacion.profiles(id)
);

CREATE OR REPLACE FUNCTION facturacion.fn_set_updated_at_ia_features()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := timezone('utc', now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ia_features_config_updated_at ON facturacion.ia_features_config;
CREATE TRIGGER trg_ia_features_config_updated_at
    BEFORE UPDATE ON facturacion.ia_features_config
    FOR EACH ROW EXECUTE FUNCTION facturacion.fn_set_updated_at_ia_features();

ALTER TABLE facturacion.ia_features_config ENABLE ROW LEVEL SECURITY;

-- Cualquier miembro de la empresa puede LEER sus propios flags (el
-- frontend los necesita para decidir si muestra los botones de IA).
DROP POLICY IF EXISTS "ia_features_config_select_empresa" ON facturacion.ia_features_config;
CREATE POLICY "ia_features_config_select_empresa" ON facturacion.ia_features_config
    FOR SELECT USING (
        empresa_id IN (SELECT facturacion.mis_empresas_ids())
    );

-- Solo admin_plataforma puede activar/desactivar. Ningún admin de
-- empresa cliente puede autoactivarse estos servicios.
DROP POLICY IF EXISTS "ia_features_config_admin_all" ON facturacion.ia_features_config;
CREATE POLICY "ia_features_config_admin_all" ON facturacion.ia_features_config
    FOR ALL USING (facturacion.es_admin_plataforma())
    WITH CHECK (facturacion.es_admin_plataforma());

GRANT SELECT ON facturacion.ia_features_config TO authenticated;
GRANT ALL ON facturacion.ia_features_config TO service_role;

-- ============================================================
-- Verificación
-- ============================================================
-- Activar "compras" para una empresa piloto (reemplazar el UUID):
-- INSERT INTO facturacion.ia_features_config (empresa_id, compras_enabled)
-- VALUES ('<EMPRESA_ID>', true)
-- ON CONFLICT (empresa_id) DO UPDATE SET compras_enabled = true, updated_at = timezone('utc', now());

-- ============================================================
-- Rollback (comentado)
-- ============================================================
-- DROP TABLE IF EXISTS facturacion.ia_features_config;
-- DROP FUNCTION IF EXISTS facturacion.fn_set_updated_at_ia_features();
