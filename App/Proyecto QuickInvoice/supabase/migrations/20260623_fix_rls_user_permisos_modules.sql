-- Fix RLS: user_permisos (admin multiempresa) + user_modules (política abierta)
--
-- ═══ Problema 1 — user_permisos ═══
-- admin_gestiona_permisos valida: user_modules.is_admin = true
-- AND um.empresa_id = user_permisos.empresa_id.
-- Si el admin opera en una empresa asignada vía usuario_empresas (no legacy)
-- y no existe fila en user_modules para esa empresa, el acceso se bloquea.
--
-- Fix: un admin (is_admin=true en user_modules para cualquier empresa) puede
-- gestionar permisos en TODAS las empresas a las que tiene acceso
-- (profiles.empresa_id ∪ usuario_empresas activas).
-- Se elimina también la política duplicada usuario_lee_sus_permisos.
--
-- ═══ Problema 2 — user_modules ═══
-- user_modules_admin_all tiene qual = true: cualquier autenticado puede
-- leer/escribir TODAS las filas de user_modules, de cualquier empresa.
--
-- Fix: reemplazar por política que permite gestión solo a admins y solo
-- dentro de las empresas accesibles.

-- ═══════════════════════════════════════════════════════════════════════════
-- user_permisos
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "admin_gestiona_permisos"  ON facturacion.user_permisos;
DROP POLICY IF EXISTS "usuario_lee_sus_permisos" ON facturacion.user_permisos;

CREATE POLICY "admin_gestiona_permisos" ON facturacion.user_permisos
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM facturacion.user_modules um
            WHERE um.user_id = auth.uid() AND um.is_admin = true
        )
        AND empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
        )
    );

-- Políticas que se MANTIENEN sin cambio:
--   user_permisos_admin_all  (admin_plataforma — super admin)
--   user_permisos_read_own   (usuario lee sus propios permisos)

-- ═══════════════════════════════════════════════════════════════════════════
-- user_modules
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "user_modules_admin_all" ON facturacion.user_modules;

-- Nota: la subquery a user_modules (um2) dentro de una política sobre
-- user_modules NO aplica RLS recursivo — PostgreSQL lo excluye por diseño.
CREATE POLICY "user_modules_admin_empresa" ON facturacion.user_modules
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM facturacion.user_modules um2
            WHERE um2.user_id = auth.uid() AND um2.is_admin = true
        )
        AND empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
        )
    );

-- Políticas que se MANTIENEN sin cambio:
--   admin_plataforma_user_modules  (super admin)
--   user_modules_read_own          (usuario lee su propio registro)

-- ═══════════════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT schemaname, tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'facturacion'
--   AND tablename IN ('user_permisos', 'user_modules')
-- ORDER BY tablename, policyname;

-- ═══════════════════════════════════════════════════════════════════════════
-- Rollback (comentado)
-- ═══════════════════════════════════════════════════════════════════════════
-- -- user_permisos: restaurar política original
-- DROP POLICY IF EXISTS "admin_gestiona_permisos" ON facturacion.user_permisos;
-- CREATE POLICY "admin_gestiona_permisos" ON facturacion.user_permisos
--     FOR ALL USING (
--         EXISTS (
--             SELECT 1 FROM facturacion.user_modules um
--             WHERE um.user_id = auth.uid()
--               AND um.empresa_id = user_permisos.empresa_id
--               AND um.is_admin = true
--         )
--     );
-- CREATE POLICY "usuario_lee_sus_permisos" ON facturacion.user_permisos
--     FOR SELECT USING (auth.uid() = user_id);
--
-- -- user_modules: restaurar política abierta
-- DROP POLICY IF EXISTS "user_modules_admin_empresa" ON facturacion.user_modules;
-- CREATE POLICY "user_modules_admin_all" ON facturacion.user_modules
--     FOR ALL USING (true);
