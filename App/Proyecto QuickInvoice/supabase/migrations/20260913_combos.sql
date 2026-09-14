-- ============================================================
-- Combos de productos — figura de venta general (todas las empresas,
-- no solo electrodomésticos). Un combo agrupa N productos reales a un
-- precio promocional distinto del precio de lista. El combo en sí
-- NUNCA se vende ni se guarda en Kardex — al facturarlo, se descompone
-- en sus componentes reales (eso sí impacta Kardex/contabilidad).
--
-- precio_total y combo_componentes.precio_unitario van SIEMPRE con IVA
-- incluido (así los captura el usuario) — el desglose base/IVA se hace
-- en el momento de facturar, por componente, según el iva_porcentaje
-- real de CADA producto (no se asume una sola tasa para todo el combo).
-- ============================================================

CREATE TABLE IF NOT EXISTS facturacion.combos (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id   UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    codigo       TEXT,
    descripcion  TEXT NOT NULL,
    precio_total NUMERIC(12,2) NOT NULL CHECK (precio_total > 0),
    activo       BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_by   UUID REFERENCES auth.users,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_combos_codigo
    ON facturacion.combos(empresa_id, codigo) WHERE codigo IS NOT NULL AND activo = true;
CREATE INDEX IF NOT EXISTS idx_combos_empresa ON facturacion.combos(empresa_id) WHERE activo = true;

GRANT ALL ON facturacion.combos TO authenticated, service_role;
ALTER TABLE facturacion.combos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "combos_empresa" ON facturacion.combos;
CREATE POLICY "combos_empresa" ON facturacion.combos
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

-- ────────────────────────────────────────────────────────────
-- Componentes — los productos reales que forman el combo, con la
-- cantidad y el precio (con IVA) que se le asignó DENTRO de este combo
-- (no necesariamente su precio de lista).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.combo_componentes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    combo_id        UUID NOT NULL REFERENCES facturacion.combos(id) ON DELETE CASCADE,
    producto_id     UUID NOT NULL REFERENCES facturacion.productos(id) ON DELETE RESTRICT,
    cantidad        NUMERIC(12,4) NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(12,4) NOT NULL CHECK (precio_unitario > 0),
    orden           INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_combo_componentes_combo ON facturacion.combo_componentes(combo_id, orden);

GRANT ALL ON facturacion.combo_componentes TO authenticated, service_role;
ALTER TABLE facturacion.combo_componentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "combo_componentes_empresa" ON facturacion.combo_componentes;
CREATE POLICY "combo_componentes_empresa" ON facturacion.combo_componentes
    FOR ALL USING (combo_id IN (
        SELECT id FROM facturacion.combos WHERE empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
        )
    ));

-- ────────────────────────────────────────────────────────────
-- Permiso — operativo, default true (mismo criterio que perm_productos).
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturacion.user_permisos
    ADD COLUMN IF NOT EXISTS perm_combos BOOLEAN NOT NULL DEFAULT true;

-- ── Verificación sugerida después de correr esta migración ──
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'facturacion' AND table_name IN ('combos','combo_componentes');
