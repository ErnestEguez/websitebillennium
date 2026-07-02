-- ============================================================
-- Cierre de Caja General
-- 2026-07-02
-- ============================================================

-- Movimientos extra de caja general (durante el día)
CREATE TABLE IF NOT EXISTS facturacion.caja_general_movimientos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    numero TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('INGRESO', 'EGRESO')),
    motivo TEXT NOT NULL,
    valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
    cuenta_contable_id UUID,
    cuenta_contable_codigo TEXT,
    cuenta_contable_nombre TEXT,
    user_id UUID REFERENCES auth.users(id),
    user_nombre TEXT,
    estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'ANULADO')),
    cierre_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Cierres de caja general
CREATE TABLE IF NOT EXISTS facturacion.caja_general_cierres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    estado TEXT NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO', 'CERRADO', 'ANULADO')),
    base_caja NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_ventas_efectivo NUMERIC(12,2) DEFAULT 0,
    total_ventas_cheque NUMERIC(12,2) DEFAULT 0,
    total_ventas_otros NUMERIC(12,2) DEFAULT 0,
    total_ventas NUMERIC(12,2) DEFAULT 0,
    total_cartera_efectivo NUMERIC(12,2) DEFAULT 0,
    total_cartera_cheque NUMERIC(12,2) DEFAULT 0,
    total_cartera_otros NUMERIC(12,2) DEFAULT 0,
    total_cartera NUMERIC(12,2) DEFAULT 0,
    total_ingresos_extra NUMERIC(12,2) DEFAULT 0,
    total_egresos_extra NUMERIC(12,2) DEFAULT 0,
    total_efectivo_dia NUMERIC(12,2) DEFAULT 0,
    total_cheques_dia NUMERIC(12,2) DEFAULT 0,
    observaciones TEXT,
    con_detalle BOOLEAN DEFAULT true,
    diario_id UUID,
    user_cierre_id UUID REFERENCES auth.users(id),
    user_cierre_nombre TEXT,
    fecha_cierre TIMESTAMPTZ,
    anulado_por UUID REFERENCES auth.users(id),
    fecha_anulacion TIMESTAMPTZ,
    motivo_anulacion TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Depósitos bancarios del cierre
CREATE TABLE IF NOT EXISTS facturacion.caja_general_depositos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cierre_id UUID NOT NULL REFERENCES facturacion.caja_general_cierres(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL,
    cuenta_banco_id UUID,
    cuenta_banco_nombre TEXT NOT NULL,
    cuenta_contable_banco_id UUID,
    cuenta_contable_banco_codigo TEXT,
    cuenta_contable_banco_nombre TEXT,
    tipo_deposito TEXT NOT NULL CHECK (tipo_deposito IN ('EFECTIVO', 'CHEQUE')),
    valor NUMERIC(12,2) NOT NULL,
    numero_comprobante TEXT,
    fecha_deposito DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Configuración de caja en empresas
ALTER TABLE facturacion.empresas
    ADD COLUMN IF NOT EXISTS config_caja JSONB DEFAULT '{}'::jsonb;

-- FK: movimientos → cierre
ALTER TABLE facturacion.caja_general_movimientos
    ADD CONSTRAINT fk_mov_cierre FOREIGN KEY (cierre_id)
    REFERENCES facturacion.caja_general_cierres(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE facturacion.caja_general_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.caja_general_cierres ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.caja_general_depositos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "caja_gral_mov_empresa"    ON facturacion.caja_general_movimientos;
DROP POLICY IF EXISTS "caja_gral_cierre_empresa" ON facturacion.caja_general_cierres;
DROP POLICY IF EXISTS "caja_gral_dep_empresa"    ON facturacion.caja_general_depositos;

CREATE POLICY "caja_gral_mov_empresa" ON facturacion.caja_general_movimientos
    FOR ALL USING (empresa_id IN (SELECT facturacion.mis_empresas_ids()));

CREATE POLICY "caja_gral_cierre_empresa" ON facturacion.caja_general_cierres
    FOR ALL USING (empresa_id IN (SELECT facturacion.mis_empresas_ids()));

CREATE POLICY "caja_gral_dep_empresa" ON facturacion.caja_general_depositos
    FOR ALL USING (empresa_id IN (SELECT facturacion.mis_empresas_ids()));

GRANT ALL ON facturacion.caja_general_movimientos TO authenticated, service_role;
GRANT ALL ON facturacion.caja_general_cierres     TO authenticated, service_role;
GRANT ALL ON facturacion.caja_general_depositos   TO authenticated, service_role;
