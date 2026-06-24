-- ═══════════════════════════════════════════════════════════════════════════
-- Fix: profiles_select auto-referencia + dar_acceso_portal sin multiempresa
--
-- Problema 1: profiles_select con subconsultas directas a profiles genera
-- auto-referencia RLS que rompe el login (PostgREST 500 o 0 filas).
-- Solución: funciones SECURITY DEFINER que consultan sin pasar por RLS.
--
-- Problema 2: dar_acceso_portal solo escribe en auth.users + profiles.
-- No toca usuario_empresas ni user_modules → usuarios quedan sin
-- multiempresa ni módulos asignados.
-- Solución: agregar UPSERT en usuario_empresas + user_modules.
--
-- NOTA: dar_acceso_portal es usado por QuickInvoice, ConfigurationPage
-- y RestoFlow. Los cambios son ADITIVOS (agregan filas en usuario_empresas
-- y user_modules) — no rompen el flujo existente de ninguna app.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- PASO 1: Funciones helper SECURITY DEFINER
-- Consultan profiles/usuario_empresas SIN pasar por RLS.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION facturacion.es_admin_plataforma()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO facturacion
AS $$
    SELECT EXISTS (
        SELECT 1 FROM facturacion.profiles
        WHERE id = auth.uid() AND rol = 'admin_plataforma'
    );
$$;

CREATE OR REPLACE FUNCTION facturacion.mis_empresas_ids()
RETURNS SETOF UUID
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO facturacion
AS $$
    SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
    UNION
    SELECT empresa_id FROM facturacion.usuario_empresas
    WHERE user_id = auth.uid() AND activo = true;
$$;

CREATE OR REPLACE FUNCTION facturacion.ids_colegas()
RETURNS SETOF UUID
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO facturacion
AS $$
    SELECT DISTINCT ue.user_id
    FROM facturacion.usuario_empresas ue
    WHERE ue.activo = true
      AND ue.empresa_id IN (
          SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
          UNION
          SELECT empresa_id FROM facturacion.usuario_empresas
          WHERE user_id = auth.uid() AND activo = true
      );
$$;

-- es_admin_empresa ya existe (creada hoy), se asegura con CREATE OR REPLACE
CREATE OR REPLACE FUNCTION facturacion.es_admin_empresa()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO facturacion
AS $$
    SELECT EXISTS (
        SELECT 1 FROM facturacion.user_modules
        WHERE user_id = auth.uid() AND is_admin = true
    );
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- PASO 2: Reescribir políticas de profiles (sin auto-referencia)
--
-- SELECT: propia fila ∪ admin_plataforma ∪ misma empresa ∪ colegas
-- UPDATE: propia fila ∪ admin_plataforma
-- INSERT/DELETE: solo admin_plataforma (dar_acceso_portal usa SEC DEF)
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_select" ON facturacion.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON facturacion.profiles;
DROP POLICY IF EXISTS "profiles_update" ON facturacion.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON facturacion.profiles;

CREATE POLICY "profiles_select" ON facturacion.profiles
    FOR SELECT USING (
        id = auth.uid()
        OR facturacion.es_admin_plataforma()
        OR empresa_id IN (SELECT facturacion.mis_empresas_ids())
        OR id IN (SELECT facturacion.ids_colegas())
    );

CREATE POLICY "profiles_insert" ON facturacion.profiles
    FOR INSERT WITH CHECK (facturacion.es_admin_plataforma());

CREATE POLICY "profiles_update" ON facturacion.profiles
    FOR UPDATE USING (
        id = auth.uid() OR facturacion.es_admin_plataforma()
    );

CREATE POLICY "profiles_delete" ON facturacion.profiles
    FOR DELETE USING (facturacion.es_admin_plataforma());

-- ─────────────────────────────────────────────────────────────────────────
-- PASO 3: Recrear políticas admin de empresa en user_modules/user_permisos
-- (usan es_admin_empresa() + mis_empresas_ids(), sin auto-referencia)
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_gestiona_permisos"  ON facturacion.user_permisos;
CREATE POLICY "admin_gestiona_permisos" ON facturacion.user_permisos
    FOR ALL USING (
        facturacion.es_admin_empresa()
        AND empresa_id IN (SELECT facturacion.mis_empresas_ids())
    );

DROP POLICY IF EXISTS "user_modules_admin_empresa" ON facturacion.user_modules;
CREATE POLICY "user_modules_admin_empresa" ON facturacion.user_modules
    FOR ALL USING (
        facturacion.es_admin_empresa()
        AND empresa_id IN (SELECT facturacion.mis_empresas_ids())
    );

