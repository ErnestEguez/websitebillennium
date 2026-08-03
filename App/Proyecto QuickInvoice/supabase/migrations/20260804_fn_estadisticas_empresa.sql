-- ============================================================
-- Estadísticas por empresa — RPC en vez de queries directas
--
-- EstadisticasEmpresaPage.tsx consultaba facturacion.comprobantes
-- directo con el cliente normal (sujeto a RLS). La policy de esa tabla
-- (20260623_fix_rls_barrido_general.sql) solo deja ver
-- empresa_id IN (mis_empresas_ids()) — SIN excepción para
-- admin_plataforma. Un superadmin viendo una empresa cliente a la que
-- no pertenece obtenía 0 filas silenciosamente (no error), aunque sí
-- hubiera facturas autorizadas ese mes.
--
-- En vez de tocar la policy de comprobantes (tabla núcleo, usada en
-- todo el sistema), se agrega una función SECURITY DEFINER acotada
-- solo a esta pantalla — mismo patrón que fn_eliminar_compra /
-- fn_anular_compra: valida es_admin_plataforma() y hace la lectura
-- puntual bypasseando RLS solo para este caso.
-- ============================================================

CREATE OR REPLACE FUNCTION facturacion.fn_estadisticas_empresa(
    p_empresa_id UUID,
    p_desde      TIMESTAMPTZ,
    p_hasta      TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO facturacion
AS $$
DECLARE
    v_facturas_emitidas INT;
    v_total_facturado   NUMERIC;
    v_consumo_ia        JSONB;
BEGIN
    IF NOT facturacion.es_admin_plataforma() THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    SELECT COUNT(*), COALESCE(SUM(total), 0)
      INTO v_facturas_emitidas, v_total_facturado
      FROM facturacion.comprobantes
     WHERE empresa_id = p_empresa_id
       AND tipo_comprobante = 'FACTURA'
       AND estado_sri = 'AUTORIZADO'
       AND created_at >= p_desde AND created_at < p_hasta;

    SELECT COALESCE(jsonb_object_agg(origen, cnt), '{}'::jsonb) INTO v_consumo_ia
    FROM (
        SELECT origen, COUNT(*) AS cnt
        FROM facturacion.consumo_ia
        WHERE empresa_id = p_empresa_id
          AND exitoso = true
          AND created_at >= p_desde AND created_at < p_hasta
        GROUP BY origen
    ) t;

    RETURN jsonb_build_object(
        'facturas_emitidas', v_facturas_emitidas,
        'total_facturado',   v_total_facturado,
        'consumo_ia',        v_consumo_ia
    );
END;
$$;

GRANT EXECUTE ON FUNCTION facturacion.fn_estadisticas_empresa(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- ============================================================
-- Verificación
-- ============================================================
-- SELECT facturacion.fn_estadisticas_empresa('<EMPRESA_ID>', '2026-08-01', '2026-09-01');
