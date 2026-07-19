-- Descuento por línea en compras de inventario (Compras Inventario > Productos).
-- costo_unitario sigue siendo el precio bruto de la factura del proveedor;
-- descuento es el valor monetario descontado en esa línea. El costo neto
-- (usado para Kardex/costo promedio) se calcula como
-- (cantidad*costo_unitario - descuento) / cantidad.
ALTER TABLE facturacion.detalle_ingresos_stock
    ADD COLUMN IF NOT EXISTS descuento NUMERIC(12,2) NOT NULL DEFAULT 0;
