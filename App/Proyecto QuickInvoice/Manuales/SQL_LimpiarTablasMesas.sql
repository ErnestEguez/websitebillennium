-- =====================================================
-- Script: Limpiar tablas de Restaurante que NO se usan
-- en QuickInvoice (Ferretería / Facturación Directa)
-- LEER ANTES DE EJECUTAR:
--   1. Primero ejecutar el SELECT para confirmar que no hay datos importantes
--   2. El orden importa por las FK: pedido_detalles → pedidos → (mesas/comprobantes)
-- =====================================================

-- PASO 0: Verificar cuántos registros tiene cada tabla antes de borrar
SELECT 'mesas'           AS tabla, COUNT(*) FROM mesas
UNION ALL
SELECT 'pedidos',                  COUNT(*) FROM pedidos
UNION ALL
SELECT 'pedido_detalles',          COUNT(*) FROM pedido_detalles
UNION ALL
SELECT 'comprobantes con pedido',  COUNT(*) FROM comprobantes WHERE pedido_id IS NOT NULL;

-- =====================================================
-- Si confirmas que no hay datos críticos, ejecuta:
-- =====================================================

-- PASO 1: Eliminar la FK que apunta de comprobantes → pedidos
-- (para poder borrar la tabla pedidos sin error)
ALTER TABLE public.comprobantes
    DROP CONSTRAINT IF EXISTS comprobantes_pedido_id_fkey;

-- Poner la columna como NULL (ya debería serlo para facturas directas)
ALTER TABLE public.comprobantes
    ALTER COLUMN pedido_id DROP NOT NULL;

-- PASO 2: Vaciar las tablas en orden (si aún hay datos de prueba)
TRUNCATE TABLE public.pedido_detalles CASCADE;
TRUNCATE TABLE public.pedidos         CASCADE;
TRUNCATE TABLE public.mesas           CASCADE;

-- PASO 3: Eliminar las tablas
DROP TABLE IF EXISTS public.pedido_detalles CASCADE;
DROP TABLE IF EXISTS public.pedidos         CASCADE;
DROP TABLE IF EXISTS public.mesas           CASCADE;

-- PASO 4 (OPCIONAL): Agregar campo email a la tabla empresas si no existe
ALTER TABLE public.empresas
    ADD COLUMN IF NOT EXISTS email TEXT;

-- =====================================================
-- Verificar que todo quedó bien
-- =====================================================
SELECT id, nombre, ruc, email, config_sri->>'ambiente' AS sri_ambiente
FROM empresas
ORDER BY nombre;
