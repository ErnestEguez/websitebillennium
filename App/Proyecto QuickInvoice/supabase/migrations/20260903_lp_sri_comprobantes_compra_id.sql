-- Permite marcar qué comprobantes importados del SRI (contabilidad.lp_sri_comprobantes)
-- ya fueron migrados a una Compra real (facturacion.ingresos_stock), para no
-- volver a crearla si se reintenta la migración. Aditivo, nullable, no afecta
-- filas existentes ni el flujo de "Generar Diarios" (que usa su propia columna
-- comprobante_id, independiente de esta).
ALTER TABLE contabilidad.lp_sri_comprobantes
    ADD COLUMN IF NOT EXISTS compra_id UUID REFERENCES facturacion.ingresos_stock(id) ON DELETE SET NULL;
