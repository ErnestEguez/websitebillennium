-- Fix RLS multiempresa: schema "finance" (Tesorería)
--
-- Mismo root cause que 20260612_fix_rls_multiempresa_compras.sql, ahora en
-- el schema finance: cada política original es
--
--   empresa_id IN (
--       SELECT profiles.empresa_id FROM facturacion.profiles
--       WHERE profiles.id = auth.uid()
--   )
--
-- Solo valida profiles.empresa_id (1 sola empresa legacy). Usuarios
-- multiempresa (usuario_empresas) son bloqueados al trabajar en cualquier
-- empresa distinta a la guardada en profiles.empresa_id.
--
-- Fix: agregar facturacion.usuario_empresas (activo=true) como fuente válida
-- adicional de empresa_id. fs_cb_empresa (cuentas_bancarias) ya fue corregida
-- (no se repite aquí). fs_bancos_read / fs_bancos_write NO usan empresa_id
-- (catálogo compartido de bancos) -> no aplica, se dejan igual.

DROP POLICY IF EXISTS "fs_anticipos_empresa" ON finance.anticipos_proveedores;
CREATE POLICY "fs_anticipos_empresa" ON finance.anticipos_proveedores
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

DROP POLICY IF EXISTS "fs_cheques_empresa" ON finance.cheques;
CREATE POLICY "fs_cheques_empresa" ON finance.cheques
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

DROP POLICY IF EXISTS "fs_ce_empresa" ON finance.comprobantes_egreso;
CREATE POLICY "fs_ce_empresa" ON finance.comprobantes_egreso
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

DROP POLICY IF EXISTS "fs_concil_lineas_empresa" ON finance.conciliacion_lineas;
CREATE POLICY "fs_concil_lineas_empresa" ON finance.conciliacion_lineas
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

DROP POLICY IF EXISTS "fs_concil_empresa" ON finance.conciliaciones;
CREATE POLICY "fs_concil_empresa" ON finance.conciliaciones
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

DROP POLICY IF EXISTS "fs_config_empresa" ON finance.configuracion_empresa;
CREATE POLICY "fs_config_empresa" ON finance.configuracion_empresa
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

DROP POLICY IF EXISTS "fs_epc_empresa" ON finance.egreso_pagos_cxp;
CREATE POLICY "fs_epc_empresa" ON finance.egreso_pagos_cxp
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

DROP POLICY IF EXISTS "fs_mov_empresa" ON finance.movimientos_bancarios;
CREATE POLICY "fs_mov_empresa" ON finance.movimientos_bancarios
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
