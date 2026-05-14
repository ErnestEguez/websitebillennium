-- ============================================================
-- LEDGER PRO — Módulo de Administración
-- Funciones SECURITY DEFINER para leer datos cross-schema
-- Solo accesibles para admin@billenniumsystem.com
-- ============================================================

-- ── Helper: verificar si el usuario actual es admin ────────────────────────
CREATE OR REPLACE FUNCTION conta.lp_is_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM auth.users
        WHERE id    = auth.uid()
          AND email = 'admin@billenniumsystem.com'
    );
$$;

-- ── Listar todos los usuarios de auth (para panel admin) ───────────────────
CREATE OR REPLACE FUNCTION conta.lp_admin_get_usuarios()
RETURNS TABLE (
    id         UUID,
    email      TEXT,
    nombre     TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NOT conta.lp_is_admin() THEN
        RAISE EXCEPTION 'Acceso restringido a administradores';
    END IF;

    RETURN QUERY
    SELECT
        u.id,
        u.email::TEXT,
        COALESCE(p.nombre, u.email::TEXT) AS nombre,
        u.created_at
    FROM  auth.users u
    LEFT  JOIN public.profiles p ON p.id = u.id
    ORDER BY u.email;
END;
$$;

-- ── Listar empresas de QuickInvoice (public schema) ───────────────────────
CREATE OR REPLACE FUNCTION conta.lp_admin_get_qi_empresas()
RETURNS TABLE (
    id     UUID,
    ruc    TEXT,
    nombre TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NOT conta.lp_is_admin() THEN
        RAISE EXCEPTION 'Acceso restringido a administradores';
    END IF;

    RETURN QUERY
    SELECT e.id, e.ruc, e.nombre
    FROM   public.empresas e
    ORDER BY e.nombre;
END;
$$;

-- ── Permisos ───────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION conta.lp_is_admin            TO authenticated;
GRANT EXECUTE ON FUNCTION conta.lp_admin_get_usuarios  TO authenticated;
GRANT EXECUTE ON FUNCTION conta.lp_admin_get_qi_empresas TO authenticated;
