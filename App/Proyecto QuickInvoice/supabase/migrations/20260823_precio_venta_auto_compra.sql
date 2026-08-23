-- ============================================================
-- Actualización automática de precio de venta al comprar
--
-- Toggle + tasa por empresa. Cuando está activo, al ingresar un producto
-- en Compras > Ingreso de Compra (nuevo o existente), se sugiere el precio
-- de venta como: precio_compra_sin_iva * (1 + tasa/100). El usuario puede
-- editar el valor final (con IVA incluido) antes de grabar; internamente
-- se guarda sin IVA en productos.precio_venta, como el resto del sistema.
--
-- Antes de esto, solo existía un 30% fijo hardcodeado en
-- NuevaCompraInventarioPage.tsx, aplicado únicamente a productos nuevos.
-- Esta migración formaliza esa tasa como configurable y extiende el
-- recálculo a productos ya existentes (opt-in vía el toggle).
-- ============================================================

ALTER TABLE facturacion.empresas
    ADD COLUMN IF NOT EXISTS actualizar_precio_venta_compra BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS tasa_incremento_precio_venta NUMERIC(6,2) NOT NULL DEFAULT 30;
