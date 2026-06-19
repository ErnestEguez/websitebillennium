-- Fix: dar_acceso_portal sobreescribe profiles.empresa_id en CADA llamada,
-- incluso para usuarios ya existentes. Esto deja profiles.empresa_id apuntando
-- a la ULTIMA empresa para la que se usó "Dar Acceso via Portal", sin importar
-- cuántas empresas tenga el usuario en usuario_empresas/user_modules.
--
-- Caso real: Janela tiene 3 empresas en usuario_empresas/user_modules
-- (Fundación, Piff, Prentisa), pero profiles.empresa_id quedó en Piff
-- (la última registrada el 2026-06-12).
--
-- Fix: empresa_id solo se fija al INSERTAR el perfil por primera vez
-- (usuario nuevo). En usuarios existentes, "Dar Acceso via Portal" ya NO
-- modifica empresa_id (la asignación multiempresa real vive en
-- usuario_empresas / user_modules).

CREATE OR REPLACE FUNCTION facturacion.dar_acceso_portal(p_email text, p_empresa_id uuid, p_nombre text, p_rol text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'facturacion'
AS $function$
DECLARE
    v_user_id UUID;
BEGIN
    -- Buscar usuario en auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;

    -- Si no existe, crearlo directamente (para SSO via magic link)
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

    -- Crear o actualizar perfil. empresa_id solo se fija al crear el perfil;
    -- en usuarios existentes no se sobreescribe (multiempresa via usuario_empresas).
    INSERT INTO facturacion.profiles (id, empresa_id, nombre, email, rol)
    VALUES (v_user_id, p_empresa_id, p_nombre, p_email, p_rol)
    ON CONFLICT (id) DO UPDATE
        SET nombre = p_nombre,
            rol    = p_rol;

    RETURN jsonb_build_object('ok', true, 'user_id', v_user_id);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$
