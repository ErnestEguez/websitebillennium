-- Fix RLS multiempresa: detalle_servicios, cuentas_por_pagar, pagos_proveedores,
-- retenciones_compras, ordenes_compra, detalle_ordenes_compra
--
-- Root cause: las políticas creadas en 20260515_vendor_management.sql solo
-- validan contra profiles.empresa_id (puntero legacy de 1 sola empresa).
-- Usuarios multiempresa (usuario_empresas) reciben "new row violates row-level
-- security policy" al trabajar en cualquier empresa distinta a la guardada en
-- profiles.empresa_id.
--
-- Caso real: Janela tiene profiles.empresa_id = Piff, pero también opera en
-- Fundación Nacional y Prentisa (usuario_empresas). Al registrar una "Compra
-- de servicios" en Fundación Nacional/Prentisa, el INSERT en detalle_servicios
-- (empresa_id = Fundación/Prentisa) no está en {Piff} -> RLS lo bloquea.
--
-- Fix: agregar usuario_empresas (activo=true) como fuente válida adicional de
-- empresa_id, igual que ya se hizo a nivel de app en AdminPermisosPage.tsx.

DROP POLICY IF EXISTS "detalle_servicios_empresa" ON facturacion.detalle_servicios;
CREATE POLICY "detalle_servicios_empresa" ON facturacion.detalle_servicios
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

DROP POLICY IF EXISTS "cxp_empresa" ON facturacion.cuentas_por_pagar;
CREATE POLICY "cxp_empresa" ON facturacion.cuentas_por_pagar
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

DROP POLICY IF EXISTS "pagos_proveedores_empresa" ON facturacion.pagos_proveedores;
CREATE POLICY "pagos_proveedores_empresa" ON facturacion.pagos_proveedores
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

DROP POLICY IF EXISTS "retenciones_compras_empresa" ON facturacion.retenciones_compras;
CREATE POLICY "retenciones_compras_empresa" ON facturacion.retenciones_compras
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

DROP POLICY IF EXISTS "ordenes_compra_empresa" ON facturacion.ordenes_compra;
CREATE POLICY "ordenes_compra_empresa" ON facturacion.ordenes_compra
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

DROP POLICY IF EXISTS "detalle_oc_empresa" ON facturacion.detalle_ordenes_compra;
CREATE POLICY "detalle_oc_empresa" ON facturacion.detalle_ordenes_compra
    FOR ALL USING (oc_id IN (
        SELECT id FROM facturacion.ordenes_compra WHERE empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
        )
    ));
