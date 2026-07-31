-- ============================================================
-- Borrado permanente de facturacion.historial_sesiones — SuperAdmin
--
-- historial_sesiones se diseñó deliberadamente sin política de
-- INSERT/UPDATE/DELETE para "authenticated" (ver
-- 20260730_sesion_unica_fase1.sql) para que fuera inalterable como
-- evidencia de auditoría. Por pedido explícito del usuario, se agrega
-- ahora una vía de borrado — pero controlada: solo admin_plataforma,
-- vía RPC (no policy directa de tabla), y siempre acotada a una
-- empresa puntual + rango de fechas, nunca "borrar todo".
-- ============================================================

CREATE OR REPLACE FUNCTION facturacion.borrar_historial_sesiones(
    p_empresa_id UUID,
    p_desde      TIMESTAMPTZ DEFAULT NULL,
    p_hasta      TIMESTAMPTZ DEFAULT NULL
)
RETURNS INTEGER  -- cantidad de filas borradas
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF NOT facturacion.es_admin_plataforma() THEN
        RAISE EXCEPTION 'No autorizado: solo admin_plataforma puede borrar historial de sesiones';
    END IF;

    IF p_empresa_id IS NULL THEN
        RAISE EXCEPTION 'p_empresa_id es requerido — no se permite borrar de todas las empresas a la vez';
    END IF;

    DELETE FROM facturacion.historial_sesiones
    WHERE empresa_id = p_empresa_id
      AND (p_desde IS NULL OR cerrada_en >= p_desde)
      AND (p_hasta IS NULL OR cerrada_en <= p_hasta);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION facturacion.borrar_historial_sesiones(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- ============================================================
-- Rollback (comentado)
-- ============================================================
-- DROP FUNCTION IF EXISTS facturacion.borrar_historial_sesiones(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
