-- ============================================================
-- MÓDULO LOPDP — Fase 1: Registro de Actividades de Tratamiento (RAT)
--
-- Esquema NUEVO y aislado: lopdp
-- No modifica ninguna tabla, función ni trigger del schema core
-- "facturacion". Único contacto con el core:
--   - FKs de solo lectura hacia facturacion.empresas(id) y
--     facturacion.profiles(id)
--   - Llamada de solo lectura a la función ya existente
--     facturacion.mis_empresas_ids() (no se modifica)
--
-- Activación: cada empresa empieza deshabilitada (fila ausente en
-- lopdp.empresas_config = módulo apagado). Solo un admin de
-- plataforma (facturacion.es_admin_plataforma()) puede insertar o
-- actualizar esa fila para activar el módulo por empresa.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS lopdp;

-- ────────────────────────────────────────────────────────────
-- 1. Trigger genérico de updated_at para este schema
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION lopdp.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := timezone('utc', now());
    RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. Feature flag por empresa
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lopdp.empresas_config (
    empresa_id      UUID PRIMARY KEY REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    lopdp_enabled   BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

DROP TRIGGER IF EXISTS trg_lopdp_config_updated_at ON lopdp.empresas_config;
CREATE TRIGGER trg_lopdp_config_updated_at
    BEFORE UPDATE ON lopdp.empresas_config
    FOR EACH ROW EXECUTE FUNCTION lopdp.fn_set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 3. Enum de base legal (Art. 7 LOPDP)
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'base_legal_enum' AND n.nspname = 'lopdp'
    ) THEN
        CREATE TYPE lopdp.base_legal_enum AS ENUM (
            'consentimiento',
            'ejecucion_contrato',
            'obligacion_legal',
            'interes_vital',
            'interes_publico',
            'interes_legitimo'
        );
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. Registro de Actividades de Tratamiento (RAT)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lopdp.actividades_tratamiento (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id               UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,

    nombre                   TEXT NOT NULL,
    finalidad                TEXT NOT NULL,

    categorias_datos         TEXT[] NOT NULL DEFAULT '{}',
    categoria_titulares      TEXT[] NOT NULL DEFAULT '{}',

    base_legal               lopdp.base_legal_enum NOT NULL,
    base_legal_detalle       TEXT,

    plazo_retencion          TEXT NOT NULL,

    hay_transferencia_terceros   BOOLEAN NOT NULL DEFAULT false,
    terceros_detalle             TEXT,
    transferencia_internacional  BOOLEAN NOT NULL DEFAULT false,
    pais_transferencia           TEXT,

    medidas_seguridad        TEXT,

    activo                   BOOLEAN NOT NULL DEFAULT true,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_by               UUID REFERENCES facturacion.profiles(id),
    updated_by               UUID REFERENCES facturacion.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_lopdp_rat_empresa
    ON lopdp.actividades_tratamiento(empresa_id) WHERE activo = true;

DROP TRIGGER IF EXISTS trg_lopdp_rat_updated_at ON lopdp.actividades_tratamiento;
CREATE TRIGGER trg_lopdp_rat_updated_at
    BEFORE UPDATE ON lopdp.actividades_tratamiento
    FOR EACH ROW EXECUTE FUNCTION lopdp.fn_set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 5. Row Level Security
-- ────────────────────────────────────────────────────────────
ALTER TABLE lopdp.empresas_config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE lopdp.actividades_tratamiento   ENABLE ROW LEVEL SECURITY;

-- empresas_config: cualquier miembro de la empresa puede LEER el flag
-- (el frontend lo necesita para decidir si muestra el módulo).
DROP POLICY IF EXISTS "lopdp_config_select_empresa" ON lopdp.empresas_config;
CREATE POLICY "lopdp_config_select_empresa" ON lopdp.empresas_config
    FOR SELECT USING (
        empresa_id IN (SELECT facturacion.mis_empresas_ids())
    );

-- empresas_config: solo admin de PLATAFORMA puede activar/desactivar.
-- Ningún admin de empresa cliente puede autoactivarse el módulo.
DROP POLICY IF EXISTS "lopdp_config_admin_all" ON lopdp.empresas_config;
CREATE POLICY "lopdp_config_admin_all" ON lopdp.empresas_config
    FOR ALL USING (
        facturacion.es_admin_plataforma()
    )
    WITH CHECK (
        facturacion.es_admin_plataforma()
    );

-- actividades_tratamiento: pertenencia a la empresa Y módulo habilitado.
-- USING valida filas existentes (SELECT/UPDATE/DELETE), WITH CHECK valida
-- filas nuevas o resultantes (INSERT/UPDATE) — misma condición en ambas
-- para que un INSERT no pueda colar un empresa_id ajeno o con el módulo
-- deshabilitado.
DROP POLICY IF EXISTS "lopdp_rat_empresa" ON lopdp.actividades_tratamiento;
CREATE POLICY "lopdp_rat_empresa" ON lopdp.actividades_tratamiento
    FOR ALL USING (
        empresa_id IN (SELECT facturacion.mis_empresas_ids())
        AND empresa_id IN (
            SELECT empresa_id FROM lopdp.empresas_config WHERE lopdp_enabled = true
        )
    )
    WITH CHECK (
        empresa_id IN (SELECT facturacion.mis_empresas_ids())
        AND empresa_id IN (
            SELECT empresa_id FROM lopdp.empresas_config WHERE lopdp_enabled = true
        )
    );

-- ────────────────────────────────────────────────────────────
-- 6. Grants (esquema nuevo: PostgREST no lo expone por defecto)
-- ────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA lopdp TO authenticated, service_role;
GRANT ALL ON lopdp.empresas_config         TO authenticated, service_role;
GRANT ALL ON lopdp.actividades_tratamiento TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA lopdp
    GRANT ALL ON TABLES TO authenticated, service_role;

-- ============================================================
-- NOTA MANUAL (no ejecutable por SQL): en Supabase Dashboard →
-- Settings → API → "Exposed schemas", agregar "lopdp" a la lista
-- para que PostgREST lo sirva. Sin este paso, GRANT no es
-- suficiente y las tablas no serán alcanzables desde el frontend.
-- ============================================================
