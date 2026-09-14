-- ============================================================
-- Ventas a Crédito de Electrodomésticos — Cancelación Oficina
-- ============================================================
-- Decisiones confirmadas con el usuario (2026-09-09):
-- 1. Recibo INTERNO = consecutivo automático del sistema, por empresa.
--    Recibo EXTERNO = número que el cajero escribe a mano desde su
--    talonario físico pre-impreso — el sistema NO lo genera ni lo valida.
-- 2. Mora: tasa_mora_default es MENSUAL, prorrateada por día:
--    mora = saldo_pendiente_cuota × (tasa/100) × dias_vencidos_efectivos/30
--    dias_vencidos_efectivos = GREATEST(0, hoy - fecha_vencimiento - dias_gracia_mora)
-- 3. Un cobro puede repartirse entre varias cuotas (la más antigua primero),
--    con excedente cayendo en cascada a la siguiente cuota, y se permite
--    grabar aunque el valor sea menor a una cuota completa (pago parcial).
--    Orden de aplicación dentro de cada cuota: mora → interés → capital.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Contador de recibo interno — 1 por empresa (misma fila de config
--    ya creada en Fase 0), incrementado atómicamente igual que
--    qi_next_secuencial_punto (candado FOR UPDATE).
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturacion.config_credito_electrodomesticos
    ADD COLUMN IF NOT EXISTS recibo_interno_siguiente INTEGER NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION facturacion.fn_next_recibo_interno_credito(p_empresa_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = facturacion AS $$
DECLARE
    v_siguiente INTEGER;
BEGIN
    -- Garantiza que exista la fila de config (una empresa recién habilitada
    -- puede no tener fila todavía — el frontend usa defaults en memoria,
    -- pero este contador sí necesita una fila real para el candado).
    INSERT INTO facturacion.config_credito_electrodomesticos (empresa_id)
    VALUES (p_empresa_id)
    ON CONFLICT (empresa_id) DO NOTHING;

    SELECT recibo_interno_siguiente INTO v_siguiente
    FROM facturacion.config_credito_electrodomesticos
    WHERE empresa_id = p_empresa_id
    FOR UPDATE;

    UPDATE facturacion.config_credito_electrodomesticos
    SET recibo_interno_siguiente = v_siguiente + 1
    WHERE empresa_id = p_empresa_id;

    RETURN v_siguiente;
END;
$$;

GRANT EXECUTE ON FUNCTION facturacion.fn_next_recibo_interno_credito(UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. Columnas nuevas en pagos: recibo interno/externo, cuenta bancaria +
--    papeleta de depósito (cuando el cobro es por depósito), y el
--    desglose real de ESTE pago entre mora/interés/capital (para que la
--    cuota pueda sumar correctamente cuánto de cada concepto lleva
--    pagado, no solo el total).
-- ────────────────────────────────────────────────────────────
-- cuenta_bancaria_id: sin FK a propósito — cuentas_bancarias vive en el
-- proyecto/esquema de Finance (lib/supabaseFinance.ts), no en facturacion;
-- mismo criterio ya usado por comprobante_pagos.cuenta_bancaria_id.
ALTER TABLE facturacion.creditos_electrodomesticos_pagos
    ADD COLUMN IF NOT EXISTS recibo_interno      INTEGER,
    ADD COLUMN IF NOT EXISTS recibo_externo       TEXT,
    ADD COLUMN IF NOT EXISTS cuenta_bancaria_id    UUID,
    ADD COLUMN IF NOT EXISTS papeleta_deposito      TEXT,
    ADD COLUMN IF NOT EXISTS mora_aplicada           NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS interes_aplicado         NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS capital_aplicado          NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_credito_electro_pagos_recibo_interno
    ON facturacion.creditos_electrodomesticos_pagos(empresa_id, recibo_interno);

-- ────────────────────────────────────────────────────────────
-- 3. Trigger de saldo de cuota — se reemplaza para también sumar el
--    desglose mora_pagada/interes_pagado/capital_pagado desde los pagos
--    activos (antes solo sumaba total_pagado/saldo_pendiente/estado).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION facturacion.fn_actualizar_saldo_cuota_credito_electro()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = facturacion AS $$
DECLARE
    v_cuota_id      UUID := COALESCE(NEW.cuota_id, OLD.cuota_id);
    v_estado_actual TEXT;
    v_cuota_valor   NUMERIC(12,2);
    v_total_pagado  NUMERIC(12,2);
    v_mora_pagada   NUMERIC(12,2);
    v_interes_pagado NUMERIC(12,2);
    v_capital_pagado NUMERIC(12,2);
    v_saldo         NUMERIC(12,2);
BEGIN
    SELECT c.estado, c.cuota_programada
    INTO v_estado_actual, v_cuota_valor
    FROM facturacion.creditos_electrodomesticos_cuotas c
    WHERE c.id = v_cuota_id;

    SELECT
        COALESCE(SUM(p.valor)             FILTER (WHERE p.estado = 'activo'), 0),
        COALESCE(SUM(p.mora_aplicada)     FILTER (WHERE p.estado = 'activo'), 0),
        COALESCE(SUM(p.interes_aplicado)  FILTER (WHERE p.estado = 'activo'), 0),
        COALESCE(SUM(p.capital_aplicado)  FILTER (WHERE p.estado = 'activo'), 0)
    INTO v_total_pagado, v_mora_pagada, v_interes_pagado, v_capital_pagado
    FROM facturacion.creditos_electrodomesticos_pagos p
    WHERE p.cuota_id = v_cuota_id;

    -- El saldo de la cuota (para decidir PAGADA/PARCIAL) sigue siendo
    -- capital+interés programados menos lo pagado — la mora es un cargo
    -- aparte, no reduce el saldo de la cuota en sí.
    v_saldo := GREATEST(v_cuota_valor - (v_capital_pagado + v_interes_pagado), 0);

    UPDATE facturacion.creditos_electrodomesticos_cuotas
    SET total_pagado     = v_total_pagado,
        mora_pagada      = v_mora_pagada,
        interes_pagado   = v_interes_pagado,
        capital_pagado   = v_capital_pagado,
        saldo_pendiente  = v_saldo,
        fecha_ultimo_pago = CASE WHEN v_total_pagado > 0 THEN timezone('utc', now()) ELSE fecha_ultimo_pago END,
        estado = CASE
            WHEN v_estado_actual = 'ANULADA' THEN 'ANULADA'
            WHEN v_saldo <= 0 THEN 'PAGADA'
            WHEN v_total_pagado > 0 THEN 'PARCIAL'
            WHEN v_estado_actual = 'VENCIDA' THEN 'VENCIDA'
            ELSE 'PENDIENTE'
        END,
        updated_at = timezone('utc', now())
    WHERE id = v_cuota_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;
-- (el trigger ya apuntaba a esta función — CREATE OR REPLACE alcanza, no
-- hace falta recrear el trigger en sí)

-- ── Verificación sugerida después de correr esta migración ──
--   SELECT recibo_interno_siguiente FROM facturacion.config_credito_electrodomesticos LIMIT 5;
