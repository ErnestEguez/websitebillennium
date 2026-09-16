-- Toma de Inventarios (Módulo de Inventarios) — listado para conteo físico:
-- Código, Descripción, Categoría, Stock; con búsqueda por nombre/código y
-- exportación a Excel. Permiso apagable por usuario, encendido por defecto
-- para no cambiar el acceso de nadie que ya usa el resto del módulo.
ALTER TABLE facturacion.user_permisos
    ADD COLUMN IF NOT EXISTS perm_toma_inventario BOOLEAN NOT NULL DEFAULT true;
