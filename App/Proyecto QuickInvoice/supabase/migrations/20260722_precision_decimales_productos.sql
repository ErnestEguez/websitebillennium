-- ============================================================
-- PRECISIÓN DECIMAL — productos / kardex — 2026-07-22
-- Esquema: facturacion
-- ============================================================
-- precio_venta y costo_promedio quedaron en DECIMAL(12,2) desde la
-- creación original de la tabla (nunca alterados en migraciones
-- posteriores), a diferencia de precio2/3/4 que ya usan NUMERIC(12,4)
-- (ver 20260708_mejoras_generales.sql). Postgres redondea silenciosamente
-- al insertar valores con más de 2 decimales en una columna scale=2,
-- causando pérdida de precisión en migración masiva de artículos.

ALTER TABLE facturacion.productos
    ALTER COLUMN precio_venta   TYPE NUMERIC(12,4),
    ALTER COLUMN costo_promedio TYPE NUMERIC(12,4);

ALTER TABLE facturacion.kardex
    ALTER COLUMN costo_unitario         TYPE NUMERIC(12,4),
    ALTER COLUMN saldo_costo_promedio   TYPE NUMERIC(12,4);
