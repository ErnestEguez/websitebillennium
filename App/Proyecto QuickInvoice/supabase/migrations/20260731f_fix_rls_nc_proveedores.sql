-- ============================================================
-- Fix: RLS de notas_credito_proveedores usaba el patrón viejo
-- "empresa_id IN (SELECT empresa_id FROM profiles WHERE id = auth.uid())",
-- que solo reconoce la empresa PRINCIPAL del usuario (profiles.empresa_id).
--
-- Un usuario con acceso a una empresa adicional vía
-- facturacion.usuario_empresas (multiempresa) no aparece en esa
-- consulta, por lo que el INSERT de la N/C de proveedor fallaba con
-- "new row violates row-level security policy" al registrar una
-- devolución de compra en una empresa distinta a la principal.
--
-- Fix: usar facturacion.mis_empresas_ids(), el helper ya establecido
-- (creado en 20260623_fix_profiles_rls_dar_acceso_portal.sql) que
-- une profiles.empresa_id + usuario_empresas activas.
-- ============================================================

DROP POLICY IF EXISTS "nc_proveedores_empresa" ON facturacion.notas_credito_proveedores;
CREATE POLICY "nc_proveedores_empresa" ON facturacion.notas_credito_proveedores
    FOR ALL USING (empresa_id IN (SELECT facturacion.mis_empresas_ids()));

DROP POLICY IF EXISTS "nc_proveedores_detalle_empresa" ON facturacion.notas_credito_proveedores_detalle;
CREATE POLICY "nc_proveedores_detalle_empresa" ON facturacion.notas_credito_proveedores_detalle
    FOR ALL USING (nc_proveedor_id IN (
        SELECT id FROM facturacion.notas_credito_proveedores
        WHERE empresa_id IN (SELECT facturacion.mis_empresas_ids())
    ));
