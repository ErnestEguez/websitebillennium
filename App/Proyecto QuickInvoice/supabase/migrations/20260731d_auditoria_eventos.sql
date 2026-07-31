-- ============================================================
-- Sistema de auditoría/trazabilidad centralizado — Fase 0
--
-- Tabla única de eventos append-only, separada de la lógica de
-- negocio de cada módulo. Nadie inserta/actualiza/borra directo:
-- todo pasa por facturacion.fn_registrar_auditoria (SECURITY
-- DEFINER, nunca lanza excepción hacia el caller — si el logging
-- falla, la operación de negocio que lo llamó no debe romperse).
--
-- Esta migración NO integra ningún flujo de negocio todavía (eso
-- son fases posteriores) — solo crea la infraestructura base.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Tipos
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE facturacion.auditoria_nivel AS ENUM ('operativo', 'sensible', 'compliance');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE facturacion.auditoria_estado AS ENUM ('exitoso', 'fallido', 'intento');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. Tabla
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.auditoria_eventos (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correlation_id   UUID NOT NULL,
    empresa_id       UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,

    -- Quién / desde dónde
    user_id          UUID REFERENCES auth.users(id),
    user_nombre      TEXT,
    user_rol         TEXT,
    ip               INET,
    user_agent       TEXT,
    origen           TEXT NOT NULL DEFAULT 'web',

    -- Qué / sobre qué
    modulo           TEXT NOT NULL,
    accion           TEXT NOT NULL,
    entidad          TEXT NOT NULL,
    entidad_id       UUID,
    tipo_documento   TEXT,
    numero_documento TEXT,

    -- Contexto de negocio opcional (para filtros)
    sucursal_id      UUID,
    serie            TEXT,
    bodega_id        UUID,

    -- Resumen humano + detalle técnico
    resumen          TEXT NOT NULL,
    detalle          JSONB,
    cambios          JSONB,

    -- Resultado
    estado           facturacion.auditoria_estado NOT NULL DEFAULT 'exitoso',
    error_mensaje    TEXT,
    nivel            facturacion.auditoria_nivel NOT NULL DEFAULT 'operativo',

    created_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_auditoria_empresa_fecha ON facturacion.auditoria_eventos (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_empresa_modulo_fecha ON facturacion.auditoria_eventos (empresa_id, modulo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_empresa_usuario_fecha ON facturacion.auditoria_eventos (empresa_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_correlation ON facturacion.auditoria_eventos (correlation_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_resumen_fts ON facturacion.auditoria_eventos USING gin (to_tsvector('spanish', resumen));

-- ────────────────────────────────────────────────────────────
-- 3. RLS — lectura por nivel:
--    - operativo: cualquier miembro de la empresa (rol 'oficina' o superior)
--    - sensible/compliance: solo admin de esa empresa o admin_plataforma
--    Sin policies de INSERT/UPDATE/DELETE para "authenticated": la
--    única vía de escritura es fn_registrar_auditoria (SECURITY DEFINER).
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturacion.auditoria_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auditoria_select_operativo" ON facturacion.auditoria_eventos;
CREATE POLICY "auditoria_select_operativo" ON facturacion.auditoria_eventos
    FOR SELECT USING (
        nivel = 'operativo'
        AND empresa_id IN (SELECT facturacion.mis_empresas_ids())
    );

DROP POLICY IF EXISTS "auditoria_select_sensible" ON facturacion.auditoria_eventos;
CREATE POLICY "auditoria_select_sensible" ON facturacion.auditoria_eventos
    FOR SELECT USING (
        nivel IN ('sensible', 'compliance')
        AND empresa_id IN (SELECT facturacion.mis_empresas_ids())
        AND (facturacion.es_admin_empresa() OR facturacion.es_admin_plataforma())
    );

DROP POLICY IF EXISTS "auditoria_select_admin_plataforma" ON facturacion.auditoria_eventos;
CREATE POLICY "auditoria_select_admin_plataforma" ON facturacion.auditoria_eventos
    FOR SELECT USING (facturacion.es_admin_plataforma());

-- ────────────────────────────────────────────────────────────
-- 4. Función central de registro — no bloqueante por diseño:
--    cualquier error (incluida una empresa_id inválida) se traga
--    silenciosamente en vez de propagar la excepción al caller.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION facturacion.fn_registrar_auditoria(
    p_empresa_id       UUID,
    p_correlation_id   UUID,
    p_modulo           TEXT,
    p_accion           TEXT,
    p_entidad          TEXT,
    p_entidad_id       UUID DEFAULT NULL,
    p_tipo_documento   TEXT DEFAULT NULL,
    p_numero_documento TEXT DEFAULT NULL,
    p_sucursal_id      UUID DEFAULT NULL,
    p_serie            TEXT DEFAULT NULL,
    p_bodega_id        UUID DEFAULT NULL,
    p_resumen          TEXT DEFAULT NULL,
    p_detalle          JSONB DEFAULT NULL,
    p_cambios          JSONB DEFAULT NULL,
    p_estado           facturacion.auditoria_estado DEFAULT 'exitoso',
    p_error_mensaje    TEXT DEFAULT NULL,
    p_nivel            facturacion.auditoria_nivel DEFAULT 'operativo',
    p_user_agent       TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO facturacion
AS $$
BEGIN
    INSERT INTO facturacion.auditoria_eventos (
        empresa_id, correlation_id, user_id, user_nombre, user_rol, ip, user_agent,
        modulo, accion, entidad, entidad_id, tipo_documento, numero_documento,
        sucursal_id, serie, bodega_id, resumen, detalle, cambios,
        estado, error_mensaje, nivel
    )
    SELECT
        p_empresa_id, p_correlation_id, auth.uid(), p.nombre, p.rol,
        facturacion.fn_ip_cliente(), p_user_agent,
        p_modulo, p_accion, p_entidad, p_entidad_id, p_tipo_documento, p_numero_documento,
        p_sucursal_id, p_serie, p_bodega_id, COALESCE(p_resumen, p_accion || ' ' || p_entidad),
        p_detalle, p_cambios, p_estado, p_error_mensaje, p_nivel
    FROM facturacion.profiles p
    WHERE p.id = auth.uid();
EXCEPTION WHEN OTHERS THEN
    -- Best-effort: un fallo al auditar nunca debe romper la
    -- transacción de negocio que llamó a esta función.
    NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION facturacion.fn_registrar_auditoria(
    UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, UUID, TEXT, UUID,
    TEXT, JSONB, JSONB, facturacion.auditoria_estado, TEXT, facturacion.auditoria_nivel, TEXT
) TO authenticated;

-- ============================================================
-- Rollback (comentado)
-- ============================================================
-- DROP FUNCTION IF EXISTS facturacion.fn_registrar_auditoria(
--     UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, UUID, TEXT, UUID,
--     TEXT, JSONB, JSONB, facturacion.auditoria_estado, TEXT, facturacion.auditoria_nivel, TEXT
-- );
-- DROP TABLE IF EXISTS facturacion.auditoria_eventos;
-- DROP TYPE IF EXISTS facturacion.auditoria_estado;
-- DROP TYPE IF EXISTS facturacion.auditoria_nivel;
