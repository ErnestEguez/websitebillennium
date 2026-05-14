-- ============================================================
-- LEDGER PRO — Integración SRI (Compras, Retenciones, NC, ND)
-- El usuario descarga el CSV del portal SRI y lo sube a LP
-- ============================================================

-- ── Log de importaciones ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conta.lp_sri_importaciones (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id  UUID NOT NULL REFERENCES conta.lp_empresas(id),
    año         INT  NOT NULL,
    mes         INT  NOT NULL CHECK (mes BETWEEN 1 AND 12),
    tipo        TEXT NOT NULL CHECK (tipo IN ('factura','retencion','nota_credito','nota_debito')),
    archivo     TEXT,
    total_reg   INT  NOT NULL DEFAULT 0,
    nuevos      INT  NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Comprobantes importados del SRI ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS conta.lp_sri_comprobantes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id       UUID NOT NULL REFERENCES conta.lp_empresas(id),
    importacion_id   UUID REFERENCES conta.lp_sri_importaciones(id),
    año              INT  NOT NULL,
    mes              INT  NOT NULL,
    tipo             TEXT NOT NULL CHECK (tipo IN ('factura','retencion','nota_credito','nota_debito')),

    -- Contraparte
    proveedor_ruc    TEXT NOT NULL,
    proveedor_nombre TEXT NOT NULL,

    -- Identificación
    numero           TEXT NOT NULL,
    clave_acceso     TEXT,
    fecha_emision    DATE NOT NULL,

    -- Montos (facturas, NC, ND)
    base_cero        NUMERIC(18,2) NOT NULL DEFAULT 0,
    base_iva         NUMERIC(18,2) NOT NULL DEFAULT 0,
    iva              NUMERIC(18,2) NOT NULL DEFAULT 0,
    total            NUMERIC(18,2) NOT NULL DEFAULT 0,

    -- Retenciones
    codigo_retencion TEXT,
    porcentaje_ret   NUMERIC(5,2),
    valor_retenido   NUMERIC(18,2),

    -- Mapeo contable asignado
    cuenta_gasto_id      UUID REFERENCES conta.lp_cuentas(id),
    cuenta_iva_id        UUID REFERENCES conta.lp_cuentas(id),
    cuenta_retencion_id  UUID REFERENCES conta.lp_cuentas(id),
    cuenta_proveedor_id  UUID REFERENCES conta.lp_cuentas(id),

    -- Estado contable
    estado           TEXT NOT NULL DEFAULT 'pendiente'
                          CHECK (estado IN ('pendiente','listo','contabilizado')),
    comprobante_id   UUID REFERENCES conta.lp_comprobantes(id),

    raw_data         JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(empresa_id, tipo, numero, proveedor_ruc)
);

-- ── Reglas de mapeo contable por proveedor/tipo ───────────────────────────
CREATE TABLE IF NOT EXISTS conta.lp_sri_mapeos (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id           UUID NOT NULL REFERENCES conta.lp_empresas(id),
    tipo                 TEXT NOT NULL CHECK (tipo IN ('factura','retencion','nota_credito','nota_debito')),
    proveedor_ruc        TEXT,           -- NULL = aplica a todos los proveedores del tipo
    cuenta_gasto_id      UUID REFERENCES conta.lp_cuentas(id),
    cuenta_iva_id        UUID REFERENCES conta.lp_cuentas(id),
    cuenta_retencion_id  UUID REFERENCES conta.lp_cuentas(id),
    cuenta_proveedor_id  UUID REFERENCES conta.lp_cuentas(id),
    descripcion          TEXT,
    activo               BOOLEAN NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(empresa_id, tipo, proveedor_ruc)
);

-- ── Índices ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sri_comp_periodo  ON conta.lp_sri_comprobantes(empresa_id, año, mes, tipo);
CREATE INDEX IF NOT EXISTS idx_sri_comp_estado   ON conta.lp_sri_comprobantes(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_sri_comp_ruc      ON conta.lp_sri_comprobantes(empresa_id, proveedor_ruc);
CREATE INDEX IF NOT EXISTS idx_sri_mapeos_lookup ON conta.lp_sri_mapeos(empresa_id, tipo, proveedor_ruc);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE conta.lp_sri_importaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta.lp_sri_comprobantes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta.lp_sri_mapeos        ENABLE ROW LEVEL SECURITY;

CREATE POLICY sri_imp_all  ON conta.lp_sri_importaciones FOR ALL
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));
CREATE POLICY sri_comp_all ON conta.lp_sri_comprobantes  FOR ALL
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));
CREATE POLICY sri_map_all  ON conta.lp_sri_mapeos         FOR ALL
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));

-- ── Permisos para rol authenticated ───────────────────────────────────────
GRANT ALL ON conta.lp_sri_importaciones TO authenticated;
GRANT ALL ON conta.lp_sri_comprobantes  TO authenticated;
GRANT ALL ON conta.lp_sri_mapeos        TO authenticated;
