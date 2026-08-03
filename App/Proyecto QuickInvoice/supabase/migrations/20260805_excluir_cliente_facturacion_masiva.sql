-- ============================================================
-- Clientes excluidos de Facturación Masiva
--
-- Algunos clientes nunca deben entrar al lote mensual: "Consumidor
-- Final" (identificación genérica 9999999999999/9999999999, usada en
-- todo el sistema — ver validateIdentificacion en src/lib/utils.ts) o
-- clientes eventuales a los que se les factura otra cosa puntual (ej.
-- 1 firma electrónica al año), no el cargo recurrente. Se filtran por
-- completo de facturacionMasivaService.listarClientesFacturables, no
-- solo se desmarcan por defecto (a diferencia de bloqueo_credito, que
-- sí es un cliente recurrente normal, solo temporalmente suspendido).
-- ============================================================

ALTER TABLE facturacion.clientes
    ADD COLUMN IF NOT EXISTS excluido_facturacion_masiva BOOLEAN NOT NULL DEFAULT false;

-- Consumidor Final ya existe en todas las empresas con esa identificación
-- fija — se excluye automáticamente, no hace falta marcarlo a mano.
UPDATE facturacion.clientes
   SET excluido_facturacion_masiva = true
 WHERE identificacion IN ('9999999999999', '9999999999')
   AND excluido_facturacion_masiva = false;

-- ============================================================
-- Verificación
-- ============================================================
-- SELECT nombre, identificacion, excluido_facturacion_masiva
--   FROM facturacion.clientes WHERE identificacion LIKE '999999999%';

-- ============================================================
-- Rollback (comentado)
-- ============================================================
-- ALTER TABLE facturacion.clientes DROP COLUMN IF EXISTS excluido_facturacion_masiva;
