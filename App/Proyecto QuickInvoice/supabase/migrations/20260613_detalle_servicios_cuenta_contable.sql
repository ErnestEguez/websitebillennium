-- Compra de Servicios: cuenta contable de gasto por línea
--
-- El frontend (NuevaCompraServicioPage.tsx) ya tiene un selector por línea
-- "Cuenta de gasto (contable)" y el tipo DetalleServicio ya declara
-- cuenta_contable_id, pero la columna nunca se agregó a la tabla ->
-- el INSERT a detalle_servicios falla (o el valor se pierde) cuando el
-- usuario selecciona una cuenta distinta a la de mapeo general.
--
-- Sin esta columna, contabilidadComprasService.crearAsientoCompra solo
-- puede usar UNA cuenta de mapeo (COMPRAS:GASTO_SERVICIO) para todo el
-- asiento, lo cual es conceptualmente incorrecto cuando una compra de
-- servicios mezcla gastos de distinta naturaleza (ej. honorarios +
-- arrendamiento + transporte).

ALTER TABLE facturacion.detalle_servicios
    ADD COLUMN IF NOT EXISTS cuenta_contable_id UUID NULL;

COMMENT ON COLUMN facturacion.detalle_servicios.cuenta_contable_id IS
    'Cuenta contable de gasto (contabilidad.lp_cuentas.id) seleccionada para esta línea. '
    'Si es NULL, el asiento usa la cuenta de mapeo COMPRAS:GASTO_SERVICIO de Ajustes → Contabilidad.';
