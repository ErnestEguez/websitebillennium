-- ============================================================
-- REVERSA DE PAGOS — CxC y CxP
-- Permite "deshacer" un abono sin borrar filas: marca el pago
-- como 'reversado', anula el asiento contable vinculado y el
-- trigger recalcula el saldo de la deuda automáticamente.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. cartera_cxc_pagos (CxC) — columnas de reversa + trazabilidad
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturacion.cartera_cxc_pagos
    ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activo'
        CHECK (estado IN ('activo','reversado')),
    ADD COLUMN IF NOT EXISTS lp_comprobante_id UUID,
    ADD COLUMN IF NOT EXISTS reversado_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reversado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS motivo_reversa TEXT;

-- ────────────────────────────────────────────────────────────
-- 2. pagos_proveedores (CxP) — mismas columnas, mismo patrón
--    (sin UI/servicio de reversa todavía, pero esquema listo)
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturacion.pagos_proveedores
    ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activo'
        CHECK (estado IN ('activo','reversado')),
    ADD COLUMN IF NOT EXISTS lp_comprobante_id UUID,
    ADD COLUMN IF NOT EXISTS reversado_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reversado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS motivo_reversa TEXT;

-- ────────────────────────────────────────────────────────────
-- 3. fn_actualizar_saldo_cxc — excluir pagos reversados,
--    preservar 'anulada', disparar también en UPDATE OF estado
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION facturacion.fn_actualizar_saldo_cxc()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = facturacion AS $$
DECLARE
    v_saldo DECIMAL(12,2);
    v_estado_actual TEXT;
    v_valor_original DECIMAL(12,2);
BEGIN
    SELECT c.estado, c.valor_original
    INTO v_estado_actual, v_valor_original
    FROM facturacion.cartera_cxc c
    WHERE c.id = NEW.cartera_id;

    SELECT v_valor_original - COALESCE(SUM(p.valor) FILTER (WHERE p.estado = 'activo'), 0)
    INTO v_saldo
    FROM facturacion.cartera_cxc_pagos p
    WHERE p.cartera_id = NEW.cartera_id;

    UPDATE facturacion.cartera_cxc
    SET saldo = GREATEST(v_saldo, 0),
        estado = CASE
            WHEN v_estado_actual = 'anulada' THEN 'anulada'
            WHEN v_saldo <= 0 THEN 'pagada'
            WHEN v_saldo < v_valor_original THEN 'parcial'
            ELSE 'pendiente'
        END,
        updated_at = now()
    WHERE id = NEW.cartera_id;

    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_actualizar_saldo_cxc ON facturacion.cartera_cxc_pagos;
CREATE TRIGGER trg_actualizar_saldo_cxc
AFTER INSERT OR UPDATE OF estado ON facturacion.cartera_cxc_pagos
FOR EACH ROW EXECUTE FUNCTION facturacion.fn_actualizar_saldo_cxc();

-- ────────────────────────────────────────────────────────────
-- 4. fn_actualizar_saldo_cxp — mismo cambio mirror
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION facturacion.fn_actualizar_saldo_cxp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_saldo_nuevo DECIMAL(12,2);
    v_estado_actual TEXT;
    v_monto_original DECIMAL(12,2);
BEGIN
    SELECT c.estado, c.monto_original
    INTO v_estado_actual, v_monto_original
    FROM facturacion.cuentas_por_pagar c
    WHERE c.id = NEW.cxp_id;

    SELECT v_monto_original - COALESCE(SUM(p.monto) FILTER (WHERE p.estado = 'activo'), 0)
    INTO v_saldo_nuevo
    FROM facturacion.pagos_proveedores p
    WHERE p.cxp_id = NEW.cxp_id;

    UPDATE facturacion.cuentas_por_pagar
       SET saldo_pendiente = GREATEST(v_saldo_nuevo, 0),
           estado = CASE
               WHEN v_estado_actual = 'ANULADO' THEN 'ANULADO'
               WHEN v_saldo_nuevo <= 0 THEN 'PAGADO'
               WHEN v_saldo_nuevo < v_monto_original THEN 'PARCIALMENTE_PAGADO'
               ELSE 'PENDIENTE'
           END,
           updated_at = timezone('utc', now())
     WHERE id = NEW.cxp_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_actualizar_saldo_cxp ON facturacion.pagos_proveedores;
CREATE TRIGGER trg_actualizar_saldo_cxp
    AFTER INSERT OR UPDATE OF estado ON facturacion.pagos_proveedores
    FOR EACH ROW EXECUTE FUNCTION facturacion.fn_actualizar_saldo_cxp();
