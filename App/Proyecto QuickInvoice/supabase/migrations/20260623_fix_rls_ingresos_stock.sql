-- Fix RLS: facturacion.ingresos_stock
--
-- Estado anterior: política "authenticated_full_access" con qual = true
-- (cualquier usuario autenticado puede leer/escribir CUALQUIER fila,
-- de cualquier empresa). Equivale a no tener RLS.
--
-- Fix: reemplazar por 4 políticas separadas (SELECT/INSERT/UPDATE/DELETE)
-- filtrando por empresa_id, con el patrón multiempresa estándar:
--   profiles.empresa_id UNION usuario_empresas (activo = true)
--
-- Nota: tipo_compra ('INVENTARIO' vs 'SERVICIO') no afecta la política —
-- ambos tipos pertenecen a una empresa y siguen el mismo filtro.

-- ── DROP política abierta ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_full_access" ON facturacion.ingresos_stock;

-- ── SELECT ──────────────────────────────────────────────────────────────────
CREATE POLICY "ingresos_stock_select" ON facturacion.ingresos_stock
    FOR SELECT USING (
        empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
        )
    );

-- ── INSERT ──────────────────────────────────────────────────────────────────
CREATE POLICY "ingresos_stock_insert" ON facturacion.ingresos_stock
    FOR INSERT WITH CHECK (
        empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
        )
    );

-- ── UPDATE ──────────────────────────────────────────────────────────────────
CREATE POLICY "ingresos_stock_update" ON facturacion.ingresos_stock
    FOR UPDATE USING (
        empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
        )
    ) WITH CHECK (
        empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
        )
    );

-- ── DELETE ──────────────────────────────────────────────────────────────────
CREATE POLICY "ingresos_stock_delete" ON facturacion.ingresos_stock
    FOR DELETE USING (
        empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
        )
    );

-- ── Verificación ────────────────────────────────────────────────────────────
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'facturacion' AND tablename = 'ingresos_stock';

-- ── Rollback (comentado) ────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "ingresos_stock_select" ON facturacion.ingresos_stock;
-- DROP POLICY IF EXISTS "ingresos_stock_insert" ON facturacion.ingresos_stock;
-- DROP POLICY IF EXISTS "ingresos_stock_update" ON facturacion.ingresos_stock;
-- DROP POLICY IF EXISTS "ingresos_stock_delete" ON facturacion.ingresos_stock;
-- CREATE POLICY "authenticated_full_access" ON facturacion.ingresos_stock
--     FOR ALL TO authenticated USING (true);
