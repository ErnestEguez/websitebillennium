-- ═══════════════════════════════════════════════════════════════════════════
-- PROFORMAS — tablas de cabecera y detalle
-- ═══════════════════════════════════════════════════════════════════════════

-- Cabecera de proforma
CREATE TABLE IF NOT EXISTS facturacion.proformas (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id       UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    cliente_id       UUID NOT NULL REFERENCES facturacion.clientes(id),
    vendedor_id      UUID REFERENCES facturacion.vendedores(id),
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
    -- Referencia cruzada: se llena cuando la proforma se convierte en factura
    factura_id       UUID REFERENCES facturacion.comprobantes(id),
    factura_numero   TEXT,
    factura_fecha    DATE,
    -- Punto de emisión (para el contador de proformas)
    punto_emision_id UUID REFERENCES facturacion.puntos_emision(id),
    created_by       UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (empresa_id, numero)
);

-- Líneas de detalle de la proforma
CREATE TABLE IF NOT EXISTS facturacion.proforma_detalles (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proforma_id      UUID NOT NULL REFERENCES facturacion.proformas(id) ON DELETE CASCADE,
    producto_id      UUID,
    nombre_producto  TEXT NOT NULL,
    cantidad         NUMERIC(12,4) NOT NULL DEFAULT 1,
    precio_unitario  NUMERIC(12,4) NOT NULL DEFAULT 0,
    descuento        NUMERIC(12,4) NOT NULL DEFAULT 0,   -- porcentaje 0-100
    subtotal         NUMERIC(12,4) NOT NULL DEFAULT 0,   -- sin IVA
    iva_porcentaje   NUMERIC(5,2)  NOT NULL DEFAULT 0,
    iva_valor        NUMERIC(12,4) NOT NULL DEFAULT 0,
    total_linea      NUMERIC(12,4) NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_proformas_empresa    ON facturacion.proformas(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proformas_cliente    ON facturacion.proformas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_proforma_det_prf     ON facturacion.proforma_detalles(proforma_id);

-- ── Referencia cruzada en comprobantes ─────────────────────────────────────
-- Columnas que se llenan al convertir proforma → factura
ALTER TABLE facturacion.comprobantes
    ADD COLUMN IF NOT EXISTS proforma_id     UUID REFERENCES facturacion.proformas(id),
    ADD COLUMN IF NOT EXISTS proforma_numero TEXT;

-- ── Permisos y RLS ─────────────────────────────────────────────────────────
GRANT ALL ON facturacion.proformas         TO authenticated, service_role;
GRANT ALL ON facturacion.proforma_detalles TO authenticated, service_role;

ALTER TABLE facturacion.proformas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.proforma_detalles ENABLE ROW LEVEL SECURITY;

-- Política para proformas (multiempresa: acceso por profiles o usuario_empresas)
DROP POLICY IF EXISTS "proformas_empresa"     ON facturacion.proformas;
DROP POLICY IF EXISTS "proforma_det_empresa"  ON facturacion.proforma_detalles;

CREATE POLICY "proformas_empresa" ON facturacion.proformas
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

CREATE POLICY "proforma_det_empresa" ON facturacion.proforma_detalles
    FOR ALL USING (proforma_id IN (
        SELECT id FROM facturacion.proformas WHERE empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
        )
    ));
