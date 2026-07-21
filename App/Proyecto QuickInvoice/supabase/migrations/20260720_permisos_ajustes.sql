-- Permisos granulares para el bloque "Ajustes" del menú (perm_importar_articulos
-- ya existe desde 20260720_permisos_inventario.sql — no se repite aquí).
-- DEFAULT true para no bloquear a nadie de golpe al correr esto.

ALTER TABLE facturacion.user_permisos
    ADD COLUMN IF NOT EXISTS perm_configuracion       BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_codigos_retencion   BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_vendedores          BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_importar_clientes   BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_migracion_cartera   BOOLEAN NOT NULL DEFAULT true;
