-- ============================================================
-- Activar LOPDP para una empresa de pruebas (correr en Supabase
-- SQL Editor — ahí se ejecuta como postgres/superuser, por lo que
-- pasa por encima del RLS que restringe INSERT/UPDATE a
-- facturacion.es_admin_plataforma() vía PostgREST)
-- ============================================================

-- 1. Ubica el empresa_id de tu empresa de pruebas
SELECT id, nombre, razon_social, ruc
FROM facturacion.empresas
WHERE nombre ILIKE '%NOMBRE_DE_TU_EMPRESA_DE_PRUEBA%'
   OR ruc = 'RUC_DE_TU_EMPRESA_DE_PRUEBA';

-- 2. Activa el flag (reemplaza <EMPRESA_ID> por el id obtenido arriba)
INSERT INTO lopdp.empresas_config (empresa_id, lopdp_enabled)
VALUES ('<EMPRESA_ID>', true)
ON CONFLICT (empresa_id) DO UPDATE
    SET lopdp_enabled = true,
        updated_at    = timezone('utc', now());

-- 3. Verificación
SELECT * FROM lopdp.empresas_config WHERE empresa_id = '<EMPRESA_ID>';

-- ────────────────────────────────────────────────────────────
-- Para DESACTIVARLO de nuevo cuando termines de probar:
-- UPDATE lopdp.empresas_config SET lopdp_enabled = false WHERE empresa_id = '<EMPRESA_ID>';
-- ────────────────────────────────────────────────────────────
