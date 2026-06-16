-- Etapa 3d: Anticipo de Quincena

-- Tabla de anticipos (uno por período mensual)
CREATE TABLE IF NOT EXISTS nominas.anticipos (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id  UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    periodo_id  UUID NOT NULL REFERENCES nominas.periodos(id) ON DELETE CASCADE,
    nombre      TEXT NOT NULL,
    estado      TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'liquidado')),
    created_at  TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at  TIMESTAMPTZ DEFAULT timezone('utc', now()),
    UNIQUE(empresa_id, periodo_id)
);

-- Líneas del anticipo (una por empleado)
CREATE TABLE IF NOT EXISTS nominas.anticipo_lineas (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    anticipo_id     UUID NOT NULL REFERENCES nominas.anticipos(id) ON DELETE CASCADE,
    empresa_id      UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    empleado_id     UUID NOT NULL REFERENCES nominas.empleados(id),
    tipo_calculo    TEXT NOT NULL DEFAULT 'porcentaje' CHECK (tipo_calculo IN ('porcentaje', 'fijo')),
    porcentaje      NUMERIC(5,2)  NOT NULL DEFAULT 40,
    monto_anticipo  NUMERIC(12,2) NOT NULL DEFAULT 0,
    desc1_nombre    TEXT,
    desc1_monto     NUMERIC(12,2) NOT NULL DEFAULT 0,
    desc2_nombre    TEXT,
    desc2_monto     NUMERIC(12,2) NOT NULL DEFAULT 0,
    neto            NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at      TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- FK en rol_lineas para trazabilidad desde el anticipo
ALTER TABLE nominas.rol_lineas
    ADD COLUMN IF NOT EXISTS anticipo_linea_id UUID REFERENCES nominas.anticipo_lineas(id);

-- RLS anticipos
ALTER TABLE nominas.anticipos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anticipos_empresa" ON nominas.anticipos;
CREATE POLICY "anticipos_empresa" ON nominas.anticipos
    USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

-- RLS anticipo_lineas
ALTER TABLE nominas.anticipo_lineas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anticipo_lineas_empresa" ON nominas.anticipo_lineas;
CREATE POLICY "anticipo_lineas_empresa" ON nominas.anticipo_lineas
    USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

GRANT ALL ON nominas.anticipos       TO authenticated, service_role;
GRANT ALL ON nominas.anticipo_lineas TO authenticated, service_role;
