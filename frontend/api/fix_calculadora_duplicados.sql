-- ============================================================
-- Fix: duplicados en calculadora_modulos y calculadora_tramos
--
-- Causa raíz: el INSERT semilla de schema_calculadora.sql usaba
-- "ON CONFLICT DO NOTHING" sin decir contra qué columna comparar. El
-- único unique real de esas tablas era "id" (UUID generado siempre
-- nuevo), así que nunca había conflicto — cada vez que se corrió el
-- script de nuevo, insertó todas las filas otra vez en lugar de dejarlas
-- como estaban. Ya corregido en schema_calculadora.sql (ahora compara
-- por nombre / por parametro+orden). Este script solo limpia lo que ya
-- quedó duplicado en la base y dejarla como si el script se hubiera
-- corrido una sola vez.
--
-- Correr una sola vez en el SQL Editor del proyecto Supabase
-- ietsocfibsoclienqafq, esquema public.
-- ============================================================

-- 1. Borrar todo lo que hay en estas dos tablas (incluye duplicados
--    y cualquier ajuste manual que se haya hecho mientras estaban
--    duplicadas — se vuelve a sembrar limpio en el paso 3).
DELETE FROM calculadora_tramos;
DELETE FROM calculadora_modulos;

-- 2. Índices únicos que faltaban (si ya corriste el schema_calculadora.sql
--    actualizado, esto no hace nada nuevo — es seguro correrlo de todas
--    formas, CREATE UNIQUE INDEX IF NOT EXISTS es idempotente).
CREATE UNIQUE INDEX IF NOT EXISTS calculadora_modulos_nombre_idx ON calculadora_modulos (nombre);
CREATE UNIQUE INDEX IF NOT EXISTS calculadora_tramos_parametro_orden_idx ON calculadora_tramos (parametro, orden);

-- 3. Re-sembrar limpio (mismos valores iniciales — desde el panel
--    /admin/calculadora los puedes cambiar después sin volver a tocar SQL).
INSERT INTO calculadora_modulos (nombre, precio, orden) VALUES
    ('Gerencia',       10, 1),
    ('Facturación',    20, 2),
    ('Inventario',     10, 3),
    ('Clientes',       15, 4),
    ('Proveedores',    15, 5),
    ('Financiero',     10, 6),
    ('Contabilidad',   20, 7),
    ('Talento Humano', 30, 8),
    ('Nóminas',        20, 9),
    ('Tributario',     15, 10)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO calculadora_tramos (parametro, orden, desde, hasta, recargo, es_contactar) VALUES
    ('clientes', 1,     0,   300,  0, false),
    ('clientes', 2,   301,  1000,  8, false),
    ('clientes', 3,  1001,  3000, 18, false),
    ('clientes', 4,  3001,  8000, 35, false),
    ('clientes', 5,  8001,  NULL,  0, true),

    ('articulos', 1,     0,   500,  0, false),
    ('articulos', 2,   501,  2000,  8, false),
    ('articulos', 3,  2001,  5000, 18, false),
    ('articulos', 4,  5001, 15000, 35, false),
    ('articulos', 5, 15001,  NULL,  0, true),

    ('facturas', 1,     0,   300,  0, false),
    ('facturas', 2,   301,  1000, 15, false),
    ('facturas', 3,  1001,  3000, 35, false),
    ('facturas', 4,  3001,  8000, 70, false),
    ('facturas', 5,  8001,  NULL,  0, true),

    ('compras', 1,     0,   150,  0, false),
    ('compras', 2,   151,   500,  8, false),
    ('compras', 3,   501,  1500, 18, false),
    ('compras', 4,  1501,  4000, 35, false),
    ('compras', 5,  4001,  NULL,  0, true),

    ('empleados', 1,    0,    15,  0, false),
    ('empleados', 2,   16,    50, 10, false),
    ('empleados', 3,   51,   150, 25, false),
    ('empleados', 4,  151,   400, 50, false),
    ('empleados', 5,  401,  NULL,  0, true)
ON CONFLICT (parametro, orden) DO NOTHING;

-- ============================================================
-- Verificación — debe dar 10 módulos y 25 tramos (5 parámetros x 5 c/u)
-- ============================================================
-- SELECT count(*) FROM calculadora_modulos;   -- esperado: 10
-- SELECT count(*) FROM calculadora_tramos;    -- esperado: 25
