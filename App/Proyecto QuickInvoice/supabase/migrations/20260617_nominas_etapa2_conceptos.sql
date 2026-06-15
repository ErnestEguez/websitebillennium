-- Etapa 2 — Catálogo de Conceptos de Nómina
--
-- Tabla parametrizable de rubros de ingreso y descuento para el rol de pagos.
-- Los conceptos estándar Ecuador se siembran desde el frontend al abrir la página.

CREATE TABLE IF NOT EXISTS nominas.conceptos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    codigo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'descuento')),
    formula TEXT NOT NULL DEFAULT 'calculado'
        CHECK (formula IN ('calculado', 'fijo', 'porcentaje_sueldo', 'porcentaje_sbu')),
    valor_predeterminado NUMERIC(10,4),
    afecta_iess    BOOLEAN NOT NULL DEFAULT false,
    afecta_renta   BOOLEAN NOT NULL DEFAULT false,
    es_legal       BOOLEAN NOT NULL DEFAULT false,
    aplica_siempre BOOLEAN NOT NULL DEFAULT true,
    orden          INTEGER NOT NULL DEFAULT 99,
    activo         BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    UNIQUE (empresa_id, codigo)
);

-- RLS — mismo patrón multiempresa que etapas anteriores.
ALTER TABLE nominas.conceptos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nominas_conceptos_empresa" ON nominas.conceptos
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

GRANT ALL ON nominas.conceptos TO authenticated, service_role;
