-- ============================================================
-- MULTI-BODEGA — Migración de datos históricos
-- Ejecutar DESPUÉS de SQL_Bodegas_Estructura.sql
-- Todas las transacciones antiguas quedan asignadas a "Bodega Principal"
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- PASO 1: Crear "Bodega Principal" para cada empresa existente
--         Solo si aún no tiene una bodega marcada como principal
-- ─────────────────────────────────────────────────────────────
INSERT INTO facturacion.bodegas (
    empresa_id,
    nombre,
    codigo,
    descripcion,
    es_principal,
    activo
)
SELECT
    e.id,
    'Bodega Principal',
    'BOD-001',
    'Bodega por defecto (migración automática)',
    true,
    true
FROM facturacion.empresas e
WHERE NOT EXISTS (
    SELECT 1
    FROM facturacion.bodegas b
    WHERE b.empresa_id = e.id
      AND b.es_principal = true
);

-- ─────────────────────────────────────────────────────────────
-- PASO 2: Asignar bodega_id en kardex
-- ─────────────────────────────────────────────────────────────
UPDATE facturacion.kardex k
SET bodega_id = b.id
FROM facturacion.bodegas b
WHERE b.empresa_id = k.empresa_id
  AND b.es_principal = true
  AND k.bodega_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- PASO 3: Asignar bodega_id en cabecera de compras (ingresos_stock)
-- ─────────────────────────────────────────────────────────────
UPDATE facturacion.ingresos_stock i
SET bodega_id = b.id
FROM facturacion.bodegas b
WHERE b.empresa_id = i.empresa_id
  AND b.es_principal = true
  AND i.bodega_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- PASO 4: Propagar bodega_id al detalle de compras
--         Hereda del encabezado (ingresos_stock)
-- ─────────────────────────────────────────────────────────────
UPDATE facturacion.detalle_ingresos_stock d
SET bodega_id = i.bodega_id
FROM facturacion.ingresos_stock i
WHERE d.ingreso_id = i.id
  AND d.bodega_id IS NULL
  AND i.bodega_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- PASO 5: Asignar bodega_id en cabecera de órdenes de compra
-- ─────────────────────────────────────────────────────────────
UPDATE facturacion.ordenes_compra o
SET bodega_id = b.id
FROM facturacion.bodegas b
WHERE b.empresa_id = o.empresa_id
  AND b.es_principal = true
  AND o.bodega_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- PASO 6: Propagar bodega_id al detalle de órdenes de compra
-- ─────────────────────────────────────────────────────────────
UPDATE facturacion.detalle_ordenes_compra d
SET bodega_id = o.bodega_id
FROM facturacion.ordenes_compra o
WHERE d.oc_id = o.id
  AND d.bodega_id IS NULL
  AND o.bodega_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- PASO 7: Asignar bodega_id en comprobantes de venta
-- ─────────────────────────────────────────────────────────────
UPDATE facturacion.comprobantes c
SET bodega_id = b.id
FROM facturacion.bodegas b
WHERE b.empresa_id = c.empresa_id
  AND b.es_principal = true
  AND c.bodega_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- PASO 8: Poblar stock_bodega desde productos.stock actual
--         Stock histórico real va a la bodega principal
-- ─────────────────────────────────────────────────────────────
INSERT INTO facturacion.stock_bodega (
    empresa_id,
    bodega_id,
    producto_id,
    cantidad,
    costo_promedio
)
SELECT
    p.empresa_id,
    b.id,
    p.id,
    COALESCE(p.stock, 0),
    COALESCE(p.costo_promedio, 0)
FROM facturacion.productos p
JOIN facturacion.bodegas b
    ON b.empresa_id = p.empresa_id
   AND b.es_principal = true
WHERE p.maneja_stock = true
ON CONFLICT (bodega_id, producto_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- VERIFICACIÓN — Ejecutar para confirmar que todo quedó asignado
-- ─────────────────────────────────────────────────────────────
SELECT 'bodegas creadas'         AS tabla, COUNT(*) AS total FROM facturacion.bodegas
UNION ALL
SELECT 'stock_bodega seeded',     COUNT(*) FROM facturacion.stock_bodega
UNION ALL
SELECT 'kardex sin bodega',       COUNT(*) FROM facturacion.kardex           WHERE bodega_id IS NULL
UNION ALL
SELECT 'ingresos_stock sin bod',  COUNT(*) FROM facturacion.ingresos_stock   WHERE bodega_id IS NULL
UNION ALL
SELECT 'det_ingresos sin bod',    COUNT(*) FROM facturacion.detalle_ingresos_stock WHERE bodega_id IS NULL
UNION ALL
SELECT 'ordenes_compra sin bod',  COUNT(*) FROM facturacion.ordenes_compra   WHERE bodega_id IS NULL
UNION ALL
SELECT 'det_oc sin bod',          COUNT(*) FROM facturacion.detalle_ordenes_compra WHERE bodega_id IS NULL
UNION ALL
SELECT 'comprobantes sin bod',    COUNT(*) FROM facturacion.comprobantes     WHERE bodega_id IS NULL;

-- Los registros "sin bodega" deben ser 0 en todas las tablas.
-- Si alguno queda en >0 revisar si hay empresa_id huerfano.

NOTIFY pgrst, 'reload schema';
