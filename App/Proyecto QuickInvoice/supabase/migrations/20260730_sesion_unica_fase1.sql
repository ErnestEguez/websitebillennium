-- ============================================================
-- SESIÓN ÚNICA POR USUARIO — Fase 1: tablas, RLS y funciones RPC
--
-- Objetivo de negocio: si un cliente paga por 1 usuario, solo 1
-- persona puede estar conectada con esas credenciales a la vez.
-- Al hacer login exitoso se invalida cualquier sesión anterior del
-- mismo user_id; la sesión desplazada lo detecta en la siguiente
-- verificación periódica (cada ~30 min desde el frontend), NO de
-- forma instantánea por request.
--
-- IMPORTANTE — alcance GLOBAL por usuario, no por empresa: la
-- unicidad es por user_id únicamente (PK de sesiones_activas). Un
-- usuario puede cambiar de empresa (multiempresa) sin volver a
-- loguearse, así que si la unicidad dependiera de empresa_id el
-- mismo usuario podría tener una fila "válida" por cada empresa —
-- justo lo que este mecanismo debe impedir. empresa_id se guarda en
-- ambas tablas solo como METADATA de auditoría (la empresa activa al
-- momento del login/último cierre), nunca como parte de la clave de
-- unicidad ni como criterio de validación.
--
-- Vive enteramente en el schema "facturacion" (no un schema nuevo:
-- es un mecanismo de auth/seguridad transversal, no un módulo de
-- negocio opcional como LOPDP). Único contacto con tablas core:
--   - FKs de solo lectura hacia auth.users(id) (NO se modifica
--     auth.users ni auth.sessions)
--   - FK de solo lectura hacia facturacion.empresas(id)
--   - Reutiliza facturacion.es_admin_plataforma() ya existente
--     (no se toca)
--
-- Activación: cada empresa empieza deshabilitada (fila ausente en
-- facturacion.sesion_unica_config = mecanismo apagado para esa
-- empresa). Solo admin_plataforma puede activarlo, empresa por
-- empresa (mismo patrón que lopdp.empresas_config). El flag sigue
-- siendo por empresa (control de rollout gradual), pero una vez que
-- se activa el mecanismo para un usuario (la primera vez que su
-- AuthContext resuelve una empresa con el flag encendido), la
-- protección aplica globalmente para ese usuario el resto de la
-- sesión de navegador, sin importar si luego cambia a una empresa
-- sin el flag.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Feature flag por empresa
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.sesion_unica_config (
    empresa_id   UUID PRIMARY KEY REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    enabled      BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_by   UUID REFERENCES facturacion.profiles(id)
);