-- ─────────────────────────────────────────────────────────────────────────
-- PASO 4: dar_acceso_portal — agregar escritura en usuario_empresas +
-- user_modules para que nuevos usuarios queden con multiempresa desde
-- el primer día.
--
-- Cambios vs versión anterior:
--   + UPSERT en usuario_empresas (empresa asignada)
--   + Si el usuario tenía empresa legacy distinta, también la agrega
--   + INSERT en user_modules con módulos activos por default
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION facturacion.dar_acceso_portal(
    p_email TEXT, p_empresa_id UUID, p_nombre TEXT, p_rol TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO facturacion
AS $$
DECLARE
    v_user_id UUID;
    v_empresa_legacy UUID;
BEGIN
    -- 1. Buscar o crear usuario en auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;

    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email,
            encrypted_password, email_confirmed_at,
            created_at, updated_at,
            raw_app_meta_data, raw_user_meta_data,
            is_super_admin, confirmation_token,
            recovery_token, email_change_token_new, email_change
        ) VALUES (
            '00000000-0000-0000-0000-000000000000'::uuid,
            v_user_id, 'authenticated', 'authenticated', p_email,
            '', now(), now(), now(),
            '{"provider":"email","providers":["email"]}',
            json_build_object('name', p_nombre)::jsonb,
            false, '', '', '', ''
        );
    END IF;

    -- 2. Guardar empresa legacy ANTES de tocar profiles
    SELECT empresa_id INTO v_empresa_legacy
    FROM facturacion.profiles WHERE id = v_user_id;

    -- 3. Crear o actualizar perfil (empresa_id solo en INSERT)
    INSERT INTO facturacion.profiles (id, empresa_id, nombre, email, rol)
    VALUES (v_user_id, p_empresa_id, p_nombre, p_email, p_rol)
    ON CONFLICT (id) DO UPDATE
        SET nombre = p_nombre,
            rol    = p_rol;

    -- 4. Registrar en usuario_empresas (nueva empresa asignada)
    INSERT INTO facturacion.usuario_empresas (user_id, empresa_id, rol, activo)
    VALUES (v_user_id, p_empresa_id, p_rol, true)
    ON CONFLICT (user_id, empresa_id)
        DO UPDATE SET rol = p_rol, activo = true;

    -- 5. Si tenía empresa legacy distinta, preservarla en usuario_empresas
    IF v_empresa_legacy IS NOT NULL AND v_empresa_legacy != p_empresa_id THEN
        INSERT INTO facturacion.usuario_empresas (user_id, empresa_id, rol, activo)
        VALUES (v_user_id, v_empresa_legacy, COALESCE(p_rol, 'oficina'), true)
        ON CONFLICT (user_id, empresa_id) DO NOTHING;
    END IF;

    -- 6. Asegurar entrada en user_modules (módulos activos por default)
    INSERT INTO facturacion.user_modules (user_id, empresa_id, vendor, finance, ledgerpro, is_admin)
    VALUES (v_user_id, p_empresa_id, true, true, true, false)
    ON CONFLICT (user_id, empresa_id) DO NOTHING;

    RETURN jsonb_build_object('ok', true, 'user_id', v_user_id);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT policyname, cmd, qual FROM pg_policies
-- WHERE schemaname = 'facturacion' AND tablename = 'profiles';

-- ═══════════════════════════════════════════════════════════════════════════
-- Rollback (comentado)
-- ═══════════════════════════════════════════════════════════════════════════
-- DROP POLICY IF EXISTS "profiles_select" ON facturacion.profiles;
-- DROP POLICY IF EXISTS "profiles_insert" ON facturacion.profiles;
-- DROP POLICY IF EXISTS "profiles_update" ON facturacion.profiles;
-- DROP POLICY IF EXISTS "profiles_delete" ON facturacion.profiles;
-- CREATE POLICY "profiles_select" ON facturacion.profiles FOR SELECT USING (true);
-- CREATE POLICY "profiles_insert" ON facturacion.profiles FOR INSERT WITH CHECK (true);
-- CREATE POLICY "profiles_update" ON facturacion.profiles FOR UPDATE USING (true);
-- CREATE POLICY "profiles_delete" ON facturacion.profiles FOR DELETE USING (true);
--
-- DROP POLICY IF EXISTS "admin_gestiona_permisos" ON facturacion.user_permisos;
-- DROP POLICY IF EXISTS "user_modules_admin_empresa" ON facturacion.user_modules;
--
-- DROP FUNCTION IF EXISTS facturacion.es_admin_plataforma();
-- DROP FUNCTION IF EXISTS facturacion.mis_empresas_ids();
-- DROP FUNCTION IF EXISTS facturacion.ids_colegas();
--
-- -- Restaurar dar_acceso_portal sin multiempresa:
-- CREATE OR REPLACE FUNCTION facturacion.dar_acceso_portal(p_email TEXT, p_empresa_id UUID, p_nombre TEXT, p_rol TEXT)
-- RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO facturacion AS $$
-- DECLARE v_user_id UUID;
-- BEGIN
--     SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
--     IF v_user_id IS NULL THEN
--         v_user_id := gen_random_uuid();
--         INSERT INTO auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin,confirmation_token,recovery_token,email_change_token_new,email_change)
--         VALUES ('00000000-0000-0000-0000-000000000000'::uuid,v_user_id,'authenticated','authenticated',p_email,'',now(),now(),now(),'{"provider":"email","providers":["email"]}',json_build_object('name',p_nombre)::jsonb,false,'','','','');
--     END IF;
--     INSERT INTO facturacion.profiles (id,empresa_id,nombre,email,rol) VALUES (v_user_id,p_empresa_id,p_nombre,p_email,p_rol)
--     ON CONFLICT (id) DO UPDATE SET nombre=p_nombre, rol=p_rol;
--     RETURN jsonb_build_object('ok',true,'user_id',v_user_id);
-- EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error',SQLERRM);
-- END; $$;
