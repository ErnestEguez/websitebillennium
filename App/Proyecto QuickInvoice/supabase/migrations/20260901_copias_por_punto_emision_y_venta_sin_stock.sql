-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Copias del ticket 80mm por PUNTO DE EMISIÓN (antes era un solo valor
--    por empresa en empresas.config_sri->>'copias_pos_factura', no distinguía
--    cajas con impresoras distintas — ej. una matricial vieja a la que no le
--    tiene sentido mandarle 2 copias).
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE facturacion.puntos_emision
    ADD COLUMN IF NOT EXISTS copias_pos_factura INTEGER NOT NULL DEFAULT 1
        CHECK (copias_pos_factura BETWEEN 1 AND 5);

-- Backfill: cada punto de emisión hereda el valor que ya tenía su empresa en
-- config_sri, para que esta migración no cambie el comportamiento de nadie.
UPDATE facturacion.puntos_emision pe
SET copias_pos_factura = LEAST(5, GREATEST(1, COALESCE((e.config_sri ->> 'copias_pos_factura')::int, 1)))
FROM facturacion.empresas e
WHERE e.id = pe.empresa_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Toggle por empresa: permitir facturar con stock en cero (o negativo).
--    Default TRUE (permitir) — es el comportamiento actual de TODAS las
--    empresas hoy, no existe ningún bloqueo de stock al facturar en ninguna
--    parte del sistema. Esta migración no cambia nada hasta que alguien
--    apague el toggle explícitamente para su empresa en Ajustes.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE facturacion.empresas
    ADD COLUMN IF NOT EXISTS permitir_venta_sin_stock BOOLEAN NOT NULL DEFAULT true;
