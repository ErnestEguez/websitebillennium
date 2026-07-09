-- ============================================================
-- MEJORAS GENERALES — 2026-07-08
-- Esquema: facturacion
-- ============================================================

-- ── 1. TABLA: lineas (catálogo de líneas de producto) ────────
CREATE TABLE IF NOT EXISTS facturacion.lineas (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id  UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    nombre      TEXT NOT NULL,
    descripcion TEXT,
    activo      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc', now())
);
ALTER TABLE facturacion.lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lineas_empresa" ON facturacion.lineas
    USING (empresa_id = (SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()));
GRANT ALL ON facturacion.lineas TO authenticated, service_role;

-- ── 2. TABLA: subcategorias ──────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.subcategorias (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id  UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    nombre      TEXT NOT NULL,
    descripcion TEXT,
    activo      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc', now())
);
ALTER TABLE facturacion.subcategorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subcategorias_empresa" ON facturacion.subcategorias
    USING (empresa_id = (SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()));
GRANT ALL ON facturacion.subcategorias TO authenticated, service_role;

-- ── 3. NUEVOS CAMPOS EN productos ────────────────────────────
ALTER TABLE facturacion.productos
    ADD COLUMN IF NOT EXISTS precio2               NUMERIC(12,4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS precio3               NUMERIC(12,4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS precio4               NUMERIC(12,4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cod_proveedor         TEXT,
    ADD COLUMN IF NOT EXISTS unidades_x_presentacion NUMERIC(12,2) DEFAULT 1,
    ADD COLUMN IF NOT EXISTS linea_id              UUID REFERENCES facturacion.lineas(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS subcategoria_id       UUID REFERENCES facturacion.subcategorias(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS minimo                NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ubicacion             TEXT;

-- ── 4. NUEVOS CAMPOS EN empresas ─────────────────────────────
ALTER TABLE facturacion.empresas
    ADD COLUMN IF NOT EXISTS tope_consumidor_final NUMERIC(12,2),   -- máx a facturar a CF
    ADD COLUMN IF NOT EXISTS glosa_factura         TEXT;             -- mensaje en todas las facturas

-- ── 5. RETENCIONES AUTOMÁTICAS EN proveedores ────────────────
ALTER TABLE facturacion.proveedores
    ADD COLUMN IF NOT EXISTS ret_fuente_codigo      TEXT,    -- código SRI (ej: '3480')
    ADD COLUMN IF NOT EXISTS ret_fuente_porcentaje  NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS ret_iva_codigo         TEXT,    -- código SRI IVA (ej: '725')
    ADD COLUMN IF NOT EXISTS ret_iva_porcentaje     NUMERIC(5,2);

-- ── 6. CAMPO saldo EN notas_credito (si no existe ya) ────────
-- saldo_nc ya existe según análisis; solo asegurar que tenga valor por defecto
ALTER TABLE facturacion.notas_credito
    ALTER COLUMN saldo_nc SET DEFAULT 0;

-- ── 7. ÍNDICES de performance ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_productos_linea      ON facturacion.productos(linea_id);
CREATE INDEX IF NOT EXISTS idx_productos_subcat     ON facturacion.productos(subcategoria_id);
CREATE INDEX IF NOT EXISTS idx_lineas_empresa       ON facturacion.lineas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_subcategorias_empresa ON facturacion.subcategorias(empresa_id);
