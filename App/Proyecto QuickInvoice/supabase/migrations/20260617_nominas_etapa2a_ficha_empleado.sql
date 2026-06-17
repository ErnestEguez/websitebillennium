-- Etapa 2A — Ficha de empleado completa
-- Nuevos campos personales/laborales en nominas.empleados + tabla nominas.historial_salarios

-- ─── 1. Nuevas columnas en nominas.empleados ─────────────────────────────────

ALTER TABLE nominas.empleados
    -- Datos personales adicionales
    ADD COLUMN IF NOT EXISTS foto_url                    TEXT,
    ADD COLUMN IF NOT EXISTS estado_civil               TEXT
        CHECK (estado_civil IS NULL OR estado_civil IN ('soltero','casado','union_libre','divorciado','viudo')),
    ADD COLUMN IF NOT EXISTS nacionalidad               TEXT,
    ADD COLUMN IF NOT EXISTS ciudad                     TEXT,

    -- Datos laborales adicionales
    ADD COLUMN IF NOT EXISTS tipo_contrato              TEXT
        CHECK (tipo_contrato IS NULL OR tipo_contrato IN ('indefinido','plazo_fijo','prueba','honorarios','servicios')),

    -- Contacto de emergencia
    ADD COLUMN IF NOT EXISTS contacto_emergencia_nombre     TEXT,
    ADD COLUMN IF NOT EXISTS contacto_emergencia_relacion   TEXT,
    ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono   TEXT,

    -- Observaciones generales
    ADD COLUMN IF NOT EXISTS observaciones              TEXT;

-- ─── 2. Tabla nominas.historial_salarios ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS nominas.historial_salarios (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    empleado_id     UUID NOT NULL REFERENCES nominas.empleados(id) ON DELETE CASCADE,
    fecha           DATE NOT NULL,
    sueldo_anterior NUMERIC(10,2) NOT NULL DEFAULT 0,
    sueldo_nuevo    NUMERIC(10,2) NOT NULL DEFAULT 0,
    motivo          TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_histsal_empleado  ON nominas.historial_salarios(empleado_id);
CREATE INDEX IF NOT EXISTS idx_histsal_empresa   ON nominas.historial_salarios(empresa_id);

-- RLS — mismo patrón multiempresa que las demás tablas nominas
ALTER TABLE nominas.historial_salarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nominas_historial_salarios_empresa" ON nominas.historial_salarios
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

GRANT ALL ON nominas.historial_salarios TO authenticated, service_role;
