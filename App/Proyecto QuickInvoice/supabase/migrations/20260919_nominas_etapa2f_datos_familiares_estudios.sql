-- ============================================================
-- TALENTO HUMANO — Ficha del empleado: Datos Familiares y Estudios
--
-- Dos pestañas nuevas en la ficha del empleado:
--   1. Datos Familiares: datos de cónyuge (1:1, columnas directas en
--      empleados) + hijos (1:N, tabla nueva — nombres y fecha de
--      nacimiento, se permiten varios).
--   2. Estudios / Nivel Académico (1:N, tabla nueva — institución, tipo,
--      último año aprobado, título obtenido y año, se permiten varios).
--
-- Mismo patrón que nominas.historial_salarios
-- (20260617_nominas_etapa2a_ficha_empleado.sql): tabla hija con
-- empleado_id + empresa_id, índices en ambos, RLS multiempresa idéntica.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Datos de cónyuge — 1:1, columnas directas en empleados
-- ────────────────────────────────────────────────────────────
ALTER TABLE nominas.empleados
    ADD COLUMN IF NOT EXISTS conyuge_nombres           TEXT,
    ADD COLUMN IF NOT EXISTS conyuge_cedula             TEXT,
    ADD COLUMN IF NOT EXISTS conyuge_fecha_nacimiento   DATE,
    ADD COLUMN IF NOT EXISTS conyuge_ocupacion          TEXT,
    ADD COLUMN IF NOT EXISTS conyuge_telefono           TEXT;

-- ────────────────────────────────────────────────────────────
-- 2. Hijos — 1:N
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nominas.empleados_hijos (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id        UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    empleado_id       UUID NOT NULL REFERENCES nominas.empleados(id) ON DELETE CASCADE,
    nombres           TEXT NOT NULL,
    fecha_nacimiento  DATE,
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_empleados_hijos_empleado ON nominas.empleados_hijos(empleado_id);
CREATE INDEX IF NOT EXISTS idx_empleados_hijos_empresa  ON nominas.empleados_hijos(empresa_id);

ALTER TABLE nominas.empleados_hijos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nominas_empleados_hijos_empresa" ON nominas.empleados_hijos;
CREATE POLICY "nominas_empleados_hijos_empresa" ON nominas.empleados_hijos
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
GRANT ALL ON nominas.empleados_hijos TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 3. Estudios / Nivel Académico — 1:N
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nominas.empleados_estudios (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id            UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    empleado_id           UUID NOT NULL REFERENCES nominas.empleados(id) ON DELETE CASCADE,
    nombre_institucion    TEXT NOT NULL,
    tipo_institucion      TEXT NOT NULL CHECK (tipo_institucion IN ('ESCUELA','COLEGIO','UNIVERSIDAD','INSTITUTO')),
    ultimo_anio_aprobado  TEXT,
    titulo_obtenido       TEXT,
    anio_titulo           TEXT,
    created_at            TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_empleados_estudios_empleado ON nominas.empleados_estudios(empleado_id);
CREATE INDEX IF NOT EXISTS idx_empleados_estudios_empresa  ON nominas.empleados_estudios(empresa_id);

ALTER TABLE nominas.empleados_estudios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nominas_empleados_estudios_empresa" ON nominas.empleados_estudios;
CREATE POLICY "nominas_empleados_estudios_empresa" ON nominas.empleados_estudios
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
GRANT ALL ON nominas.empleados_estudios TO authenticated, service_role;
