-- Agregar columna perm_gerencia a user_permisos
ALTER TABLE facturacion.user_permisos
    ADD COLUMN IF NOT EXISTS perm_gerencia BOOLEAN NOT NULL DEFAULT true;
