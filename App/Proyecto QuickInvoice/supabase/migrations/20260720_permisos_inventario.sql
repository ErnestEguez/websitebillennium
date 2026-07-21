-- Permisos granulares para todos los procesos de inventario (antes solo
-- existía perm_preparaciones_pintura; el resto del módulo no tenía toggle).
-- DEFAULT true para no bloquear a nadie de golpe al correr esto.

ALTER TABLE facturacion.user_permisos
    ADD COLUMN IF NOT EXISTS perm_productos             BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_ordenes_compra         BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_compras_inventario     BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_ajuste_inventario      BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_transferencia_bodega   BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_inventario_valorizado  BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_kardex                 BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_importar_articulos     BOOLEAN NOT NULL DEFAULT true;
