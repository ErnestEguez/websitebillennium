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

-- =============================================================
-- CORRECCIÓN DE DATOS: cuando horas=null pero monto=número_de_días
-- Si el usuario ingresó "2" en el campo $ (monto) en lugar del campo de días,
-- el sistema guardó monto=2 y horas=null. Este script lo corrige:
-- - horas  = valor del monto (ej: 2 días)
-- - monto  = (sueldo_base / 30) * días_de_falta (valor correcto)
-- =============================================================
UPDATE nominas.rol_lineas rl
SET
    horas = rl.monto,
    monto = ROUND((rc.sueldo_base / 30.0) * rl.monto, 2)
FROM nominas.rol_cabecera rc
WHERE rl.cabecera_id = rc.id
  AND rl.codigo      = 'DIAS_FALTA'
  AND rl.horas IS NULL
  AND rl.monto > 0
  AND rl.monto < 15;  -- valores < 15 son claramente días, no montos

-- Verificar el resultado después de la corrección:
SELECT
    rl.codigo, rl.horas, rl.monto,
    e.apellidos || ', ' || e.nombres AS empleado
FROM nominas.rol_lineas rl
JOIN nominas.rol_cabecera rc ON rc.id = rl.cabecera_id
JOIN nominas.empleados e     ON e.id  = rc.empleado_id
WHERE rl.codigo = 'DIAS_FALTA'
ORDER BY e.apellidos;
