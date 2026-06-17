-- =============================================================
-- DIAGNÓSTICO Y REPARACIÓN: Columnas faltantes en rol_lineas
-- Ejecutar en el SQL Editor de Supabase si DIAS_FALTA siempre muestra 30 días
-- =============================================================

-- 1. Verificar qué columnas tiene actualmente rol_lineas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'nominas'
  AND table_name   = 'rol_lineas'
ORDER BY ordinal_position;

-- 2. Agregar columnas que pueden estar faltando (IF NOT EXISTS = seguro de correr)
ALTER TABLE nominas.rol_lineas
    ADD COLUMN IF NOT EXISTS horas              NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS novedad_id         UUID REFERENCES nominas.novedades(id),
    ADD COLUMN IF NOT EXISTS anticipo_linea_id  UUID REFERENCES nominas.anticipo_lineas(id);

-- 3. Verificar conceptos DIAS_FALTA registrados en la empresa
--    (confirmar que el código es exactamente 'DIAS_FALTA')
SELECT id, codigo, nombre, tipo, aplica_siempre, activo
FROM nominas.conceptos
WHERE codigo ILIKE '%falta%' OR codigo ILIKE '%dias%';

-- 4. Verificar si hay líneas de DIAS_FALTA en el último período y si tienen horas
SELECT
    rl.id,
    rl.codigo,
    rl.horas,
    rl.monto,
    e.apellidos || ', ' || e.nombres AS empleado,
    p.nombre AS periodo
FROM nominas.rol_lineas rl
JOIN nominas.rol_cabecera rc ON rc.id = rl.cabecera_id
JOIN nominas.periodos p      ON p.id  = rc.periodo_id
JOIN nominas.empleados e     ON e.id  = rc.empleado_id
WHERE rl.codigo = 'DIAS_FALTA'
ORDER BY p.fecha_inicio DESC, e.apellidos;
