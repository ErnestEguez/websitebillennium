-- Habilita el toggle "Cuenta contable por ítem en Compra de Servicios"
-- (Ajustes ▸ Configuración ▸ Contabilidad ▸ Compra de Servicios).
--
-- usar_contabilidad_compras ya era leído por NuevaCompraServicioPage.tsx y
-- vendor/AjustesPage.tsx (con fallback "migración pendiente" si la columna
-- no existe), pero no había ninguna columna ni UI para activarlo.

ALTER TABLE facturacion.empresas
    ADD COLUMN IF NOT EXISTS usar_contabilidad_compras BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS config_cuentas_compras JSONB NOT NULL DEFAULT '{}';
