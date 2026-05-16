-- VendorManagement: columnas de configuración contable
ALTER TABLE facturacion.empresas
    ADD COLUMN IF NOT EXISTS usar_contabilidad_compras BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS config_cuentas_compras    JSONB    DEFAULT '{}';

COMMENT ON COLUMN facturacion.empresas.usar_contabilidad_compras IS
    'TRUE = VendorManagement genera asientos en LedgerPro (schema contabilidad)';

COMMENT ON COLUMN facturacion.empresas.config_cuentas_compras IS
    'JSON con IDs de cuentas LedgerPro: inventarios, gastos_servicios, iva_compras, cuentas_por_pagar, efectivo, ret_fuente, ret_iva';
