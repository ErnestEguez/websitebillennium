-- Etapa 1 — Maestro de Empleados del módulo "Talento Humano y Nóminas"
--
-- Tabla nominas.empleados: datos personales, laborales y parámetros de nómina
-- por empleado. Additive-only, no modifica tablas existentes.

CREATE TABLE IF NOT EXISTS nominas.empleados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,

    -- Datos personales
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    cedula TEXT NOT NULL,
    fecha_nacimiento DATE,
    telefono TEXT,
    email TEXT,
    direccion TEXT,

    -- Datos laborales
    seccion_id UUID REFERENCES nominas.secciones(id) ON DELETE SET NULL,
    cargo_id UUID REFERENCES nominas.cargos(id) ON DELETE SET NULL,
    jefe_inmediato_id UUID REFERENCES nominas.empleados(id) ON DELETE SET NULL,
    fecha_ingreso DATE NOT NULL,
    fecha_salida DATE,
    tipo_jornada TEXT NOT NULL DEFAULT 'completa'
        CHECK (tipo_jornada IN ('completa', 'parcial')),
    tipo_nomina TEXT NOT NULL DEFAULT 'mensual'
        CHECK (tipo_nomina IN ('quincenal', 'mensual', 'quincenal_y_mensual', 'por_hora', 'destajo')),
    sueldo_base NUMERIC(10,2) NOT NULL DEFAULT 0,
    afiliado_iess BOOLEAN NOT NULL DEFAULT true,

    -- Parámetros de nómina por empleado
    decimo_tercero_modo TEXT NOT NULL DEFAULT 'mensualizado'
        CHECK (decimo_tercero_modo IN ('mensualizado', 'acumulado')),
    decimo_cuarto_modo TEXT NOT NULL DEFAULT 'mensualizado'
        CHECK (decimo_cuarto_modo IN ('mensualizado', 'acumulado')),
    fondo_reserva_modo TEXT NOT NULL DEFAULT 'mensual'
        CHECK (fondo_reserva_modo IN ('mensual', 'acumulado_iess', 'no_aplica')),
    cargas_familiares INTEGER NOT NULL DEFAULT 0,

    -- Datos bancarios
    banco TEXT,
    tipo_cuenta TEXT,
    numero_cuenta TEXT,

    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),

    UNIQUE (empresa_id, cedula)
);

-- RLS — mismo patrón multiempresa que 20260615_nominas_etapa0.sql
ALTER TABLE nominas.empleados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nominas_empleados_empresa" ON nominas.empleados
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

-- Permisos — redundante con ALTER DEFAULT PRIVILEGES de la Etapa 0, por seguridad.
GRANT ALL ON nominas.empleados TO authenticated, service_role;
