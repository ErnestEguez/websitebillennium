-- =============================================================
-- Etapa 3c: cuenta_contable en conceptos, estado 'liquidado',
--           tabla cuentas_nomina (mapeo contable)
-- =============================================================

-- 1. Campo cuenta_contable en conceptos de nómina
ALTER TABLE nominas.conceptos
    ADD COLUMN IF NOT EXISTS cuenta_contable TEXT;

-- 2. Ampliar CHECK de estado en periodos para incluir 'liquidado'
ALTER TABLE nominas.periodos
    DROP CONSTRAINT IF EXISTS periodos_estado_check;
ALTER TABLE nominas.periodos
    ADD CONSTRAINT periodos_estado_check
        CHECK (estado IN ('borrador', 'cerrado', 'liquidado'));

-- 3. Tabla cuentas_nomina: mapeo de cuentas contables del rol
CREATE TABLE IF NOT EXISTS nominas.cuentas_nomina (
    empresa_id              UUID PRIMARY KEY REFERENCES facturacion.empresas(id) ON DELETE CASCADE,

    -- Gastos (Débito en asiento del rol de pagos)
    cta_sueldos             TEXT,   -- Gasto Sueldos y Salarios
    cta_horas_extra         TEXT,   -- Gasto Horas Extra
    cta_dec_tercero         TEXT,   -- Gasto Décimo Tercero (provisión mensual)
    cta_dec_cuarto          TEXT,   -- Gasto Décimo Cuarto  (provisión mensual)
    cta_fondo_reserva       TEXT,   -- Gasto Fondo de Reserva
    cta_iess_patronal       TEXT,   -- Gasto Aporte Patronal IESS
    cta_vacaciones          TEXT,   -- Gasto Provisión Vacaciones

    -- Pasivos (Crédito en asiento del rol)
    cta_sueldos_pagar       TEXT,   -- Sueldos por Pagar (neto)
    cta_iess_pagar          TEXT,   -- IESS por Pagar (personal + patronal)
    cta_prov_dec_tercero    TEXT,   -- Provisión Décimo Tercero por Pagar
    cta_prov_dec_cuarto     TEXT,   -- Provisión Décimo Cuarto por Pagar
    cta_prov_fondo_reserva  TEXT,   -- Provisión Fondo de Reserva por Pagar
    cta_prov_vacaciones     TEXT,   -- Provisión Vacaciones por Pagar

    -- Activo (se acredita al descontar préstamos del rol)
    cta_anticipos_empleados TEXT,   -- Préstamos / Anticipos a Empleados

    updated_at  TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- RLS — patrón multiempresa estándar
ALTER TABLE nominas.cuentas_nomina ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cuentas_nomina_empresa" ON nominas.cuentas_nomina;
CREATE POLICY "cuentas_nomina_empresa" ON nominas.cuentas_nomina
    USING (
        empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas
            WHERE user_id = auth.uid() AND activo = true
        )
    );

GRANT ALL ON nominas.cuentas_nomina TO authenticated, service_role;
