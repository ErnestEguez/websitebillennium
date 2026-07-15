-- Corrección: código 340 tenía 2% hardcodeado; el valor correcto SRI es 3%
-- (Liquidaciones de Compra — servicios, nivel cultural o rusticidad)
UPDATE facturacion.codigos_retencion
SET porcentaje = 3,
    descripcion = 'Por pagos a través de Liquidación de Compra — servicios (nivel cultural o rusticidad)',
    updated_at  = now()
WHERE codigo = '340' AND tipo = 'FUENTE';
