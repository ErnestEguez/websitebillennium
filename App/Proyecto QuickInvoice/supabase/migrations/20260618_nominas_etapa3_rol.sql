-- nominas Etapa 3: Períodos y Cálculo del Rol de Pagos
-- Tablas: periodos, rol_cabecera, rol_lineas

-- ── 1. PERIODOS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nominas.periodos (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id   UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    nombre       TEXT NOT NULL,
    tipo_nomina  TEXT NOT NULL CHECK (tipo_nomina IN ('quincenal','mensual')),
    fecha_inicio DATE NOT NULL,
    fecha_fin    DATE NOT NULL,
    estado       TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','cerrado')),
    total_ingresos   NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_descuentos NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_neto       NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at   TIMESTAMPTZ DEFAULT timezone('utc', now())
);

ALTER TABLE nominas.periodos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nominas_periodos_empresa" ON nominas.periodos
    FOR ALL USING (
        empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas
                WHERE user_id = auth.uid() AND activo = true
        )
    );

GRANT ALL ON nominas.periodos TO authenticated, service_role;

-- ── 2. ROL_CABECERA ───────────────────────────────────────────────────────────
-- Una fila por empleado por período
CREATE TABLE IF NOT EXISTS nominas.rol_cabecera (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    periodo_id   UUID NOT NULL REFERENCES nominas.periodos(id) ON DELETE CASCADE,
    empleado_id  UUID NOT NULL REFERENCES nominas.empleados(id),
    empresa_id   UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    sueldo_base  NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_ingresos   NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_descuentos NUMERIC(12,2) NOT NULL DEFAULT 0,
    neto             NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at   TIMESTAMPTZ DEFAULT timezone('utc', now()),
    UNIQUE (periodo_id, empleado_id)
);

ALTER TABLE nominas.rol_cabecera ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nominas_rol_cabecera_empresa" ON nominas.rol_cabecera
    FOR ALL USING (
        empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas
                WHERE user_id = auth.uid() AND activo = true
        )
    );

GRANT ALL ON nominas.rol_cabecera TO authenticated, service_role;

-- ── 3. ROL_LINEAS ─────────────────────────────────────────────────────────────
-- Una fila por concepto por empleado por período
CREATE TABLE IF NOT EXISTS nominas.rol_lineas (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cabecera_id  UUID NOT NULL REFERENCES nominas.rol_cabecera(id) ON DELETE CASCADE,
    empresa_id   UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    concepto_id  UUID REFERENCES nominas.conceptos(id),
    codigo       TEXT NOT NULL,
    nombre       TEXT NOT NULL,
    tipo         TEXT NOT NULL CHECK (tipo IN ('ingreso','descuento')),
    monto        NUMERIC(12,2) NOT NULL DEFAULT 0,
    es_calculado BOOLEAN NOT NULL DEFAULT false,
    orden        INTEGER NOT NULL DEFAULT 99
);

ALTER TABLE nominas.rol_lineas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nominas_rol_lineas_empresa" ON nominas.rol_lineas
    FOR ALL USING (
        empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas
                WHERE user_id = auth.uid() AND activo = true
        )
    );

GRANT ALL ON nominas.rol_lineas TO authenticated, service_role;
