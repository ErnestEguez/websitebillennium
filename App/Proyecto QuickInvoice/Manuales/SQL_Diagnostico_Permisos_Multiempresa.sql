-- Diagnóstico: por qué "Ajustes > Permisos de usuario" no carga para usuarios
-- multiempresa (ej. Janela: Fundación, Piff, Prentisa), mientras que para usuarios
-- de una sola empresa (ej. Comercial) sí funciona.
--
-- Hipótesis: igual que pasó con config_contable, la política RLS de user_modules
-- (y quizás caja_sesiones / lp_tipos_comprobante / mesas) solo valida contra
-- profiles.empresa_id (1 empresa) y no contra usuario_empresas (multiempresa).
-- isAdmin se calcula leyendo user_modules.is_admin para (user_id, empresa_id) ->
-- si la política bloquea esa fila, isAdmin queda en false y la pantalla de
-- Permisos de usuario muestra "Solo el administrador puede acceder a esta pantalla".

-- 1. Políticas RLS de las tablas involucradas
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'facturacion'
  AND tablename IN ('user_modules', 'profiles', 'usuario_empresas', 'caja_sesiones', 'lp_tipos_comprobante', 'mesas')
ORDER BY tablename, policyname;

-- 2. Empresas asignadas a Janela y su fila en user_modules por empresa
--    (reemplaza el email si es necesario)
SELECT ue.empresa_id, e.nombre AS empresa, ue.rol, ue.activo,
       um.is_admin, um.vendor, um.finance, um.ledgerpro
FROM facturacion.usuario_empresas ue
JOIN facturacion.empresas e ON e.id = ue.empresa_id
LEFT JOIN facturacion.user_modules um
       ON um.user_id = ue.user_id AND um.empresa_id = ue.empresa_id
WHERE ue.user_id = (SELECT id FROM auth.users WHERE email = 'janela@gmail.com')
ORDER BY e.nombre;

-- 3. Valor actual de profiles.empresa_id para Janela (puntero legacy de 1 sola
--    empresa). El botón "Dar Acceso via Portal" probablemente sobreescribe
--    este campo cada vez que se usa, dejando solo la última empresa registrada.
--    RESULTADO YA CONFIRMADO: empresa_id = 63502ef5-... (Piff, la última registrada)
SELECT id, email, nombre, empresa_id
FROM facturacion.profiles
WHERE id = (SELECT id FROM auth.users WHERE email = 'janela@gmail.com');

-- 4. Definición de la función dar_acceso_portal (qué tablas/columnas escribe)
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'dar_acceso_portal';
