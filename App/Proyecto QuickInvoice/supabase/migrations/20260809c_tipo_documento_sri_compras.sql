-- Tipo de Documento SRI (Tabla 4) en compras — 2026-08-09
-- Esquema: facturacion
-- Punto 2D del plan de desarrollo. ingresos_stock es la cabecera
-- compartida por Compras de Inventario y Compras de Servicios
-- (tipo_compra distingue una de otra), así que una sola columna
-- cubre ambos módulos.

ALTER TABLE facturacion.ingresos_stock
    ADD COLUMN IF NOT EXISTS tipo_documento_sri VARCHAR(2) NOT NULL DEFAULT '01';

ALTER TABLE facturacion.ingresos_stock
    DROP CONSTRAINT IF EXISTS ingresos_stock_tipo_documento_sri_check;

ALTER TABLE facturacion.ingresos_stock
    ADD CONSTRAINT ingresos_stock_tipo_documento_sri_check
    CHECK (tipo_documento_sri IN (
        '01','02','03','04','05','06','07','08','09','11','12',
        '15','16','18','19','20','21','22','41','47','48'
    ));
