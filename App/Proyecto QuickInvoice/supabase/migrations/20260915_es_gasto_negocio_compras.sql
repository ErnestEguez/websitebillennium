-- Ventas a Crédito / Formulario 104 (IVA): distinguir gastos del negocio
-- (los únicos que se declaran en el 104) de gastos personales del dueño
-- registrados en el mismo sistema. Default true porque la inmensa mayoría
-- de las compras digitadas son gasto del negocio -- no cambia ningún
-- total existente al desplegar esto.
ALTER TABLE facturacion.ingresos_stock
    ADD COLUMN IF NOT EXISTS es_gasto_negocio BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN facturacion.ingresos_stock.es_gasto_negocio IS
    'true = gasto del negocio (se declara en el 104). false = gasto personal del propietario, solo para Impuesto a la Renta / reporte de gastos personales del SRI.';
