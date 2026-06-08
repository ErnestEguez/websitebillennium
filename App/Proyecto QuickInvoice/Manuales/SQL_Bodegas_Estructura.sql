-- ============================================================
-- MULTI-BODEGA — Estructura
-- Ejecutar PRIMERO en Supabase SQL Editor (schema facturacion)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Tabla bodegas
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.bodegas (
    id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id                UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    nombre                    TEXT NOT NULL,
    codigo                    TEXT,
    descripcion               TEXT,
    direccion                 TEXT,
    -- Cuenta contable de inventario asignada a esta bodega
    cuenta_inventario_id      TEXT,
    cuenta_inventario_codigo  TEXT,
    cuenta_inventario_nombre  TEXT,
    es_principal              BOOLEAN NOT NULL DEFAULT false,
    activo                    BOOLEAN NOT NULL DEFAULT true,
    created_at                TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at                TIMESTAMPTZ DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_bodegas_empresa
    ON facturacion.bodegas (empresa_id, activo);

-- ─────────────────────────────────────────────────────────────
-- 2. Tabla stock por bodega
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.stock_bodega (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    bodega_id       UUID NOT NULL REFERENCES facturacion.bodegas(id)  ON DELETE CASCADE,
    producto_id     UUID NOT NULL REFERENCES facturacion.productos(id) ON DELETE CASCADE,
    cantidad        DECIMAL(12,3) NOT NULL DEFAULT 0,
    costo_promedio  DECIMAL(12,4) NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT timezone('utc', now()),
    UNIQUE (bodega_id, producto_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_bodega_empresa
    ON facturacion.stock_bodega (empresa_id, bodega_id);

CREATE INDEX IF NOT EXISTS idx_stock_bodega_producto
    ON facturacion.stock_bodega (producto_id);

-- ─────────────────────────────────────────────────────────────
-- 3. Agregar bodega_id a las tablas de movimientos
-- ─────────────────────────────────────────────────────────────

-- 3a. Kardex
ALTER TABLE facturacion.kardex
    ADD COLUMN IF NOT EXISTS bodega_id UUID REFERENCES facturacion.bodegas(id);

CREATE INDEX IF NOT EXISTS idx_kardex_bodega
    ON facturacion.kardex (bodega_id);

-- 3b. Cabecera de compras de inventario
ALTER TABLE facturacion.ingresos_stock
    ADD COLUMN IF NOT EXISTS bodega_id UUID REFERENCES facturacion.bodegas(id);

CREATE INDEX IF NOT EXISTS idx_ingresos_stock_bodega
    ON facturacion.ingresos_stock (bodega_id);

-- 3c. Detalle de compras de inventario
ALTER TABLE facturacion.detalle_ingresos_stock
    ADD COLUMN IF NOT EXISTS bodega_id UUID REFERENCES facturacion.bodegas(id);

-- 3d. Cabecera de órdenes de compra
ALTER TABLE facturacion.ordenes_compra
    ADD COLUMN IF NOT EXISTS bodega_id UUID REFERENCES facturacion.bodegas(id);

-- 3e. Detalle de órdenes de compra
ALTER TABLE facturacion.detalle_ordenes_compra
    ADD COLUMN IF NOT EXISTS bodega_id UUID REFERENCES facturacion.bodegas(id);

-- 3f. Comprobantes de venta (para la salida de stock)
ALTER TABLE facturacion.comprobantes
    ADD COLUMN IF NOT EXISTS bodega_id UUID REFERENCES facturacion.bodegas(id);

CREATE INDEX IF NOT EXISTS idx_comprobantes_bodega
    ON facturacion.comprobantes (bodega_id);

-- ─────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE facturacion.bodegas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.stock_bodega  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bodegas_all"      ON facturacion.bodegas;
DROP POLICY IF EXISTS "stock_bodega_all" ON facturacion.stock_bodega;

CREATE POLICY "bodegas_all"
    ON facturacion.bodegas FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "stock_bodega_all"
    ON facturacion.stock_bodega FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 5. Trigger updated_at en bodegas
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION facturacion.set_updated_at_bodegas()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bodegas_updated_at ON facturacion.bodegas;
CREATE TRIGGER trg_bodegas_updated_at
    BEFORE UPDATE ON facturacion.bodegas
    FOR EACH ROW EXECUTE FUNCTION facturacion.set_updated_at_bodegas();

-- ─────────────────────────────────────────────────────────────
-- 6. RPC — Recalcular stock_bodega desde kardex
--    Útil para auditoría o corrección de inconsistencias
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION facturacion.fn_recalcular_stock_bodega(p_empresa_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    -- Toma el último saldo de kardex por (bodega, producto) y lo upserta en stock_bodega
    WITH ultimo_kardex AS (
        SELECT DISTINCT ON (bodega_id, producto_id)
            empresa_id,
            bodega_id,
            producto_id,
            saldo_cantidad,
            saldo_costo_promedio
        FROM facturacion.kardex
        WHERE empresa_id = p_empresa_id
          AND bodega_id IS NOT NULL
        ORDER BY bodega_id, producto_id, fecha DESC, created_at DESC NULLS LAST
    )
    INSERT INTO facturacion.stock_bodega
        (empresa_id, bodega_id, producto_id, cantidad, costo_promedio, updated_at)
    SELECT
        empresa_id,
        bodega_id,
        producto_id,
        COALESCE(saldo_cantidad, 0),
        COALESCE(saldo_costo_promedio, 0),
        timezone('utc', now())
    FROM ultimo_kardex
    ON CONFLICT (bodega_id, producto_id) DO UPDATE
        SET cantidad       = EXCLUDED.cantidad,
            costo_promedio = EXCLUDED.costo_promedio,
            updated_at     = EXCLUDED.updated_at;

    -- Actualiza productos.stock como suma de todas las bodegas (compatibilidad)
    UPDATE facturacion.productos p
    SET stock = (
        SELECT COALESCE(SUM(sb.cantidad), 0)
        FROM facturacion.stock_bodega sb
        WHERE sb.producto_id = p.id
    )
    WHERE p.empresa_id = p_empresa_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
