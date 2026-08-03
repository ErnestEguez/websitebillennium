-- ============================================================
-- FACTURACIÓN ELECTRÓNICA MASIVA DE CLIENTES
--
-- Proceso mensual (día 1) que factura a todos los clientes activos
-- con un cargo recurrente en un solo lote. Reutiliza por completo
-- facturaDirectaService.generarFacturaDirecta() (una llamada por
-- cliente, corrida desde el navegador) — esta migración solo agrega
-- lo que falta: 2 campos en clientes, el feature flag (mismo patrón
-- que sesion_unica_config/ia_features_config) y el log de auditoría
-- del lote.
--
-- clientes.activo y clientes.bloqueo_credito YA EXISTEN (migraciones
-- previas) y se reutilizan tal cual para "cliente activo" y
-- "suspendido por pago" — no se duplican.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Campos nuevos en clientes
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturacion.clientes
    ADD COLUMN IF NOT EXISTS valor_facturar NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tasa_iva       INTEGER NOT NULL DEFAULT 15 CHECK (tasa_iva IN (0, 15));

-- ────────────────────────────────────────────────────────────
-- 2. Feature flag por empresa — mismo patrón que sesion_unica_config
--    e ia_features_config: fila ausente = deshabilitado, solo
--    admin_plataforma activa/desactiva.
-- ────────────────────────────────────────────────────────────
CREATE TABLE facturacion.facturacion_masiva_config (
    empresa_id UUID PRIMARY KEY REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    enabled    BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE facturacion.facturacion_masiva_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "facturacion_masiva_config_select_empresa" ON facturacion.facturacion_masiva_config;
CREATE POLICY "facturacion_masiva_config_select_empresa" ON facturacion.facturacion_masiva_config
    FOR SELECT USING (
        empresa_id IN (SELECT facturacion.mis_empresas_ids())
    );

DROP POLICY IF EXISTS "facturacion_masiva_config_admin_all" ON facturacion.facturacion_masiva_config;
CREATE POLICY "facturacion_masiva_config_admin_all" ON facturacion.facturacion_masiva_config
    FOR ALL USING (facturacion.es_admin_plataforma())
    WITH CHECK (facturacion.es_admin_plataforma());

GRANT SELECT ON facturacion.facturacion_masiva_config TO authenticated;
GRANT ALL ON facturacion.facturacion_masiva_config TO service_role;

-- ────────────────────────────────────────────────────────────
-- 3. Log de auditoría del lote — uno por corrida
-- ────────────────────────────────────────────────────────────
CREATE TABLE facturacion.facturacion_masiva_log (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id             UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    usuario_id             UUID REFERENCES auth.users(id),
    fecha_ejecucion        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    mes_facturado          TEXT NOT NULL,              -- 'YYYY-MM'
    clientes_seleccionados INTEGER NOT NULL DEFAULT 0,
    clientes_facturados    INTEGER NOT NULL DEFAULT 0,
    clientes_omitidos      INTEGER NOT NULL DEFAULT 0,
    clientes_con_error     INTEGER NOT NULL DEFAULT 0,
    subtotal_sin_iva       NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_iva_15           NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_iva_0            NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_general          NUMERIC(14,2) NOT NULL DEFAULT 0,
    detalle_errores        JSONB  -- [{cliente, error}]
);

CREATE INDEX idx_facturacion_masiva_log_empresa_fecha
    ON facturacion.facturacion_masiva_log(empresa_id, fecha_ejecucion DESC);

ALTER TABLE facturacion.facturacion_masiva_log ENABLE ROW LEVEL SECURITY;

-- Mismo patrón estándar del resto de tablas con empresa_id directo
-- (20260623_fix_rls_barrido_general.sql): solo miembros de la empresa.
DROP POLICY IF EXISTS "facturacion_masiva_log_empresa" ON facturacion.facturacion_masiva_log;
CREATE POLICY "facturacion_masiva_log_empresa" ON facturacion.facturacion_masiva_log
    FOR ALL USING (
        empresa_id IN (SELECT facturacion.mis_empresas_ids())
    )
    WITH CHECK (
        empresa_id IN (SELECT facturacion.mis_empresas_ids())
    );

GRANT SELECT, INSERT ON facturacion.facturacion_masiva_log TO authenticated;
GRANT ALL ON facturacion.facturacion_masiva_log TO service_role;

-- ============================================================
-- Verificación
-- ============================================================
-- Activar el flag para una empresa piloto (reemplazar el UUID):
-- INSERT INTO facturacion.facturacion_masiva_config (empresa_id, enabled)
-- VALUES ('<EMPRESA_ID>', true)
-- ON CONFLICT (empresa_id) DO UPDATE SET enabled = true, updated_at = timezone('utc', now());

-- ============================================================
-- Rollback (comentado)
-- ============================================================
-- DROP TABLE IF EXISTS facturacion.facturacion_masiva_log;
-- DROP TABLE IF EXISTS facturacion.facturacion_masiva_config;
-- ALTER TABLE facturacion.clientes DROP COLUMN IF EXISTS valor_facturar, DROP COLUMN IF EXISTS tasa_iva;
