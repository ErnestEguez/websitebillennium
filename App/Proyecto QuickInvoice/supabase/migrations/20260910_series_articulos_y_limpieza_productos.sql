-- ============================================================
-- Series de artículos — comprobante_detalles.serial (fuente de
-- verdad, un valor por línea) + limpieza de columnas de productos
-- confirmadas sin uso en el código.
-- ============================================================
-- 1. Serie digitada por línea de factura — solo se usa en ventas a
--    crédito de electrodomésticos, opcional, nunca bloquea la venta.
ALTER TABLE facturacion.comprobante_detalles
    ADD COLUMN IF NOT EXISTS serial TEXT;

-- 2. Limpieza — 3 columnas de facturacion.productos que se revisaron
--    en el código y no tienen ningún lector ni escritor:
--    - controla_serie: se agregó en la Fase 0 del crédito para esto
--      mismo, pero el diseño cambió (ya no depende de un flag por
--      producto, sino de si la venta es a crédito) — nunca llegó a
--      usarse.
--    - cuenta_ingreso_nombre / cuenta_costo_nombre: se escribían al
--      elegir la cuenta contable en Productos, pero nunca se leían en
--      ningún lado (ni pantalla, ni reporte, ni generación de
--      asientos) — solo _id y _codigo están realmente en uso.
ALTER TABLE facturacion.productos
    DROP COLUMN IF EXISTS controla_serie,
    DROP COLUMN IF EXISTS cuenta_ingreso_nombre,
    DROP COLUMN IF EXISTS cuenta_costo_nombre;

-- ── Verificación sugerida después de correr esta migración ──
--   SELECT serial FROM facturacion.comprobante_detalles LIMIT 1;
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='facturacion' AND table_name='productos'
--     AND column_name IN ('controla_serie','cuenta_ingreso_nombre','cuenta_costo_nombre');
--   -- debe salir vacío
