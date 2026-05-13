-- =====================================================
-- Script: Copiar config_sri a empresa Ferremundo
-- Y corregir el config_sri para que incluya todos los campos SRI
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. Ver todas las empresas y su config_sri actual
SELECT id, nombre, ruc, config_sri 
FROM empresas 
ORDER BY nombre;

-- =====================================================
-- 2. Actualizar el config_sri de Ferremundo con los datos correctos
--    REEMPLAZAR los valores según corresponda
-- =====================================================

UPDATE empresas
SET config_sri = jsonb_build_object(
    'ambiente',           'PRUEBAS',          -- Cambiar a 'PRODUCCION' cuando sea real
    'establecimiento',    '001',               -- Número de establecimiento (3 dígitos)
    'punto_emision',      '001',               -- Punto de emisión (3 dígitos)
    'secuencial_inicio',  1,                   -- Se reemplazará automáticamente por el MAX de comprobantes
    'firma_url',          '2cc67efa-9632-4318-8e86-fb40fdee1ab3_1773098406105.p12',
    'firma_path',         '2cc67efa-9632-4318-8e86-fb40fdee1ab3_1773098406105.p12',
    'firma_password',     'carlos2026',
    'mail_user',          'carlos@hotmail.com',
    'obligado_contabilidad', 'NO'
)
WHERE nombre ILIKE '%ferremundo%'
  OR nombre ILIKE '%ferr%';

-- 3. Verificar que se actualizó
SELECT id, nombre, config_sri 
FROM empresas 
WHERE nombre ILIKE '%ferr%';

-- =====================================================
-- ALTERNATIVA: Si sabe el ID exacto de la empresa Ferremundo
-- (Obténgalo del SELECT del paso 1)
-- =====================================================
-- UPDATE empresas
-- SET config_sri = jsonb_build_object(
--     'ambiente',           'PRUEBAS',
--     'establecimiento',    '001',
--     'punto_emision',      '001',
--     'secuencial_inicio',  1,
--     'firma_url',          '2cc67efa-9632-4318-8e86-fb40fdee1ab3_1773098406105.p12',
--     'firma_path',         '2cc67efa-9632-4318-8e86-fb40fdee1ab3_1773098406105.p12',
--     'firma_password',     'carlos2026',
--     'mail_user',          'carlos@hotmail.com',
--     'obligado_contabilidad', 'NO'
-- )
-- WHERE id = 'AQUI-EL-UUID-DE-FERREMUNDO';

-- =====================================================
