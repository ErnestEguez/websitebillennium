-- Ferreterías: algunos artículos implican entregar automáticamente otro
-- (ej. 1 Lb de Masilla -> 1 unidad de Catalizador; 1 Galón -> 4 unidades).
-- El producto relacionado no tiene precio propio en esa entrega (va a
-- $0 en la línea de factura), pero sí descuenta stock normalmente por
-- Kardex -- es un artículo real que se entrega físicamente.
ALTER TABLE facturacion.productos
    ADD COLUMN IF NOT EXISTS producto_relacionado_id UUID REFERENCES facturacion.productos(id),
    ADD COLUMN IF NOT EXISTS cantidad_relacionada NUMERIC(10,4);

COMMENT ON COLUMN facturacion.productos.producto_relacionado_id IS
    'Producto que se entrega automáticamente (a precio $0) por cada unidad vendida de este. NULL = sin relación.';
COMMENT ON COLUMN facturacion.productos.cantidad_relacionada IS
    'Unidades del producto relacionado que se entregan por cada 1 unidad vendida de este producto.';
