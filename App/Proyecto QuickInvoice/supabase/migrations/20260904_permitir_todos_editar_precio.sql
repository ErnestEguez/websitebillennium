-- Por defecto solo el administrador puede cambiar el precio al facturar
-- (ver FacturaDirectaPage.tsx, puedeEditarPrecio). Esta columna deja que
-- cada empresa decida permitirlo para todos sus usuarios. Default false
-- para no cambiar el comportamiento de ninguna empresa existente.
ALTER TABLE facturacion.empresas
    ADD COLUMN IF NOT EXISTS permitir_todos_editar_precio BOOLEAN NOT NULL DEFAULT false;
