-- =============================================================
-- LIMPIAR DIAS_FALTA: borra líneas y novedades para empezar desde cero
-- Ejecutar en Supabase SQL Editor
-- =============================================================

-- 1. Borrar todas las líneas DIAS_FALTA de todos los períodos
DELETE FROM nominas.rol_lineas
WHERE codigo = 'DIAS_FALTA';

-- 2. Borrar todas las novedades DIAS_FALTA (las que se crearon incorrectamente)
DELETE FROM nominas.novedades
WHERE codigo = 'DIAS_FALTA';

-- 3. Verificar que quedó limpio
SELECT COUNT(*) AS lineas_restantes  FROM nominas.rol_lineas  WHERE codigo = 'DIAS_FALTA';
SELECT COUNT(*) AS novedades_restantes FROM nominas.novedades WHERE codigo = 'DIAS_FALTA';
