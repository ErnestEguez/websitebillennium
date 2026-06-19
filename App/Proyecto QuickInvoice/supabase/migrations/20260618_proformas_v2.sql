-- ═══════════════════════════════════════════════════════════════════════════
-- PROFORMAS v2 — versión corregida
-- Ejecutar en Supabase SQL Editor (schema: facturacion)
-- ═══════════════════════════════════════════════════════════════════════════

-- Asegura que el contexto esté en el schema correcto
SET search_path TO facturacion, public, extensions;

-- ── Tabla de cabecera ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS facturacion.proformas (
    id               UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id       UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    cliente_id       UUID NOT NULL REFERENCES facturacion.clientes(id),
    vendedor_id      UUID          REFERENCES facturacion.vendedores(id),
    numero           TEXT NOT NULL,
    estado           TEXT NOT NULL DEFAULT 'vigente'
                         CHECK (estado IN ('vigente','convertida','anulada')),
    subtotal         NUMERIC(12,2) NOT NULL DEFAULT 0,
    descuento_total  NUMERIC(12,2) NOT NULL DEFAULT 0,
    base_iva_0       NUMERIC(12,2) NOT NULL DEFAULT 0,
    base_iva_15      NUMERIC(12,2) NOT NULL DEFAULT 0,
    valor_iva        NUMERIC(12,2) NOT NULL DEFAULT 0,
    total            NUMERIC(12,2) NOT NULL DEFAULT 0,
    observaciones    TEXT,
    -- Referencia cruzada (se llena al convertir en factura)
    factura_id       UUID          REFERENCES facturacion.comprobantes(id),
    factura_numero   TEXT,
    factura_fecha    DATE,
    -- Punto de emisión para contador propio de proformas
    punto_emision_id UUID          REFERENCES facturacion.puntos_emision(id),
    created_by       UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (empresa_id, numero)
);

-- ── Tabla de líneas ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS facturacion.proforma_detalles (
    id               UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    proforma_id      UUID NOT NULL REFERENCES facturacion.proformas(id) ON DELETE CASCADE,
    producto_id      UUID,
    nombre_producto  TEXT NOT NULL,
    cantidad         NUMERIC(12,4) NOT NULL DEFAULT 1,
    precio_unitario  NUMERIC(12,4) NOT NULL DEFAULT 0,
    descuento        NUMERIC(12,4) NOT NULL DEFAULT 0,
    subtotal         NUMERIC(12,4) NOT NULL DEFAULT 0,
    iva_porcentaje   NUMERIC(5,2)  NOT NULL DEFAULT 0,
    iva_valor        NUMERIC(12,4) NOT NULL DEFAULT 0,
    total_linea      NUMERIC(12,4) NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ── Índices ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_proformas_empresa
    ON facturacion.proformas(empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proformas_cliente
    ON facturacion.proformas(cliente_id);

CREATE INDEX IF NOT EXISTS idx_proforma_det_proforma
    ON facturacion.proforma_detalles(proforma_id);

-- ── Referencia cruzada en comprobantes ─────────────────────────────────────

ALTER TABLE facturacion.comprobantes
    ADD COLUMN IF NOT EXISTS proforma_id     UUID REFERENCES facturacion.proformas(id),
    ADD COLUMN IF NOT EXISTS proforma_numero TEXT;

-- ── Permisos ────────────────────────────────────────────────────────────────

GRANT ALL ON TABLE facturacion.proformas         TO authenticated;
GRANT ALL ON TABLE facturacion.proformas         TO service_role;
GRANT ALL ON TABLE facturacion.proforma_detalles TO authenticated;
GRANT ALL ON TABLE facturacion.proforma_detalles TO service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE facturacion.proformas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.proforma_detalles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proformas_empresa"    ON facturacion.proformas;
DROP POLICY IF EXISTS "proforma_det_empresa" ON facturacion.proforma_detalles;

CREATE POLICY "proformas_empresa" ON facturacion.proformas
    FOR ALL USING (
        empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
            UNION ALL
            SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
        )
    );

CREATE POLICY "proforma_det_empresa" ON facturacion.proforma_detalles
    FOR ALL USING (
        proforma_id IN (
            SELECT id FROM facturacion.proformas
            WHERE empresa_id IN (
                SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
                UNION ALL
                SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
            )
        )
    );

-- ── Verificación ─────────────────────────────────────────────────────────────
-- Al terminar deberías ver ambas tablas en el schema facturacion:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'facturacion' AND table_name LIKE 'proforma%';
