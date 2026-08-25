-- ═══════════════════════════════════════════════════════════════════════════
-- TALLA / COLOR — captura en comprobante_detalles + tabla de métricas
--
-- talla/color son nullable y aditivas: no afectan ninguna fila existente ni
-- ninguna consulta actual sobre comprobante_detalles (solo se llenan cuando
-- la línea viene de una Facturación en Vivo con esos datos capturados).
--
-- ventas_talla_color es una tabla de hechos dedicada para la pantalla de
-- consulta (Código/Descripción/Talla/Color/Cantidad por periodo) sin tener
-- que escanear comprobante_detalles completo — se escribe desde la
-- aplicación en el mismo momento que se graba la línea de la factura.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE facturacion.comprobante_detalles
    ADD COLUMN IF NOT EXISTS talla TEXT,
    ADD COLUMN IF NOT EXISTS color TEXT;

CREATE TABLE IF NOT EXISTS facturacion.ventas_talla_color (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    producto_id     UUID,
    codigo          TEXT,
    nombre_producto TEXT,
    talla           TEXT,
    color           TEXT,
    cantidad        NUMERIC(12,4) NOT NULL,
    fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
    comprobante_id  UUID REFERENCES facturacion.comprobantes(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_ventas_talla_color_empresa ON facturacion.ventas_talla_color(empresa_id, fecha);
CREATE INDEX IF NOT EXISTS idx_ventas_talla_color_prod    ON facturacion.ventas_talla_color(empresa_id, producto_id, fecha);

GRANT ALL ON facturacion.ventas_talla_color TO authenticated, service_role;
ALTER TABLE facturacion.ventas_talla_color ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ventas_talla_color_empresa" ON facturacion.ventas_talla_color;
CREATE POLICY "ventas_talla_color_empresa" ON facturacion.ventas_talla_color
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
