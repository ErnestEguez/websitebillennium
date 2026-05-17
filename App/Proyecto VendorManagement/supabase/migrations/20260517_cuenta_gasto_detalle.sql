-- Cuenta contable de gasto por línea de servicio
ALTER TABLE facturacion.detalle_servicios
    ADD COLUMN IF NOT EXISTS cuenta_contable_id UUID NULL;

COMMENT ON COLUMN facturacion.detalle_servicios.cuenta_contable_id IS
    'UUID de cuenta LedgerPro (contabilidad.lp_cuentas) para el DR de este gasto';
