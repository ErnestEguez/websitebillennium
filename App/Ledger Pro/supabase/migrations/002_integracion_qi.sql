-- ============================================================
-- LEDGER PRO — Función de integración QuickInvoice
-- Enlaza LP empresa con QI empresa por RUC (distintos UUIDs)
-- SECURITY DEFINER permite cruzar de conta a public
-- ============================================================

CREATE OR REPLACE FUNCTION conta.lp_get_facturas_qi(
    p_empresa_id  UUID,
    p_fecha_desde DATE,
    p_fecha_hasta DATE
)
RETURNS TABLE (
    id              UUID,
    secuencial      TEXT,
    fecha           DATE,
    cliente_nombre  TEXT,
    base_iva        NUMERIC,
    base_cero       NUMERIC,
    total_iva       NUMERIC,
    total           NUMERIC,
    pagos           JSONB,
    ya_importada    BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_qi_empresa_id UUID;
    v_lp_ruc        TEXT;
BEGIN
    -- Verificar acceso del usuario a esta empresa LP
    IF NOT EXISTS (
        SELECT 1 FROM conta.lp_usuarios_empresa
        WHERE user_id  = auth.uid()
          AND empresa_id = p_empresa_id
          AND activo   = true
    ) THEN
        RAISE EXCEPTION 'Acceso denegado para la empresa indicada';
    END IF;

    -- Obtener RUC de la empresa LP
    SELECT lpe.ruc INTO v_lp_ruc
    FROM   conta.lp_empresas lpe
    WHERE  lpe.id = p_empresa_id;

    IF v_lp_ruc IS NULL THEN
        RAISE EXCEPTION 'La empresa LP no tiene RUC configurado';
    END IF;

    -- Buscar empresa QI que tenga el mismo RUC
    SELECT emp.id INTO v_qi_empresa_id
    FROM   public.empresas emp
    WHERE  LOWER(TRIM(emp.ruc)) = LOWER(TRIM(v_lp_ruc));

    IF v_qi_empresa_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró empresa en QuickInvoice con RUC %', v_lp_ruc;
    END IF;

    -- La subconsulta "q" evita la ambigüedad entre el campo "id" de la tabla
    -- y el parámetro de salida "id" declarado en RETURNS TABLE
    RETURN QUERY
    SELECT
        q.comp_id,
        q.comp_sec,
        q.comp_fecha,
        q.comp_cliente,
        q.comp_base_iva,
        q.comp_base_cero,
        q.comp_total_iva,
        q.comp_total,
        q.comp_pagos,
        q.comp_ya_importada
    FROM (
        SELECT
            comp.id                                                AS comp_id,
            comp.secuencial::TEXT                                  AS comp_sec,
            comp.created_at::DATE                                  AS comp_fecha,
            COALESCE(cli.nombre, 'Sin nombre')                     AS comp_cliente,

            COALESCE((
                SELECT SUM(det.subtotal)
                FROM   public.comprobante_detalles det
                WHERE  det.comprobante_id = comp.id
                  AND  det.iva_porcentaje > 0
            ), 0)                                                  AS comp_base_iva,

            COALESCE((
                SELECT SUM(det.subtotal)
                FROM   public.comprobante_detalles det
                WHERE  det.comprobante_id = comp.id
                  AND  det.iva_porcentaje = 0
            ), 0)                                                  AS comp_base_cero,

            COALESCE((
                SELECT SUM(det.iva_valor)
                FROM   public.comprobante_detalles det
                WHERE  det.comprobante_id = comp.id
            ), 0)                                                  AS comp_total_iva,

            COALESCE((
                SELECT SUM(det.subtotal) + SUM(det.iva_valor)
                FROM   public.comprobante_detalles det
                WHERE  det.comprobante_id = comp.id
            ), 0)                                                  AS comp_total,

            COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'metodo_pago', pag.metodo_pago,
                    'valor',       pag.valor
                ))
                FROM   public.comprobante_pagos pag
                WHERE  pag.comprobante_id = comp.id
            ), '[]'::jsonb)                                        AS comp_pagos,

            EXISTS (
                SELECT 1
                FROM   conta.lp_comprobantes lc
                WHERE  lc.empresa_id         = p_empresa_id
                  AND  lc.origen             = 'quickinvoice'
                  AND  lc.referencia_externa = comp.id::TEXT
            )                                                      AS comp_ya_importada

        FROM  public.comprobantes comp
        LEFT  JOIN public.clientes cli ON cli.id = comp.cliente_id
        WHERE comp.empresa_id       = v_qi_empresa_id
          AND comp.tipo_comprobante = 'FACTURA'
          AND comp.estado_sistema   = 'VIGENTE'
          AND comp.created_at::DATE >= p_fecha_desde
          AND comp.created_at::DATE <= p_fecha_hasta
        ORDER BY comp.created_at
    ) q;
END;
$$;

GRANT EXECUTE ON FUNCTION conta.lp_get_facturas_qi TO authenticated;
