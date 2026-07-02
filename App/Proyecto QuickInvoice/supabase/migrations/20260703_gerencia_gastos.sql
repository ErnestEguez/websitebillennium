-- ============================================================
-- Módulo Gerencia: Gastos Manuales + config por empresa
-- 2026-07-03
-- ============================================================

-- Tabla de gastos manuales (empresas sin contabilidad)
CREATE TABLE IF NOT EXISTS facturacion.gerencia_gastos_manuales (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id    UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    tipo_periodo  TEXT NOT NULL CHECK (tipo_periodo IN ('D','M','A')),
    fecha_periodo TEXT NOT NULL,   -- 'YYYY-MM-DD' | 'YYYY-MM' | 'YYYY'
    categoria     TEXT NOT NULL,
    descripcion   TEXT,
    valor         NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gerencia_gastos_empresa_periodo
    ON facturacion.gerencia_gastos_manuales(empresa_id, tipo_periodo, fecha_periodo);

ALTER TABLE facturacion.gerencia_gastos_manuales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gerencia_gastos_empresa" ON facturacion.gerencia_gastos_manuales;
CREATE POLICY "gerencia_gastos_empresa" ON facturacion.gerencia_gastos_manuales
    FOR ALL USING (empresa_id IN (SELECT facturacion.mis_empresas_ids()));

GRANT ALL ON facturacion.gerencia_gastos_manuales TO authenticated, service_role;

-- config_gerencia en empresas (umbrales del semáforo y configuración)
ALTER TABLE facturacion.empresas
    ADD COLUMN IF NOT EXISTS config_gerencia JSONB DEFAULT '{}'::jsonb;
