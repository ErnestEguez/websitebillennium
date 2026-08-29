-- ═══════════════════════════════════════════════════════════════════════════
-- RETENCIONES DE TARJETA DE CRÉDITO (RECAP del banco)
--
-- Retenciones de IVA que efectúan los bancos sobre los consumos con tarjeta
-- de crédito, informadas vía RECAP (no traen número de factura — cubren un
-- lote de ventas del día, no un comprobante puntual). Tabla separada de
-- facturacion.retenciones_ventas porque esa exige comprobante_id/cliente_id
-- obligatorios (con FK) y aquí no hay factura asociada.
--
-- Estas retenciones NO se declaran en el ATS (el ATS es por comprobante),
-- pero SÍ deben sumar en el casillero 601 del Formulario 104 (retención de
-- IVA que le efectuaron a la empresa en el período) — ver
-- contabilidad.lp_calcular_104.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS facturacion.retenciones_tarjeta_banco (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    fecha           DATE NOT NULL,
    banco           TEXT NOT NULL,
    numero_lote     TEXT,
    base_imponible  NUMERIC(12,2) NOT NULL DEFAULT 0,
    porcentaje      NUMERIC(5,2)  NOT NULL DEFAULT 0,
    valor           NUMERIC(12,2) NOT NULL,
    observaciones   TEXT,
    estado          TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'ANULADO')),
    created_by      UUID REFERENCES facturacion.profiles(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_retenciones_tarjeta_banco_empresa_fecha
    ON facturacion.retenciones_tarjeta_banco(empresa_id, fecha);

GRANT ALL ON facturacion.retenciones_tarjeta_banco TO authenticated, service_role;
ALTER TABLE facturacion.retenciones_tarjeta_banco ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "retenciones_tarjeta_banco_empresa" ON facturacion.retenciones_tarjeta_banco;
CREATE POLICY "retenciones_tarjeta_banco_empresa" ON facturacion.retenciones_tarjeta_banco
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
