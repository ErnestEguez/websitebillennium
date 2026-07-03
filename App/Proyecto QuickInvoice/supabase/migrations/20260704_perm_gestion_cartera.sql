ALTER TABLE facturacion.user_permisos
    ADD COLUMN IF NOT EXISTS perm_gestion_cartera BOOLEAN NOT NULL DEFAULT true;
