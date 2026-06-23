-- ═══════════════════════════════════════════════════════════════════════════
-- Barrido general RLS: cerrar políticas abiertas (qual=true) en 21 tablas
-- de facturacion + 1 tabla de finance.
--
-- Todas estas tablas tenían "authenticated_full_access" FOR ALL USING (true),
-- permitiendo que cualquier usuario autenticado lea/escriba CUALQUIER fila
-- de CUALQUIER empresa sin restricción.
--
-- Patrón estándar aplicado (empresa_id):
--   empresa_id IN (
--       SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
--       UNION
--       SELECT empresa_id FROM facturacion.usuario_empresas
--       WHERE user_id = auth.uid() AND activo = true
--   )
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- GRUPO A: tablas con empresa_id directo (13 tablas, patrón estándar)
-- ─────────────────────────────────────────────────────────────────────────

DO $do$
DECLARE
    _tbl TEXT;
    _using TEXT := $u$empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas
            WHERE user_id = auth.uid() AND activo = true
        )$u$;
BEGIN
    FOREACH _tbl IN ARRAY ARRAY[
        'bodegas','cartera_cxc','cartera_cxc_pagos','categorias','clientes',
        'codigos_retencion','comprobantes','kardex','notas_credito',
        'productos','proveedores','stock_bodega','vendedores'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "authenticated_full_access" ON facturacion.%I', _tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON facturacion.%I', _tbl || '_all', _tbl);
        EXECUTE format('CREATE POLICY %I ON facturacion.%I FOR SELECT USING (%s)',
            _tbl || '_select', _tbl, _using);
        EXECUTE format('CREATE POLICY %I ON facturacion.%I FOR INSERT WITH CHECK (%s)',
            _tbl || '_insert', _tbl, _using);
        EXECUTE format('CREATE POLICY %I ON facturacion.%I FOR UPDATE USING (%s) WITH CHECK (%s)',
            _tbl || '_update', _tbl, _using, _using);
        EXECUTE format('CREATE POLICY %I ON facturacion.%I FOR DELETE USING (%s)',
            _tbl || '_delete', _tbl, _using);
    END LOOP;
END $do$;

-- ─────────────────────────────────────────────────────────────────────────
-- GRUPO A — profiles (caso especial: tabla estructural del sistema)
--
-- Reglas:
--   SELECT: propia fila ∪ admin_plataforma ∪ usuarios que comparten empresa
--   UPDATE: propia fila ∪ admin_plataforma
--   INSERT/DELETE: solo admin_plataforma (dar_acceso_portal usa SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "authenticated_full_access" ON facturacion.profiles;

CREATE POLICY "profiles_select" ON facturacion.profiles
    FOR SELECT USING (
        id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM facturacion.profiles p
            WHERE p.id = auth.uid() AND p.rol = 'admin_plataforma'
        )
        OR empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas
            WHERE user_id = auth.uid() AND activo = true
        )
        OR id IN (
            SELECT user_id FROM facturacion.usuario_empresas
            WHERE activo = true AND empresa_id IN (
                SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
                UNION
                SELECT empresa_id FROM facturacion.usuario_empresas
                WHERE user_id = auth.uid() AND activo = true
            )
        )
    );

CREATE POLICY "profiles_insert" ON facturacion.profiles
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM facturacion.profiles p
            WHERE p.id = auth.uid() AND p.rol = 'admin_plataforma'
        )
    );

CREATE POLICY "profiles_update" ON facturacion.profiles
    FOR UPDATE USING (
        id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM facturacion.profiles p
            WHERE p.id = auth.uid() AND p.rol = 'admin_plataforma'
        )
    );

CREATE POLICY "profiles_delete" ON facturacion.profiles
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM facturacion.profiles p
            WHERE p.id = auth.uid() AND p.rol = 'admin_plataforma'
        )
    );

-- ─────────────────────────────────────────────────────────────────────────
-- GRUPO A — preciovolumen (usa id_empresa en vez de empresa_id)
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "authenticated_full_access" ON facturacion.preciovolumen;

