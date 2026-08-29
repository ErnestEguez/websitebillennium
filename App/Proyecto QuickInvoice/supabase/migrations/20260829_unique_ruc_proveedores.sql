-- ═══════════════════════════════════════════════════════════════════════════
-- Evitar proveedores duplicados por RUC/Cédula dentro de la misma empresa
--
-- El chequeo existía solo a nivel de aplicación (proveedorService.crear) y
-- únicamente al crear, no al editar — un guardado casi simultáneo (dos
-- pestañas) o una edición que cambiara el RUC a uno ya existente podían
-- colarse. Este índice único es el respaldo real a nivel de base de datos.
--
-- Se usa btrim(ruc) porque el valor puede llegar con espacios — dos filas
-- "0907388268001" y "0907388268001 " deben contar como el mismo RUC.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS idx_proveedores_empresa_ruc_unico
    ON facturacion.proveedores (empresa_id, btrim(ruc));
