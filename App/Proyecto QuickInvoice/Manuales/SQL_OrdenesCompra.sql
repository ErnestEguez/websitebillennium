-- ============================================================
-- ÓRDENES DE COMPRA + columnas contables en productos
-- Ejecutar en Supabase SQL Editor (schema facturacion)
-- ============================================================

-- 1. Columnas contables en productos
ALTER TABLE facturacion.productos
    ADD COLUMN IF NOT EXISTS cuenta_ingreso_id     TEXT,
    ADD COLUMN IF NOT EXISTS cuenta_ingreso_codigo TEXT,
    ADD COLUMN IF NOT EXISTS cuenta_ingreso_nombre TEXT,
    ADD COLUMN IF NOT EXISTS cuenta_costo_id       TEXT,
    ADD COLUMN IF NOT EXISTS cuenta_costo_codigo   TEXT,
    ADD COLUMN IF NOT EXISTS cuenta_costo_nombre   TEXT;

-- 2. Tabla órdenes de compra
CREATE TABLE IF NOT EXISTS facturacion.ordenes_compra (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id            UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    proveedor_id          UUID REFERENCES facturacion.proveedores(id),
    numero_oc             TEXT NOT NULL,
    fecha_emision         DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_entrega_esperada DATE,
    estado                TEXT NOT NULL DEFAULT 'BORRADOR'
                              CHECK (estado IN ('BORRADOR','ENVIADA','PARCIALMENTE_RECIBIDA','RECIBIDA','ANULADA')),
    observaciones         TEXT,
    subtotal              DECIMAL(12,2) DEFAULT 0,
    total                 DECIMAL(12,2) DEFAULT 0,
    created_by            UUID,
    created_at            TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at            TIMESTAMPTZ DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_ordenes_compra_empresa
    ON facturacion.ordenes_compra (empresa_id, estado, created_at DESC);

-- 3. Tabla detalle órdenes de compra
CREATE TABLE IF NOT EXISTS facturacion.detalle_ordenes_compra (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oc_id               UUID NOT NULL REFERENCES facturacion.ordenes_compra(id) ON DELETE CASCADE,
    producto_id         UUID REFERENCES facturacion.productos(id),
    descripcion         TEXT,
    cantidad_solicitada DECIMAL(12,3) NOT NULL DEFAULT 1,
    cantidad_recibida   DECIMAL(12,3) NOT NULL DEFAULT 0,
    costo_unitario      DECIMAL(12,4) NOT NULL DEFAULT 0,
    subtotal            DECIMAL(12,2) NOT NULL DEFAULT 0
);

-- 4. RLS
ALTER TABLE facturacion.ordenes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.detalle_ordenes_compra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oc_all"        ON facturacion.ordenes_compra;
DROP POLICY IF EXISTS "oc_detalle_all" ON facturacion.detalle_ordenes_compra;

CREATE POLICY "oc_all"         ON facturacion.ordenes_compra        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "oc_detalle_all" ON facturacion.detalle_ordenes_compra FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. RPC número correlativo OC
CREATE OR REPLACE FUNCTION facturacion.fn_siguiente_numero_oc(p_empresa_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    v_next INT;
BEGIN
    SELECT COALESCE(MAX(CAST(SPLIT_PART(numero_oc, '-', 3) AS INT)), 0) + 1
    INTO v_next
    FROM facturacion.ordenes_compra
    WHERE empresa_id = p_empresa_id
      AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());

    RETURN 'OC-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(v_next::TEXT, 4, '0');
END;
$$;

-- 6. Trigger updated_at
CREATE OR REPLACE FUNCTION facturacion.set_updated_at_oc()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = timezone('utc', now()); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_oc_updated_at ON facturacion.ordenes_compra;
CREATE TRIGGER trg_oc_updated_at
    BEFORE UPDATE ON facturacion.ordenes_compra
    FOR EACH ROW EXECUTE FUNCTION facturacion.set_updated_at_oc();

NOTIFY pgrst, 'reload schema';