CREATE POLICY "preciovolumen_select" ON facturacion.preciovolumen
    FOR SELECT USING (
        id_empresa IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas
            WHERE user_id = auth.uid() AND activo = true
        )
    );

CREATE POLICY "preciovolumen_insert" ON facturacion.preciovolumen
    FOR INSERT WITH CHECK (
        id_empresa IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas
            WHERE user_id = auth.uid() AND activo = true
        )
    );

CREATE POLICY "preciovolumen_update" ON facturacion.preciovolumen
    FOR UPDATE USING (
        id_empresa IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas
            WHERE user_id = auth.uid() AND activo = true
        )
    ) WITH CHECK (
        id_empresa IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas
            WHERE user_id = auth.uid() AND activo = true
        )
    );

CREATE POLICY "preciovolumen_delete" ON facturacion.preciovolumen
    FOR DELETE USING (
        id_empresa IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas
            WHERE user_id = auth.uid() AND activo = true
        )
    );

-- ─────────────────────────────────────────────────────────────────────────
-- GRUPO B: tablas sin empresa_id propio (filtran vía FK a tabla padre)
-- ─────────────────────────────────────────────────────────────────────────

DO $do$
DECLARE
    _r RECORD;
    _expr TEXT;
BEGIN
    FOR _r IN (
        SELECT * FROM (VALUES
            ('comprobante_detalles',  'comprobante_id',  'comprobantes'),
            ('comprobante_pagos',     'comprobante_id',  'comprobantes'),
            ('detalle_ingresos_stock','ingreso_id',      'ingresos_stock'),
            ('aplicaciones_nc_cxc',   'nota_credito_id', 'notas_credito'),
            ('notas_credito_detalle', 'nota_credito_id', 'notas_credito')
        ) AS t(child_tbl, fk_col, parent_tbl)
    ) LOOP
        _expr := format($f$%I IN (
            SELECT id FROM facturacion.%I WHERE empresa_id IN (
                SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
                UNION
                SELECT empresa_id FROM facturacion.usuario_empresas
                WHERE user_id = auth.uid() AND activo = true
            )
        )$f$, _r.fk_col, _r.parent_tbl);

        EXECUTE format('DROP POLICY IF EXISTS "authenticated_full_access" ON facturacion.%I', _r.child_tbl);
        EXECUTE format('CREATE POLICY %I ON facturacion.%I FOR SELECT USING (%s)',
            _r.child_tbl || '_select', _r.child_tbl, _expr);
        EXECUTE format('CREATE POLICY %I ON facturacion.%I FOR INSERT WITH CHECK (%s)',
            _r.child_tbl || '_insert', _r.child_tbl, _expr);
        EXECUTE format('CREATE POLICY %I ON facturacion.%I FOR UPDATE USING (%s) WITH CHECK (%s)',
            _r.child_tbl || '_update', _r.child_tbl, _expr, _expr);
        EXECUTE format('CREATE POLICY %I ON facturacion.%I FOR DELETE USING (%s)',
            _r.child_tbl || '_delete', _r.child_tbl, _expr);
    END LOOP;
END $do$;

-- ─────────────────────────────────────────────────────────────────────────
-- GRUPO C — empresas (tabla de referencia, filtra por id no empresa_id)
--
-- Reglas:
--   SELECT: empresas accesibles ∪ admin_plataforma
--   UPDATE: admin de empresa (is_admin en user_modules) ∪ admin_plataforma
--   INSERT/DELETE: solo admin_plataforma (no hay self-service de creación)
--
-- Nota: "admin de empresa" (user_modules.is_admin) ≠ "admin_plataforma"
-- (profiles.rol). El primero administra SU empresa (logo, config, menú);
-- el segundo administra la plataforma completa.
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "authenticated_full_access" ON facturacion.empresas;

CREATE POLICY "empresas_select" ON facturacion.empresas
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM facturacion.profiles p
            WHERE p.id = auth.uid() AND p.rol = 'admin_plataforma'
        )
        OR id IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas
            WHERE user_id = auth.uid() AND activo = true
        )
    );

