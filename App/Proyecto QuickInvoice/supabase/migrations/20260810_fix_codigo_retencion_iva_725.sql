-- Corrige el código de retención IVA 30% "compra de bienes" en TODAS las
-- empresas existentes: 725 -> 1.
--
-- Probado en producción el 2026-08-10: el SRI rechazó un comprobante con
-- codigoRetencion=725 ("no existe o no está vigente"), y el mismo documento
-- con codigoRetencion=1 fue AUTORIZADO.
--
-- Alcance deliberadamente angosto: SOLO el código 725 (30%, compra de
-- bienes). Los otros códigos IVA del catálogo (726, 727, 728, 729, 730 —
-- 70% y 100% en otros escenarios) NO se tocan, no están verificados.
--
-- No afecta registros históricos: retenciones_compras.codigo_retencion
-- guarda el código como texto en cada fila ya emitida, esto solo corrige
-- el catálogo de selección (codigos_retencion) y el código default
-- configurado por proveedor (proveedores.ret_iva_codigo).

UPDATE facturacion.codigos_retencion
SET codigo = '1'
WHERE codigo = '725' AND tipo = 'IVA';

UPDATE facturacion.proveedores
SET ret_iva_codigo = '1'
WHERE ret_iva_codigo = '725';
