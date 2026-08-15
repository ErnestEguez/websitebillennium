-- ============================================================
-- PRECISIÓN DECIMAL — detalle_ingresos_stock — 2026-08-15
-- ============================================================
-- Mismo problema ya corregido en productos/kardex el 2026-07-22
-- (20260722_precision_decimales_productos.sql): costo_unitario y subtotal
-- quedaron en DECIMAL(12,2) desde la creación original de la tabla y nunca
-- se ampliaron. Con el nuevo modo "Cantidad + Total" en Compras Inventario
-- (calcula el costo unitario hacia atrás con 4 decimales), Postgres
-- redondeaba silenciosamente a 2 decimales al insertar, perdiendo la
-- precisión calculada.

ALTER TABLE facturacion.detalle_ingresos_stock
    ALTER COLUMN costo_unitario TYPE NUMERIC(12,4),
    ALTER COLUMN subtotal       TYPE NUMERIC(12,4);