CREATE POLICY "empresas_insert" ON facturacion.empresas
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM facturacion.profiles p
            WHERE p.id = auth.uid() AND p.rol = 'admin_plataforma'
        )
    );

CREATE POLICY "empresas_update" ON facturacion.empresas
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM facturacion.profiles p
            WHERE p.id = auth.uid() AND p.rol = 'admin_plataforma'
        )
        OR (
            EXISTS (
                SELECT 1 FROM facturacion.user_modules um
                WHERE um.user_id = auth.uid() AND um.is_admin = true
            )
            AND id IN (
                SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
                UNION
                SELECT empresa_id FROM facturacion.usuario_empresas
                WHERE user_id = auth.uid() AND activo = true
            )
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM facturacion.profiles p
            WHERE p.id = auth.uid() AND p.rol = 'admin_plataforma'
        )
        OR (
            EXISTS (
                SELECT 1 FROM facturacion.user_modules um
                WHERE um.user_id = auth.uid() AND um.is_admin = true
            )
            AND id IN (
                SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
                UNION
                SELECT empresa_id FROM facturacion.usuario_empresas
                WHERE user_id = auth.uid() AND activo = true
            )
        )
    );

CREATE POLICY "empresas_delete" ON facturacion.empresas
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM facturacion.profiles p
            WHERE p.id = auth.uid() AND p.rol = 'admin_plataforma'
        )
    );

-- ─────────────────────────────────────────────────────────────────────────
-- FINANCE — bancos (catálogo global compartido, NO tiene empresa_id)
--
-- Lectura: todos los autenticados (catálogo de bancos necesario para
-- seleccionar banco al crear cuentas bancarias).
-- Escritura: admin de empresa (is_admin) ∪ admin_plataforma.
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "fs_bancos_read"  ON finance.bancos;
DROP POLICY IF EXISTS "fs_bancos_write" ON finance.bancos;

CREATE POLICY "fs_bancos_read" ON finance.bancos
    FOR SELECT USING (true);

CREATE POLICY "fs_bancos_write" ON finance.bancos
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM facturacion.profiles p
            WHERE p.id = auth.uid() AND p.rol = 'admin_plataforma'
        )
        OR EXISTS (
            SELECT 1 FROM facturacion.user_modules um
            WHERE um.user_id = auth.uid() AND um.is_admin = true
        )
    );

CREATE POLICY "fs_bancos_update" ON finance.bancos
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM facturacion.profiles p
            WHERE p.id = auth.uid() AND p.rol = 'admin_plataforma'
        )
        OR EXISTS (
            SELECT 1 FROM facturacion.user_modules um
            WHERE um.user_id = auth.uid() AND um.is_admin = true
        )
    );

CREATE POLICY "fs_bancos_delete" ON finance.bancos
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM facturacion.profiles p
            WHERE p.id = auth.uid() AND p.rol = 'admin_plataforma'
        )
        OR EXISTS (
            SELECT 1 FROM facturacion.user_modules um
            WHERE um.user_id = auth.uid() AND um.is_admin = true
        )
    );

-- ═══════════════════════════════════════════════════════════════════════════
-- Verificación: debe devolver CERO filas (excepto fs_bancos_read que es
-- intencionalmente abierta para catálogo global)
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT schemaname, tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname IN ('facturacion','finance')
--   AND (qual = 'true' OR with_check = 'true')
-- ORDER BY schemaname, tablename;