CREATE OR REPLACE FUNCTION facturacion.fn_set_updated_at_sesion_unica()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := timezone('utc', now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sesion_unica_config_updated_at ON facturacion.sesion_unica_config;
CREATE TRIGGER trg_sesion_unica_config_updated_at
    BEFORE UPDATE ON facturacion.sesion_unica_config
    FOR EACH ROW EXECUTE FUNCTION facturacion.fn_set_updated_at_sesion_unica();

-- ────────────────────────────────────────────────────────────
-- 2. Enum del motivo de cierre
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'motivo_cierre_sesion' AND n.nspname = 'facturacion'
    ) THEN
        CREATE TYPE facturacion.motivo_cierre_sesion AS ENUM (
            'logout_manual',
            'desplazada_por_nuevo_login',
            'expirada',
            'admin'
        );
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. Sesión activa: UNA fila por usuario en TODO el sistema
--    (PK = user_id, NO compuesta con empresa_id — ver nota de
--    alcance global arriba).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.sesiones_activas (
    user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL,          -- SHA-256 hex del session_id generado en el navegador
    dispositivo  TEXT,                    -- user agent resumido
    ip           INET,                    -- best-effort desde headers, NULL aceptado
    empresa_id   UUID REFERENCES facturacion.empresas(id) ON DELETE SET NULL,  -- METADATA: empresa activa al último registro/check
    created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    last_seen    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_sesiones_activas_empresa ON facturacion.sesiones_activas(empresa_id);

-- ────────────────────────────────────────────────────────────
-- 4. Historial de sesiones: append-only, nunca editable
--    (ni siquiera por el propio dueño — ver sección de Grants)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.historial_sesiones (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    empresa_id   UUID REFERENCES facturacion.empresas(id) ON DELETE SET NULL,  -- METADATA
    ip           INET,
    dispositivo  TEXT,
    created_at   TIMESTAMPTZ NOT NULL,   -- cuándo había iniciado esa sesión (copiado de sesiones_activas.created_at)
    cerrada_en   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    cerrada_por  facturacion.motivo_cierre_sesion NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_historial_sesiones_empresa_fecha
    ON facturacion.historial_sesiones(empresa_id, cerrada_en DESC);
CREATE INDEX IF NOT EXISTS idx_historial_sesiones_user_fecha
    ON facturacion.historial_sesiones(user_id, cerrada_en DESC);

-- ────────────────────────────────────────────────────────────
-- 5. Row Level Security
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturacion.sesion_unica_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.sesiones_activas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.historial_sesiones  ENABLE ROW LEVEL SECURITY;

-- sesion_unica_config: cualquier miembro de la empresa puede LEER el
-- flag (el frontend lo necesita para decidir si activa el mecanismo).
DROP POLICY IF EXISTS "sesion_unica_config_select_empresa" ON facturacion.sesion_unica_config;
CREATE POLICY "sesion_unica_config_select_empresa" ON facturacion.sesion_unica_config
    FOR SELECT USING (
        empresa_id IN (SELECT facturacion.mis_empresas_ids())
    );

-- sesion_unica_config: solo admin de PLATAFORMA puede activar/desactivar.
-- Ningún admin de empresa cliente puede autoactivarse el mecanismo.
DROP POLICY IF EXISTS "sesion_unica_config_admin_all" ON facturacion.sesion_unica_config;
CREATE POLICY "sesion_unica_config_admin_all" ON facturacion.sesion_unica_config
    FOR ALL USING (
        facturacion.es_admin_plataforma()
    )
    WITH CHECK (
        facturacion.es_admin_plataforma()
    );

-- sesiones_activas: cada usuario ve/escribe solo su propia fila.
-- En la práctica el frontend nunca escribe esta tabla directamente
-- (siempre pasa por las funciones RPC de la sección 6, por atomicidad),
-- pero esta política queda como cinturón de seguridad adicional.
DROP POLICY IF EXISTS "sesiones_activas_propia_fila" ON facturacion.sesiones_activas;
CREATE POLICY "sesiones_activas_propia_fila" ON facturacion.sesiones_activas
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- sesiones_activas: lectura de soporte para admin_plataforma
-- (ej. diagnosticar un reclamo de un cliente puntual).
DROP POLICY IF EXISTS "sesiones_activas_admin_readonly" ON facturacion.sesiones_activas;
CREATE POLICY "sesiones_activas_admin_readonly" ON facturacion.sesiones_activas
    FOR SELECT USING (facturacion.es_admin_plataforma());

-- historial_sesiones: SOLO lectura para admin_plataforma. Deliberadamente
-- NO hay política de INSERT/UPDATE/DELETE para "authenticated" — la
-- única vía de escritura son las funciones SECURITY DEFINER de la
-- sección 6, que corren con los privilegios de su dueño (postgres) sin
-- importar los grants de quien las invoca. Esto es lo que hace la tabla
-- "nunca editable ni por el dueño" en un sentido real, no solo de UI.
DROP POLICY IF EXISTS "historial_sesiones_admin_readonly" ON facturacion.historial_sesiones;
CREATE POLICY "historial_sesiones_admin_readonly" ON facturacion.historial_sesiones
    FOR SELECT USING (facturacion.es_admin_plataforma());

-- ────────────────────────────────────────────────────────────
-- 6. Grants
--    OJO: a diferencia de otras tablas del proyecto, aquí NO se
--    da INSERT/UPDATE/DELETE a "authenticated" sobre historial_sesiones
--    (sería contradictorio con "nunca editable"). Solo SELECT, y ese
--    SELECT ya está limitado por la policy de arriba a admin_plataforma.
-- ────────────────────────────────────────────────────────────
GRANT SELECT ON facturacion.historial_sesiones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON facturacion.sesiones_activas TO authenticated;
GRANT SELECT ON facturacion.sesion_unica_config TO authenticated;
GRANT ALL ON facturacion.historial_sesiones, facturacion.sesiones_activas, facturacion.sesion_unica_config TO service_role;

-- ────────────────────────────────────────────────────────────
-- 7. Captura de IP best-effort desde los headers de la petición
--    HTTP original (lo que PostgREST expone vía current_setting).
--    Si el header no está disponible o no es una IP válida, retorna
--    NULL sin romper el flujo — es un dato de auditoría, no crítico
--    para la seguridad del mecanismo.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION facturacion.fn_ip_cliente()
RETURNS INET
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    v_headers JSONB;
    v_ip TEXT;
BEGIN
    BEGIN
        v_headers := current_setting('request.headers', true)::jsonb;
        v_ip := split_part(COALESCE(v_headers->>'x-forwarded-for', ''), ',', 1);
        v_ip := trim(v_ip);
        IF v_ip = '' THEN RETURN NULL; END IF;
        RETURN v_ip::inet;
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 8. registrar_sesion — se llama al login (o al resolver, dentro de
--    la misma sesión de navegador, una empresa con el flag activo
--    por primera vez). Busca/escribe por user_id ÚNICAMENTE — la
--    unicidad es global, empresa_id es solo metadata de auditoría.
--    p_empresa_id se usa para: (a) chequear el flag de ESA empresa
--    antes de continuar, (b) guardarse como metadata en la fila.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION facturacion.registrar_sesion(
    p_token_hash  TEXT,
    p_dispositivo TEXT DEFAULT NULL,
    p_empresa_id  UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO facturacion
AS $$
DECLARE
    v_user_id  UUID := auth.uid();
    v_prev     facturacion.sesiones_activas%ROWTYPE;
    v_ip       INET;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'no_autenticado');
    END IF;

    -- Feature flag: si la empresa activa no tiene el mecanismo
    -- activado, no-op. Defensa en profundidad además del chequeo que
    -- ya hace el frontend antes de llamar esta función.
    IF p_empresa_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM facturacion.sesion_unica_config
        WHERE empresa_id = p_empresa_id AND enabled = true
    ) THEN
        RETURN jsonb_build_object('ok', true, 'skip', true);
    END IF;

    v_ip := facturacion.fn_ip_cliente();

    -- Bloquea la fila (si existe) para evitar carrera entre 2 logins casi simultáneos
    SELECT * INTO v_prev
    FROM facturacion.sesiones_activas
    WHERE user_id = v_user_id
    FOR UPDATE;

    -- Si había una sesión previa de OTRO dispositivo (hash distinto),
    -- se archiva como desplazada ANTES de sobrescribirla — con la
    -- empresa que esa fila anterior tenía guardada, no la nueva.
    IF FOUND AND v_prev.token_hash IS DISTINCT FROM p_token_hash THEN
        INSERT INTO facturacion.historial_sesiones
            (user_id, empresa_id, ip, dispositivo, created_at, cerrada_en, cerrada_por)
        VALUES
            (v_user_id, v_prev.empresa_id, v_prev.ip, v_prev.dispositivo, v_prev.created_at,
             timezone('utc', now()), 'desplazada_por_nuevo_login');
    END IF;

    INSERT INTO facturacion.sesiones_activas
        (user_id, token_hash, dispositivo, ip, empresa_id, created_at, last_seen)
    VALUES
        (v_user_id, p_token_hash, p_dispositivo, v_ip, p_empresa_id, timezone('utc', now()), timezone('utc', now()))
    ON CONFLICT (user_id) DO UPDATE SET
        token_hash  = EXCLUDED.token_hash,
        dispositivo = EXCLUDED.dispositivo,
        ip          = EXCLUDED.ip,
        empresa_id  = EXCLUDED.empresa_id,
        created_at  = timezone('utc', now()),
        last_seen   = timezone('utc', now());

    RETURN jsonb_build_object('ok', true, 'desplazo_sesion_previa', FOUND);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 9. verificar_sesion — llamada cada ~30 min desde el frontend.
--    Ya NO recibe empresa_id: busca por user_id únicamente (la
--    unicidad y validación son globales). Si no hay fila, fail-open
--    (true) — la ausencia de fila ya implica que el mecanismo nunca
--    se activó para este usuario, sin necesitar re-chequear el flag.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION facturacion.verificar_sesion(
    p_token_hash TEXT
)
RETURNS BOOLEAN  -- true = sigue vigente, false = fue desplazada
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO facturacion
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_stored  TEXT;
BEGIN
    IF v_user_id IS NULL THEN RETURN true; END IF;

    SELECT token_hash INTO v_stored
    FROM facturacion.sesiones_activas
    WHERE user_id = v_user_id;

    IF v_stored IS NULL THEN RETURN true; END IF; -- fail-open

    IF v_stored = p_token_hash THEN
        UPDATE facturacion.sesiones_activas
        SET last_seen = timezone('utc', now())
        WHERE user_id = v_user_id;
        RETURN true;
    END IF;

    RETURN false;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 10. cerrar_sesion — llamada por el logout manual del usuario,
--     ANTES de supabase.auth.signOut(). Ya NO recibe empresa_id
--     (busca/borra por user_id). NO se llama nunca desde el flujo de
--     "sesión desplazada" en el frontend: hacerlo ahí borraría la
--     sesión NUEVA y legítima del otro dispositivo, no la propia.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION facturacion.cerrar_sesion(
    p_motivo facturacion.motivo_cierre_sesion DEFAULT 'logout_manual'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO facturacion
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_row     facturacion.sesiones_activas%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'no_autenticado');
    END IF;

    SELECT * INTO v_row
    FROM facturacion.sesiones_activas
    WHERE user_id = v_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', true, 'skip', true);
    END IF;

    INSERT INTO facturacion.historial_sesiones
        (user_id, empresa_id, ip, dispositivo, created_at, cerrada_en, cerrada_por)
    VALUES
        (v_user_id, v_row.empresa_id, v_row.ip, v_row.dispositivo, v_row.created_at,
         timezone('utc', now()), p_motivo);

    DELETE FROM facturacion.sesiones_activas
    WHERE user_id = v_user_id;

    RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION facturacion.registrar_sesion(TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION facturacion.verificar_sesion(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION facturacion.cerrar_sesion(facturacion.motivo_cierre_sesion) TO authenticated;

-- ============================================================
-- Verificación
-- ============================================================
-- SELECT policyname, cmd, qual FROM pg_policies
-- WHERE schemaname = 'facturacion'
--   AND tablename IN ('sesiones_activas', 'historial_sesiones', 'sesion_unica_config');
--
-- Activar el flag para una empresa piloto/demo (reemplazar el UUID):
-- INSERT INTO facturacion.sesion_unica_config (empresa_id, enabled)
-- VALUES ('<EMPRESA_DEMO_ID>', true)
-- ON CONFLICT (empresa_id) DO UPDATE SET enabled = true, updated_at = timezone('utc', now());

-- ============================================================
-- Rollback (comentado)
-- ============================================================
-- DROP FUNCTION IF EXISTS facturacion.registrar_sesion(TEXT, TEXT, UUID);
-- DROP FUNCTION IF EXISTS facturacion.verificar_sesion(TEXT);
-- DROP FUNCTION IF EXISTS facturacion.cerrar_sesion(facturacion.motivo_cierre_sesion);
-- DROP FUNCTION IF EXISTS facturacion.fn_ip_cliente();
-- DROP TABLE IF EXISTS facturacion.historial_sesiones;
-- DROP TABLE IF EXISTS facturacion.sesiones_activas;
-- DROP TABLE IF EXISTS facturacion.sesion_unica_config;
-- DROP TYPE IF EXISTS facturacion.motivo_cierre_sesion;
-- DROP FUNCTION IF EXISTS facturacion.fn_set_updated_at_sesion_unica();
