-- ===== Finiquito / Acta de liquidación final =====
-- Cálculo legal Ecuador: sueldos pendientes, vacaciones, décimos, fondos reserva,
-- bonificación desahucio y/o indemnización según Código del Trabajo.

CREATE TABLE IF NOT EXISTS nominas.finiquitos (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    empleado_id     UUID NOT NULL REFERENCES nominas.empleados(id),

    -- Datos del vínculo laboral
    fecha_ingreso       DATE    NOT NULL,
    fecha_salida        DATE    NOT NULL,
    causa_terminacion   TEXT    NOT NULL CHECK (causa_terminacion IN (
                            'renuncia_voluntaria', 'desahucio_trabajador', 'acuerdo_partes',
                            'despido_intempestivo', 'fin_contrato', 'jubilacion', 'otro'
                        )),

    -- Parámetros de cálculo ingresados por el usuario
    ultimo_sueldo       NUMERIC(12,2) NOT NULL DEFAULT 0,
    mejor_sueldo        NUMERIC(12,2) NOT NULL DEFAULT 0,   -- para indemnización
    dias_pendientes     NUMERIC(6,2)  NOT NULL DEFAULT 0,   -- días del último período no pagados
    dias_vac_generadas  NUMERIC(6,2)  NOT NULL DEFAULT 0,
    dias_vac_gozadas    NUMERIC(6,2)  NOT NULL DEFAULT 0,
    horas_extras_pend   NUMERIC(12,2) NOT NULL DEFAULT 0,   -- valor $ de horas extras pendientes
    otros_ingresos      NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Ingresos calculados (se almacenan para el acta impresa)
    v_sueldo_pendiente  NUMERIC(12,2) NOT NULL DEFAULT 0,
    v_horas_extras      NUMERIC(12,2) NOT NULL DEFAULT 0,
    v_vacaciones        NUMERIC(12,2) NOT NULL DEFAULT 0,
    v_decimo_tercero    NUMERIC(12,2) NOT NULL DEFAULT 0,
    v_decimo_cuarto     NUMERIC(12,2) NOT NULL DEFAULT 0,
    v_fondos_reserva    NUMERIC(12,2) NOT NULL DEFAULT 0,
    v_bonif_desahucio   NUMERIC(12,2) NOT NULL DEFAULT 0,
    v_indemnizacion     NUMERIC(12,2) NOT NULL DEFAULT 0,
    v_otros_ingresos    NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Descuentos
    d_iess_personal     NUMERIC(12,2) NOT NULL DEFAULT 0,
    d_prestamos_empresa NUMERIC(12,2) NOT NULL DEFAULT 0,
    d_prestamos_iess    NUMERIC(12,2) NOT NULL DEFAULT 0,
    d_anticipos         NUMERIC(12,2) NOT NULL DEFAULT 0,
    d_otros_descuentos  NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Totales
    total_ingresos      NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_descuentos    NUMERIC(12,2) NOT NULL DEFAULT 0,
    neto_a_pagar        NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Estado y documentación
    estado          TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN (
                        'borrador', 'aprobado', 'pagado', 'registrado_sut'
                    )),
    fecha_pago      DATE,
    numero_acta     TEXT,
    observaciones   TEXT,

    created_at  TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at  TIMESTAMPTZ DEFAULT timezone('utc', now())
);

CREATE OR REPLACE FUNCTION nominas.finiquitos_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = timezone('utc', now()); RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER nominas_finiquitos_updated_at
    BEFORE UPDATE ON nominas.finiquitos
    FOR EACH ROW EXECUTE FUNCTION nominas.finiquitos_updated_at();

ALTER TABLE nominas.finiquitos ENABLE ROW LEVEL SECURITY;

CREATE POLICY finiquitos_multiempresa ON nominas.finiquitos
    USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas
            WHERE user_id = auth.uid() AND activo = true
    ));

GRANT ALL ON nominas.finiquitos TO authenticated, service_role;
