-- ============================================================
-- FINANCE SUITE — GRANTs y RLS faltantes
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Exponer schema finance a PostgREST (si no está ya en API settings)
GRANT USAGE ON SCHEMA finance TO authenticated;

-- 2. bancos: catálogo global, solo lectura para authenticated, escritura para service_role
ALTER TABLE finance.bancos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fs_bancos_read"  ON finance.bancos FOR SELECT USING (true);
CREATE POLICY "fs_bancos_write" ON finance.bancos FOR ALL   USING (auth.role() = 'authenticated');
GRANT ALL ON finance.bancos TO authenticated;

-- 3. Resto de tablas (todas por empresa)
GRANT ALL ON finance.cuentas_bancarias      TO authenticated;
GRANT ALL ON finance.configuracion_empresa  TO authenticated;
GRANT ALL ON finance.comprobantes_egreso    TO authenticated;
GRANT ALL ON finance.egreso_pagos_cxp       TO authenticated;
GRANT ALL ON finance.cheques                TO authenticated;
GRANT ALL ON finance.anticipos_proveedores  TO authenticated;
GRANT ALL ON finance.movimientos_bancarios  TO authenticated;
GRANT ALL ON finance.conciliaciones         TO authenticated;
GRANT ALL ON finance.conciliacion_lineas    TO authenticated;

-- 4. Funciones
GRANT EXECUTE ON FUNCTION finance.fn_siguiente_numero_egreso(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION finance.fn_saldo_cuenta(UUID) TO authenticated;

-- 5. Secuencias (si las hay)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA finance TO authenticated;
