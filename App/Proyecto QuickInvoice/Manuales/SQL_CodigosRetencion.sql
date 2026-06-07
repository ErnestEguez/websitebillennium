-- ============================================================
-- TABLA: facturacion.codigos_retencion
-- Catálogo maestro de códigos de retención del SRI Ecuador
-- Actualizado: 2025 — Resoluciones NAC-DGERCGC14-00787 y ss.
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS facturacion.codigos_retencion (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id             UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    codigo                 TEXT NOT NULL,
    descripcion            TEXT NOT NULL,
    tipo                   TEXT NOT NULL CHECK (tipo IN ('FUENTE', 'IVA')),
    porcentaje             DECIMAL(6,2) NOT NULL DEFAULT 0,
    aplica_a               TEXT DEFAULT 'TODOS',   -- TODOS | PERSONA_NATURAL | PERSONA_JURIDICA | ARTESANO
    base_legal             TEXT,
    activo                 BOOLEAN NOT NULL DEFAULT TRUE,
    cuenta_contable_id     TEXT,
    cuenta_contable_codigo TEXT,
    cuenta_contable_nombre TEXT,
    created_at             TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at             TIMESTAMPTZ DEFAULT timezone('utc', now()),
    UNIQUE (empresa_id, codigo, tipo)
);

CREATE INDEX IF NOT EXISTS idx_codigos_retencion_empresa
    ON facturacion.codigos_retencion (empresa_id, tipo, activo);

ALTER TABLE facturacion.codigos_retencion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "codigos_retencion_all" ON facturacion.codigos_retencion
    FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION facturacion.set_updated_at_codigos_retencion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = timezone('utc', now()); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_codigos_retencion_updated_at ON facturacion.codigos_retencion;
CREATE TRIGGER trg_codigos_retencion_updated_at
    BEFORE UPDATE ON facturacion.codigos_retencion
    FOR EACH ROW EXECUTE FUNCTION facturacion.set_updated_at_codigos_retencion();

NOTIFY pgrst, 'reload schema';
