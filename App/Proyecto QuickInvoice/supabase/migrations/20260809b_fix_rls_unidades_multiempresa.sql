-- Fix RLS multiempresa en facturacion.unidades: la política original
-- (20260809_unidades.sql) solo validaba profiles.empresa_id — el mismo bug
-- que ya se corrigió para categorias/productos/etc. en
-- 20260623_fix_rls_barrido_general.sql. Usuarios multiempresa
-- (facturacion.usuario_empresas) no podían leer/crear unidades en una
-- empresa secundaria -> dropdown de Unidad vacío en Compras.

DROP POLICY IF EXISTS "unidades_empresa" ON facturacion.unidades;

DO $do$
DECLARE
    _using TEXT := $u$empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas
            WHERE user_id = auth.uid() AND activo = true
        )$u$;
BEGIN
    EXECUTE format('CREATE POLICY %I ON facturacion.unidades FOR SELECT USING (%s)',
        'unidades_select', _using);
    EXECUTE format('CREATE POLICY %I ON facturacion.unidades FOR INSERT WITH CHECK (%s)',
        'unidades_insert', _using);
    EXECUTE format('CREATE POLICY %I ON facturacion.unidades FOR UPDATE USING (%s) WITH CHECK (%s)',
        'unidades_update', _using, _using);
    EXECUTE format('CREATE POLICY %I ON facturacion.unidades FOR DELETE USING (%s)',
        'unidades_delete', _using);
END $do$;
