-- ================================================================
-- SUBPRODUCTOS: presentaciones/fracciones de un producto maestro
-- Ejemplo: Diluyente (TANQUE) → Galón, Litro, 1/2 Litro, etc.
-- El stock se gestiona en unidades del producto maestro.
-- factor_conversion indica cuántas unidades del maestro equivale
-- cada presentación (ej: 1 galón = 0.02 tanques si 1 tanque = 50 gal)
-- ================================================================

CREATE TABLE IF NOT EXISTS subproductos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id         UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    empresa_id          UUID NOT NULL REFERENCES empresas(id),
    nombre              VARCHAR(200) NOT NULL,
    precio_sin_iva      NUMERIC(12, 4) NOT NULL DEFAULT 0,
    factor_conversion   NUMERIC(14, 8) NOT NULL DEFAULT 1,
    estado              BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subproductos_producto ON subproductos(producto_id);
CREATE INDEX IF NOT EXISTS idx_subproductos_empresa  ON subproductos(empresa_id);

-- Referencia opcional en comprobante_detalles para trazabilidad
ALTER TABLE comprobante_detalles
    ADD COLUMN IF NOT EXISTS subproducto_id UUID REFERENCES subproductos(id);
