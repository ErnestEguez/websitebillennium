-- ============================================================
-- FIX: triggers de saldo CxC / CxP
--
-- Problemas corregidos:
-- 1. fn_actualizar_saldo_cxp no tenía SECURITY DEFINER, por lo
--    que el recálculo de saldo podía no aplicarse según RLS.
-- 2. Los triggers solo disparaban en INSERT / UPDATE OF estado.
--    Si un pago se borra directamente (Supabase Table Editor)
--    el saldo de la cartera/CxP quedaba "congelado" y la deuda
--    no volvía a aparecer. Ahora también disparan en DELETE.
--
-- Re-aplica también las columnas de reversa por si la migración
-- 20260610_reversar_pagos_cartera.sql no se ejecutó todavía
-- (ADD COLUMN IF NOT EXISTS es idempotente).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 0. Columnas de reversa (idempotente)
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturacion.cartera_cxc_pagos
    ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activo'
        CHECK (estado IN ('activo','reversado')),
    ADD COLUMN IF NOT EXISTS lp_comprobante_id UUID,
    ADD COLUMN IF NOT EXISTS reversado_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reversado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS motivo_reversa TEXT;

ALTER TABLE facturacion.pagos_proveedores
    ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activo'
        CHECK (estado IN ('activo','reversado')),
    ADD COLUMN IF NOT EXISTS lp_comprobante_id UUID,
    ADD COLUMN IF NOT EXISTS reversado_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reversado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS motivo_reversa TEXT;

-- ────────────────────────────────────────────────────────────
-- 1. fn_actualizar_saldo_cxc — + DELETE, sigue con SECURITY DEFINER
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION facturacion.fn_actualizar_saldo_cxc()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = facturacion AS $$
DECLARE
    v_cartera_id UUID := COALESCE(NEW.cartera_id, OLD.cartera_id);
    v_saldo DECIMAL(12,2);
    v_estado_actual TEXT;
    v_valor_original DECIMAL(12,2);
BEGIN
    SELECT c.estado, c.valor_original
    INTO v_estado_actual, v_valor_original
    FROM facturacion.cartera_cxc c
    WHERE c.id = v_cartera_id;

    SELECT v_valor_original - COALESCE(SUM(p.valor) FILTER (WHERE p.estado = 'activo'), 0)
    INTO v_saldo
    FROM facturacion.cartera_cxc_pagos p
    WHERE p.cartera_id = v_cartera_id;

    UPDATE facturacion.cartera_cxc
    SET saldo = GREATEST(v_saldo, 0),
        estado = CASE
            WHEN v_estado_actual = 'anulada' THEN 'anulada'
            WHEN v_saldo <= 0 THEN 'pagada'
            WHEN v_saldo < v_valor_original THEN 'parcial'
            ELSE 'pendiente'
        END,
        updated_at = now()
    WHERE id = v_cartera_id;

    RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_actualizar_saldo_cxc ON facturacion.cartera_cxc_pagos;
CREATE TRIGGER trg_actualizar_saldo_cxc
AFTER INSERT OR DELETE OR UPDATE OF estado ON facturacion.cartera_cxc_pagos
FOR EACH ROW EXECUTE FUNCTION facturacion.fn_actualizar_saldo_cxc();

-- ────────────────────────────────────────────────────────────
-- 2. fn_actualizar_saldo_cxp — + SECURITY DEFINER, + DELETE
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION facturacion.fn_actualizar_saldo_cxp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = facturacion AS $$
DECLARE
    v_cxp_id UUID := COALESCE(NEW.cxp_id, OLD.cxp_id);
    v_saldo_nuevo DECIMAL(12,2);
    v_estado_actual TEXT;
    v_monto_original DECIMAL(12,2);
BEGIN
    SELECT c.estado, c.monto_original
    INTO v_estado_actual, v_monto_original
    FROM facturacion.cuentas_por_pagar c
    WHERE c.id = v_cxp_id;

    SELECT v_monto_original - COALESCE(SUM(p.monto) FILTER (WHERE p.estado = 'activo'), 0)
    INTO v_saldo_nuevo
    FROM facturacion.pagos_proveedores p
    WHERE p.cxp_id = v_cxp_id;

    UPDATE facturacion.cuentas_por_pagar
       SET saldo_pendiente = GREATEST(v_saldo_nuevo, 0),
           estado = CASE
               WHEN v_estado_actual = 'ANULADO' THEN 'ANULADO'
               WHEN v_saldo_nuevo <= 0 THEN 'PAGADO'
               WHEN v_saldo_nuevo < v_monto_original THEN 'PARCIALMENTE_PAGADO'
               ELSE 'PENDIENTE'
           END,
           updated_at = timezone('utc', now())
     WHERE id = v_cxp_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_actualizar_saldo_cxp ON facturacion.pagos_proveedores;
CREATE TRIGGER trg_actualizar_saldo_cxp
    AFTER INSERT OR DELETE OR UPDATE OF estado ON facturacion.pagos_proveedores
    FOR EACH ROW EXECUTE FUNCTION facturacion.fn_actualizar_saldo_cxp();

-- ────────────────────────────────────────────────────────────
-- 3. Recalcular de una vez los saldos existentes
--    (por si algún pago quedó "congelado" antes de este fix)
-- ────────────────────────────────────────────────────────────
UPDATE facturacion.cartera_cxc c
SET saldo = GREATEST(c.valor_original - COALESCE((
        SELECT SUM(p.valor) FROM facturacion.cartera_cxc_pagos p
        WHERE p.cartera_id = c.id AND p.estado = 'activo'
    ), 0), 0),
    estado = CASE
        WHEN c.estado = 'anulada' THEN 'anulada'
        WHEN c.valor_original - COALESCE((
            SELECT SUM(p.valor) FROM facturacion.cartera_cxc_pagos p
            WHERE p.cartera_id = c.id AND p.estado = 'activo'
        ), 0) <= 0 THEN 'pagada'
        WHEN c.valor_original - COALESCE((
            SELECT SUM(p.valor) FROM facturacion.cartera_cxc_pagos p
            WHERE p.cartera_id = c.id AND p.estado = 'activo'
        ), 0) < c.valor_original THEN 'parcial'
        ELSE 'pendiente'
    END,
    updated_at = now();

UPDATE facturacion.cuentas_por_pagar c
SET saldo_pendiente = GREATEST(c.monto_original - COALESCE((
        SELECT SUM(p.monto) FROM facturacion.pagos_proveedores p
        WHERE p.cxp_id = c.id AND p.estado = 'activo'
    ), 0), 0),
    estado = CASE
        WHEN c.estado = 'ANULADO' THEN 'ANULADO'
        WHEN c.monto_original - COALESCE((
            SELECT SUM(p.monto) FROM facturacion.pagos_proveedores p
            WHERE p.cxp_id = c.id AND p.estado = 'activo'
        ), 0) <= 0 THEN 'PAGADO'
        WHEN c.monto_original - COALESCE((
            SELECT SUM(p.monto) FROM facturacion.pagos_proveedores p
            WHERE p.cxp_id = c.id AND p.estado = 'activo'
        ), 0) < c.monto_original THEN 'PARCIALMENTE_PAGADO'
        ELSE 'PENDIENTE'
    END,
    updated_at = timezone('utc', now());
