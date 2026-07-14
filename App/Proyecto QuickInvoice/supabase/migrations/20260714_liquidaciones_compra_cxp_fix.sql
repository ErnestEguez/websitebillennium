-- =====================================================================
-- PARCHE: cuentas_por_pagar — permitir CxP sin proveedor en catálogo
-- Necesario para Liquidaciones de Compra donde el beneficiario es una
-- persona natural sin RUC que puede no estar en el catálogo de proveedores.
-- =====================================================================

-- 1. proveedor_id nullable (ya tenía FK ON DELETE RESTRICT, la mantenemos)
ALTER TABLE facturacion.cuentas_por_pagar
    ALTER COLUMN proveedor_id DROP NOT NULL;

-- 2. Columna auxiliar para nombre del beneficiario cuando no hay proveedor
ALTER TABLE facturacion.cuentas_por_pagar
    ADD COLUMN IF NOT EXISTS beneficiario_nombre TEXT;
