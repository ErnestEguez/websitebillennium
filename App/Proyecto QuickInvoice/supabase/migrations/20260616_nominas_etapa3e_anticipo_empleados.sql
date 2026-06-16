-- Etapa 3e: Parámetro de anticipo personal en el maestro de empleados
-- Permite configurar por empleado si su anticipo es porcentaje (ej: 40%) o valor fijo (ej: $200)

ALTER TABLE nominas.empleados
    ADD COLUMN IF NOT EXISTS anticipo_tipo  TEXT    CHECK (anticipo_tipo IN ('porcentaje', 'fijo')),
    ADD COLUMN IF NOT EXISTS anticipo_valor NUMERIC(12,2);

COMMENT ON COLUMN nominas.empleados.anticipo_tipo  IS 'Tipo de cálculo del anticipo: porcentaje del sueldo o valor fijo. NULL usa el default de la empresa (40%).';
COMMENT ON COLUMN nominas.empleados.anticipo_valor IS 'Valor del anticipo: porcentaje (ej: 40 para 40%) o monto fijo (ej: 200.00)';