-- ═══════════════════════════════════════════════════════════════════════════
-- Rollback (comentado)
-- ═══════════════════════════════════════════════════════════════════════════
-- -- Grupo A: restaurar políticas abiertas en 13 tablas estándar
-- DO $do$
-- DECLARE _tbl TEXT;
-- BEGIN
--     FOREACH _tbl IN ARRAY ARRAY[
--         'bodegas','cartera_cxc','cartera_cxc_pagos','categorias','clientes',
--         'codigos_retencion','comprobantes','kardex','notas_credito',
--         'productos','proveedores','stock_bodega','vendedores'
--     ] LOOP
--         EXECUTE format('DROP POLICY IF EXISTS %I ON facturacion.%I', _tbl||'_select', _tbl);
--         EXECUTE format('DROP POLICY IF EXISTS %I ON facturacion.%I', _tbl||'_insert', _tbl);
--         EXECUTE format('DROP POLICY IF EXISTS %I ON facturacion.%I', _tbl||'_update', _tbl);
--         EXECUTE format('DROP POLICY IF EXISTS %I ON facturacion.%I', _tbl||'_delete', _tbl);
--         EXECUTE format('CREATE POLICY "authenticated_full_access" ON facturacion.%I FOR ALL USING (true)', _tbl);
--     END LOOP;
-- END $do$;
--
-- -- profiles
-- DROP POLICY IF EXISTS "profiles_select" ON facturacion.profiles;
-- DROP POLICY IF EXISTS "profiles_insert" ON facturacion.profiles;
-- DROP POLICY IF EXISTS "profiles_update" ON facturacion.profiles;
-- DROP POLICY IF EXISTS "profiles_delete" ON facturacion.profiles;
-- CREATE POLICY "authenticated_full_access" ON facturacion.profiles FOR ALL USING (true);
--
-- -- preciovolumen
-- DROP POLICY IF EXISTS "preciovolumen_select" ON facturacion.preciovolumen;
-- DROP POLICY IF EXISTS "preciovolumen_insert" ON facturacion.preciovolumen;
-- DROP POLICY IF EXISTS "preciovolumen_update" ON facturacion.preciovolumen;
-- DROP POLICY IF EXISTS "preciovolumen_delete" ON facturacion.preciovolumen;
-- CREATE POLICY "authenticated_full_access" ON facturacion.preciovolumen FOR ALL USING (true);
--
-- -- Grupo B
-- DO $do$
-- DECLARE _tbl TEXT;
-- BEGIN
--     FOREACH _tbl IN ARRAY ARRAY[
--         'comprobante_detalles','comprobante_pagos','detalle_ingresos_stock',
--         'aplicaciones_nc_cxc','notas_credito_detalle'
--     ] LOOP
--         EXECUTE format('DROP POLICY IF EXISTS %I ON facturacion.%I', _tbl||'_select', _tbl);
--         EXECUTE format('DROP POLICY IF EXISTS %I ON facturacion.%I', _tbl||'_insert', _tbl);
--         EXECUTE format('DROP POLICY IF EXISTS %I ON facturacion.%I', _tbl||'_update', _tbl);
--         EXECUTE format('DROP POLICY IF EXISTS %I ON facturacion.%I', _tbl||'_delete', _tbl);
--         EXECUTE format('CREATE POLICY "authenticated_full_access" ON facturacion.%I FOR ALL USING (true)', _tbl);
--     END LOOP;
-- END $do$;
--
-- -- empresas
-- DROP POLICY IF EXISTS "empresas_select" ON facturacion.empresas;
-- DROP POLICY IF EXISTS "empresas_insert" ON facturacion.empresas;
-- DROP POLICY IF EXISTS "empresas_update" ON facturacion.empresas;
-- DROP POLICY IF EXISTS "empresas_delete" ON facturacion.empresas;
-- CREATE POLICY "authenticated_full_access" ON facturacion.empresas FOR ALL USING (true);
--
-- -- finance.bancos
-- DROP POLICY IF EXISTS "fs_bancos_read" ON finance.bancos;
-- DROP POLICY IF EXISTS "fs_bancos_write" ON finance.bancos;
-- DROP POLICY IF EXISTS "fs_bancos_update" ON finance.bancos;
-- DROP POLICY IF EXISTS "fs_bancos_delete" ON finance.bancos;
-- CREATE POLICY "fs_bancos_read" ON finance.bancos FOR SELECT USING (true);
-- CREATE POLICY "fs_bancos_write" ON finance.bancos FOR ALL TO authenticated USING (auth.role() = 'authenticated');
