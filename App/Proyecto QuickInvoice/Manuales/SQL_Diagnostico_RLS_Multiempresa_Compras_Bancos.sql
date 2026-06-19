-- Diagnóstico: "new row violates row-level security policy" en
-- facturacion.detalle_servicios y facturacion.cuentas_bancarias
--
-- Hipótesis: MISMO root cause que el bug de "Permisos de usuario" multiempresa
-- (Janela: Fundación, Piff, Prentisa). La política de detalle_servicios
-- (migración 20260515_vendor_management.sql) es:
--
--   CREATE POLICY "detalle_servicios_empresa" ON facturacion.detalle_servicios
--       FOR ALL USING (empresa_id IN (
--           SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
--       ));
--
-- Esto solo valida contra profiles.empresa_id (1 sola empresa "legacy").
-- Si el usuario está trabajando en una empresa DISTINTA a la que tiene en
-- profiles.empresa_id (su multiempresa real vive en usuario_empresas),
-- el INSERT/UPDATE es bloqueado por RLS -> "new row violates row-level
-- security policy".
--
-- cuentas_bancarias NO está en los archivos de migración del repo (se creó
-- directo en Supabase como parte de "Tesorería/Finance Suite"), por eso
-- necesitamos ver su política real con pg_policies.

-- 1. Políticas RLS reales de las tablas involucradas en Compras de Servicios
--    y Tesorería / Cuentas Bancarias
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'facturacion'
  AND tablename IN (
    'detalle_servicios', 'ingresos_stock', 'retenciones_compras',
    'cuentas_por_pagar', 'pagos_proveedores',
    'cuentas_bancarias', 'bancos', 'comprobantes_egreso', 'movimientos_bancarios'
  )
ORDER BY tablename, policyname;

-- 2. Usuarios con MÁS DE UNA empresa asignada (multiempresa real) y el valor
--    actual de profiles.empresa_id (puntero legacy de 1 sola empresa).
--    Si profiles.empresa_id NO está en la lista de empresa_id de
--    usuario_empresas, ese usuario tendrá este error al trabajar en
--    cualquier empresa que no sea esa.
SELECT
    au.email,
    p.empresa_id AS profiles_empresa_id,
    pe.nombre    AS profiles_empresa_nombre,
    array_agg(e.nombre ORDER BY e.nombre) AS empresas_usuario_empresas,
    (p.empresa_id = ANY(array_agg(ue.empresa_id))) AS profiles_empresa_coincide
FROM facturacion.usuario_empresas ue
JOIN auth.users au ON au.id = ue.user_id
JOIN facturacion.empresas e ON e.id = ue.empresa_id
LEFT JOIN facturacion.profiles p ON p.id = ue.user_id
LEFT JOIN facturacion.empresas pe ON pe.id = p.empresa_id
WHERE ue.activo = true
GROUP BY au.email, p.empresa_id, pe.nombre
HAVING count(*) > 1
ORDER BY au.email;

-- 3. Políticas RLS reales de Tesorería (schema "finance", NO "facturacion" —
--    cuentas_bancarias / bancos / comprobantes_egreso / movimientos_bancarios
--    viven ahí, ver src/lib/supabaseFinance.ts).
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'finance'
ORDER BY tablename, policyname;

-- 4. ¿RLS habilitado en esas tablas? (si está en true sin políticas para
--    INSERT, todo INSERT se bloquea aunque el SELECT funcione vía otra vía)
SELECT schemaname, tablename, rowsecurity, forcerowsecurity
FROM pg_tables
WHERE schemaname = 'finance'
ORDER BY tablename;
