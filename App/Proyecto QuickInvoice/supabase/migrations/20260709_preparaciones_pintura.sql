-- ═══════════════════════════════════════════════════════════════════════════
-- MINI-PRODUCCIÓN DE PINTURAS AUTOMOTRICES
-- Fecha: 2026-07-09   Schema: facturacion
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO facturacion, extensions;

-- ── 1. Columna de configuración en empresas ─────────────────────────────────
ALTER TABLE facturacion.empresas
    ADD COLUMN IF NOT EXISTS codigo_prep_pintura TEXT;

-- ── 2. Cabecera de la mini-producción ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.preparaciones_pintura (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id          UUID        NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    fecha               DATE        NOT NULL DEFAULT CURRENT_DATE,
    descripcion         TEXT        NOT NULL,
    cantidad_producida  NUMERIC(10,4) NOT NULL DEFAULT 1,
    unidad              TEXT        NOT NULL DEFAULT 'L',
    costo_total         NUMERIC(12,2) NOT NULL DEFAULT 0,
    iva_porcentaje      NUMERIC(5,2)  NOT NULL DEFAULT 15,
    precio_con_iva      NUMERIC(12,2),
    precio_sin_iva      NUMERIC(12,2),
    iva_valor           NUMERIC(12,2),
    codigo_producto     TEXT        NOT NULL DEFAULT 'PREP-PINTURA',
    comprobante_id      UUID        REFERENCES facturacion.comprobantes(id),
    proforma_id         UUID        REFERENCES facturacion.proformas(id),
    estado              TEXT        NOT NULL DEFAULT 'PENDIENTE'
                            CHECK (estado IN ('PENDIENTE','PROFORMADA','FACTURADA','ANULADA')),
    created_by          UUID        REFERENCES auth.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_prep_pintura_empresa
    ON facturacion.preparaciones_pintura(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prep_pintura_comprobante
    ON facturacion.preparaciones_pintura(comprobante_id);
CREATE INDEX IF NOT EXISTS idx_prep_pintura_proforma
    ON facturacion.preparaciones_pintura(proforma_id);

-- ── 3. Insumos de cada preparación ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.preparacion_insumos (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    preparacion_id      UUID        NOT NULL REFERENCES facturacion.preparaciones_pintura(id) ON DELETE CASCADE,
    tipo                TEXT        NOT NULL DEFAULT 'BASE'
                            CHECK (tipo IN ('BASE', 'MEZCLA')),
    producto_id         UUID        NOT NULL REFERENCES facturacion.productos(id),
    descripcion         TEXT,
    cantidad            NUMERIC(10,4) NOT NULL,
    unidad              TEXT        NOT NULL DEFAULT 'L',
    costo_unitario      NUMERIC(12,4) NOT NULL DEFAULT 0,
    costo_total         NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_prep_insumos_preparacion
    ON facturacion.preparacion_insumos(preparacion_id);

-- ── 4. Permisos ─────────────────────────────────────────────────────────────
GRANT ALL ON facturacion.preparaciones_pintura TO authenticated, service_role;
GRANT ALL ON facturacion.preparacion_insumos   TO authenticated, service_role;

-- ── 5. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE facturacion.preparaciones_pintura ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.preparacion_insumos   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prep_pintura_empresa"  ON facturacion.preparaciones_pintura;
DROP POLICY IF EXISTS "prep_insumos_empresa"  ON facturacion.preparacion_insumos;

CREATE POLICY "prep_pintura_empresa" ON facturacion.preparaciones_pintura
    FOR ALL USING (
        empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles
            WHERE id = auth.uid()
            UNION ALL
            SELECT empresa_id FROM facturacion.usuario_empresas
            WHERE user_id = auth.uid() AND activo = true
        )
    );

CREATE POLICY "prep_insumos_empresa" ON facturacion.preparacion_insumos
    FOR ALL USING (
        preparacion_id IN (
            SELECT id FROM facturacion.preparaciones_pintura
            WHERE empresa_id IN (
                SELECT empresa_id FROM facturacion.profiles
                WHERE id = auth.uid()
                UNION ALL
                SELECT empresa_id FROM facturacion.usuario_empresas
                WHERE user_id = auth.uid() AND activo = true
            )
        )
    );
