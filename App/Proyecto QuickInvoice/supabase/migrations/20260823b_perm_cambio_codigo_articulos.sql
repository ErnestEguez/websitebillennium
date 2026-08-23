-- ============================================================
-- Permiso para el nuevo módulo "Cambio de Código de Artículos"
-- (Inventario) — mismo patrón que el resto de permisos de inventario.
-- ============================================================

ALTER TABLE facturacion.user_permisos
    ADD COLUMN IF NOT EXISTS perm_cambio_codigo_articulos BOOLEAN NOT NULL DEFAULT true;
