-- Formulario 104, casillero 601 (retención de IVA que los CLIENTES te
-- hicieron en tus ventas) dejaba de depender del import manual CSV
-- (contabilidad.lp_sri_comprobantes tipo='retencion') y pasa a calcularse en
-- vivo desde facturacion.retenciones_ventas (retenciones capturadas al
-- facturar, después vía Cartera CxC, o registradas manualmente contra una
-- factura ya pagada) + facturacion.retenciones_tarjeta_banco (retenciones
-- de IVA que aplican los bancos sobre consumos con tarjeta, vía RECAP, sin
-- factura asociada — solo suman acá, nunca en el ATS).
--
-- Mismo patrón cross-schema por RUC que ya usa el casillero 605 (retención
-- que la propia empresa efectuó a sus proveedores, facturacion.
-- retenciones_compras) en 20260811_fix_lp_calcular_104_compras_vivo.sql —
-- se adelanta la resolución de v_qi_empresa_id para poder usarla también en
-- el bloque de retenciones sufridas. Resto de la función intacto.

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

    -- ── Resolver empresa QuickInvoice equivalente por RUC (se usa tanto
    --    para retenciones sufridas en ventas como para compras/AIR) ──────
    BEGIN
        SELECT ruc INTO v_ruc FROM contabilidad.lp_empresas WHERE id = p_empresa_id;

        IF v_ruc IS NOT NULL AND trim(v_ruc) <> '' THEN
            SELECT id INTO v_qi_empresa_id
            FROM facturacion.empresas
            WHERE trim(ruc) = trim(v_ruc)
            LIMIT 1;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_qi_empresa_id := NULL;
    END;

    -- ── RETENCIONES SUFRIDAS (clientes te retuvieron IVA en tus ventas) ──
    -- En vivo: facturacion.retenciones_ventas (al facturar + posteriores +
    -- cartera) + facturacion.retenciones_tarjeta_banco (RECAP banco, sin
    -- factura, solo 104 nunca ATS).
    IF v_qi_empresa_id IS NOT NULL THEN
        BEGIN
            SELECT COALESCE(SUM(rv.valor), 0)
            INTO   v_ret_sufridas
            FROM   facturacion.retenciones_ventas rv
            WHERE  rv.empresa_id    = v_qi_empresa_id
              AND  rv.tipo          = 'IVA'
              AND  rv.estado        = 'ACTIVO'
              AND  rv.fecha_emision BETWEEN v_fecha_desde AND v_fecha_hasta;

            v_ret_sufridas := v_ret_sufridas + (
                SELECT COALESCE(SUM(rt.valor), 0)
                FROM   facturacion.retenciones_tarjeta_banco rt
                WHERE  rt.empresa_id = v_qi_empresa_id
                  AND  rt.estado     = 'ACTIVO'
                  AND  rt.fecha      BETWEEN v_fecha_desde AND v_fecha_hasta
            );
        EXCEPTION WHEN OTHERS THEN
            v_ret_sufridas := 0;
        END;
    END IF;

    -- ── COMPRAS y RETENCIONES EFECTUADAS, en vivo desde QuickInvoice ────
    BEGIN
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
