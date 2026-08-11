-- Formulario 104 — las compras quedaban en 0 porque el cálculo leía de
-- contabilidad.lp_sri_comprobantes, una tabla que solo se llena importando
-- a mano el CSV "Listado de Compras" del portal del SRI en
-- /conta/integracion/sri. Las compras reales ya existen en QuickInvoice
-- (facturacion.ingresos_stock) — no tiene sentido que dependan de un
-- import manual aparte cuando ya se cargaron en el ERP.
--
-- Cambio: compras (base gravada/cero, IVA pagado) y retenciones de IVA
-- efectuadas a proveedores ahora se calculan en vivo desde facturacion.*,
-- mismo patrón cross-schema por RUC ya usado en ventas (lp_get_facturas_qi)
-- y en lp_calcular_103. lp_sri_comprobantes deja de usarse para estos dos
-- bloques (retención sufrida en ventas, casillero 601, no se toca — sigue
-- viniendo del import de retenciones recibidas de clientes).

CREATE OR REPLACE FUNCTION contabilidad.lp_calcular_104(p_empresa_id uuid, "p_año" integer, p_mes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = contabilidad, facturacion, public
AS $function$
DECLARE
    v_fecha_desde   DATE    := make_date(p_año, p_mes, 1);
    v_fecha_hasta   DATE    := (make_date(p_año, p_mes, 1) + INTERVAL '1 month - 1 day')::DATE;

    -- Ventas (QuickInvoice)
    v_base_gravada_ventas   NUMERIC := 0;
    v_base_cero_ventas      NUMERIC := 0;
    v_iva_cobrado           NUMERIC := 0;

    -- Compras (QuickInvoice, en vivo)
    v_ruc                   TEXT;
    v_qi_empresa_id         UUID;
    v_base_gravada_compras  NUMERIC := 0;
    v_base_cero_compras     NUMERIC := 0;
    v_iva_pagado            NUMERIC := 0;

    -- Retenciones
    v_ret_sufridas          NUMERIC := 0;  -- clientes retuvieron IVA en tus ventas
    v_ret_efectuadas        NUMERIC := 0;  -- tú retuviste IVA en compras (AIR)

    -- Saldo período anterior
    v_saldo_anterior        NUMERIC := 0;

    -- Calculados
    v_credito_tributario    NUMERIC := 0;
    v_iva_pagar             NUMERIC := 0;
    v_credito_sig_periodo   NUMERIC := 0;
BEGIN
    -- Verificar que el usuario tiene acceso a esta empresa
    IF NOT EXISTS (
        SELECT 1 FROM contabilidad.lp_usuarios_empresa
        WHERE  user_id    = auth.uid()
          AND  empresa_id = p_empresa_id
          AND  activo     = true
    ) THEN
        RAISE EXCEPTION 'Acceso denegado para empresa_id=%', p_empresa_id;
    END IF;

    -- ── VENTAS desde QuickInvoice ────────────────────────────────────────
    -- lp_get_facturas_qi ya verifica acceso y cruza por RUC
    BEGIN
        SELECT
            COALESCE(SUM(f.base_iva),   0),
            COALESCE(SUM(f.base_cero),  0),
            COALESCE(SUM(f.total_iva),  0)
        INTO v_base_gravada_ventas, v_base_cero_ventas, v_iva_cobrado
        FROM contabilidad.lp_get_facturas_qi(p_empresa_id, v_fecha_desde, v_fecha_hasta) f;
    EXCEPTION WHEN OTHERS THEN
        -- Si QI no está integrado aún, ventas quedan en 0 (no bloquea el cálculo)
        v_base_gravada_ventas := 0;
        v_base_cero_ventas    := 0;
        v_iva_cobrado         := 0;
    END;

    -- ── RETENCIONES SUFRIDAS (clientes te retuvieron IVA) ───────────────
    -- tipo='retencion' en lp_sri_comprobantes = comprobantes de retención recibidos
    SELECT COALESCE(SUM(valor_retenido), 0)
    INTO   v_ret_sufridas
    FROM   contabilidad.lp_sri_comprobantes
    WHERE  empresa_id = p_empresa_id
      AND  año        = p_año
      AND  mes        = p_mes
      AND  tipo       = 'retencion';

    -- ── COMPRAS y RETENCIONES EFECTUADAS, en vivo desde QuickInvoice ────
    BEGIN
        SELECT ruc INTO v_ruc FROM contabilidad.lp_empresas WHERE id = p_empresa_id;

        IF v_ruc IS NOT NULL AND trim(v_ruc) <> '' THEN
            SELECT id INTO v_qi_empresa_id
            FROM facturacion.empresas
            WHERE trim(ruc) = trim(v_ruc)
            LIMIT 1;
        END IF;

        IF v_qi_empresa_id IS NOT NULL THEN
            SELECT
                COALESCE(SUM(i.base_iva_5 + i.base_iva_15), 0),
                COALESCE(SUM(i.base_iva_0), 0),
                COALESCE(SUM(i.valor_iva),  0)
            INTO v_base_gravada_compras, v_base_cero_compras, v_iva_pagado
            FROM facturacion.ingresos_stock i
            WHERE i.empresa_id    = v_qi_empresa_id
              AND i.estado        = 'ACTIVO'
              AND i.fecha_emision BETWEEN v_fecha_desde AND v_fecha_hasta;

            SELECT COALESCE(SUM(rc.valor), 0)
            INTO   v_ret_efectuadas
            FROM   facturacion.retenciones_compras rc
            WHERE  rc.empresa_id    = v_qi_empresa_id
              AND  rc.tipo          = 'IVA'
              AND  rc.estado        = 'ACTIVO'
              AND  rc.fecha_emision BETWEEN v_fecha_desde AND v_fecha_hasta;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_base_gravada_compras := 0;
        v_base_cero_compras    := 0;
        v_iva_pagado           := 0;
        v_ret_efectuadas       := 0;
    END;

    -- ── SALDO PERÍODO ANTERIOR (casillero 700 de la última declaración) ──
    SELECT COALESCE(d.valor_final, 0)
    INTO   v_saldo_anterior
    FROM   contabilidad.lp_iva_104 h
    JOIN   contabilidad.lp_iva_104_detalle d
           ON d.declaracion_id = h.id AND d.casillero = '700'
    WHERE  h.empresa_id = p_empresa_id
      AND  h.estado    != 'anulado'
      AND  (h.año * 100 + h.mes) = (
               SELECT MAX(h2.año * 100 + h2.mes)
               FROM   contabilidad.lp_iva_104 h2
               WHERE  h2.empresa_id = p_empresa_id
                 AND  h2.estado    != 'anulado'
                 AND  (h2.año * 100 + h2.mes) < (p_año * 100 + p_mes)
           )
    LIMIT 1;

    -- ── LIQUIDACIÓN ──────────────────────────────────────────────────────
    -- Crédito tributario = IVA pagado en compras + saldo anterior
    v_credito_tributario  := v_iva_pagado + v_saldo_anterior;

    -- IVA a pagar = IVA cobrado − crédito tributario − retenciones sufridas
    -- Si el resultado es negativo, queda como crédito para el siguiente período
    v_iva_pagar           := GREATEST(0, v_iva_cobrado - v_credito_tributario - v_ret_sufridas);
    v_credito_sig_periodo := GREATEST(0, v_credito_tributario + v_ret_sufridas - v_iva_cobrado);

    -- ── RETORNO ───────────────────────────────────────────────────────────
    RETURN jsonb_build_object(
        -- Ventas
        '401', ROUND(v_base_gravada_ventas,  2),   -- ventas gravadas dif. 0%
        '403', ROUND(v_base_cero_ventas,     2),   -- ventas tarifa 0%
        '411', ROUND(v_iva_cobrado,          2),   -- IVA cobrado en ventas
        -- Compras / crédito
        '500', ROUND(v_base_gravada_compras, 2),   -- compras bienes/serv gravados
        '504', ROUND(v_base_cero_compras,    2),   -- compras tarifa 0%
        '510', ROUND(v_iva_pagado,           2),   -- IVA pagado en compras
        '554', ROUND(v_credito_tributario,   2),   -- crédito tributario aplicable
        -- Retenciones
        '601', ROUND(v_ret_sufridas,         2),   -- ret. IVA que clientes te hicieron
        '605', ROUND(v_ret_efectuadas,       2),   -- ret. IVA que tú efectuaste (AIR)
        -- Liquidación
        '699', ROUND(v_iva_pagar,            2),   -- IVA a pagar
        '700', ROUND(v_credito_sig_periodo,  2),   -- crédito para siguiente período
        -- Saldo
        '799', ROUND(v_saldo_anterior,       2),   -- saldo favorable período anterior
        '902', ROUND(v_iva_pagar,            2)    -- total impuesto a pagar
    );
END;
$function$;
