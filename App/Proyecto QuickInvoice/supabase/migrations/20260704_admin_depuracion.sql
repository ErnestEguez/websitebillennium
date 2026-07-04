-- ============================================================
-- Depuración de datos por empresa (solo admin_plataforma)
-- ============================================================

-- ── Función de CONTEO (previsualización antes de borrar) ─────────────────
CREATE OR REPLACE FUNCTION facturacion.admin_contar_grupo(
    p_empresa_id UUID,
    p_grupo      TEXT,
    p_desde      DATE DEFAULT NULL,
    p_hasta      DATE DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = facturacion, nominas, public
AS $$
DECLARE
    v_rol   TEXT;
    v_total INTEGER := 0;
    v_n     INTEGER;
    v_desde TIMESTAMPTZ := COALESCE(p_desde::TIMESTAMPTZ, '1900-01-01');
    v_hasta TIMESTAMPTZ := COALESCE((p_hasta + 1)::TIMESTAMPTZ, now() + INTERVAL '1 day');
BEGIN
    SELECT rol INTO v_rol FROM facturacion.profiles WHERE id = auth.uid();
    IF v_rol IS DISTINCT FROM 'admin_plataforma' THEN
        RAISE EXCEPTION 'Acceso denegado';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM facturacion.empresas WHERE id = p_empresa_id) THEN
        RAISE EXCEPTION 'Empresa no encontrada';
    END IF;

    CASE p_grupo
    WHEN 'facturas' THEN
        SELECT COUNT(*) INTO v_n FROM facturacion.comprobantes WHERE empresa_id = p_empresa_id AND tipo_comprobante = 'FACTURA' AND created_at BETWEEN v_desde AND v_hasta; v_total := v_n;
    WHEN 'notas_credito' THEN
        SELECT COUNT(*) INTO v_n FROM facturacion.notas_credito WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta; v_total := v_n;
    WHEN 'proformas' THEN
        SELECT COUNT(*) INTO v_n FROM facturacion.proformas WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta; v_total := v_n;
    WHEN 'compras' THEN
        SELECT COUNT(*) INTO v_n FROM facturacion.ingresos_stock WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta; v_total := v_n;
    WHEN 'kardex' THEN
        SELECT COUNT(*) INTO v_n FROM facturacion.kardex WHERE empresa_id = p_empresa_id AND fecha BETWEEN COALESCE(p_desde,'1900-01-01') AND COALESCE(p_hasta, CURRENT_DATE); v_total := v_n;
    WHEN 'caja' THEN
        SELECT COUNT(*) INTO v_n FROM facturacion.caja_general_cierres WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta; v_total := v_n;
    WHEN 'cartera' THEN
        SELECT COUNT(*) INTO v_n FROM facturacion.cartera_cxc WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta; v_total := v_n;
    WHEN 'pagos_prov' THEN
        SELECT COUNT(*) INTO v_n FROM facturacion.comprobantes_egreso WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta; v_total := v_n;
    WHEN 'mov_bancarios' THEN
        SELECT COUNT(*) INTO v_n FROM facturacion.movimientos_bancarios WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta; v_total := v_n;
    WHEN 'nominas' THEN
        SELECT COUNT(*) INTO v_n FROM nominas.periodos WHERE empresa_id = p_empresa_id; v_total := v_n;
    -- MAESTROS
    WHEN 'productos' THEN
        SELECT COUNT(*) INTO v_n FROM facturacion.productos WHERE empresa_id = p_empresa_id; v_total := v_n;
    WHEN 'clientes' THEN
        SELECT COUNT(*) INTO v_n FROM facturacion.clientes WHERE empresa_id = p_empresa_id AND identificacion != '9999999999999'; v_total := v_n;
    WHEN 'proveedores' THEN
        SELECT COUNT(*) INTO v_n FROM facturacion.proveedores WHERE empresa_id = p_empresa_id; v_total := v_n;
    WHEN 'empleados' THEN
        SELECT COUNT(*) INTO v_n FROM nominas.empleados WHERE empresa_id = p_empresa_id; v_total := v_n;
    WHEN 'vendedores' THEN
        SELECT COUNT(*) INTO v_n FROM facturacion.vendedores WHERE empresa_id = p_empresa_id; v_total := v_n;
    WHEN 'categorias' THEN
        SELECT COUNT(*) INTO v_n FROM facturacion.categorias WHERE empresa_id = p_empresa_id; v_total := v_n;
    ELSE v_total := 0;
    END CASE;

    RETURN v_total;
END;
$$;

-- ── Función de BORRADO real ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION facturacion.admin_depurar_grupo(
    p_empresa_id UUID,
    p_grupo      TEXT,
    p_desde      DATE DEFAULT NULL,
    p_hasta      DATE DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = facturacion, nominas, public
AS $$
DECLARE
    v_rol   TEXT;
    v_count INTEGER := 0;
    v_desde TIMESTAMPTZ := COALESCE(p_desde::TIMESTAMPTZ, '1900-01-01');
    v_hasta TIMESTAMPTZ := COALESCE((p_hasta + 1)::TIMESTAMPTZ, now() + INTERVAL '1 day');
    v_desde_d DATE := COALESCE(p_desde, '1900-01-01');
    v_hasta_d DATE := COALESCE(p_hasta, CURRENT_DATE);
BEGIN
    -- ① Verificar admin_plataforma en servidor (no se puede saltar)
    SELECT rol INTO v_rol FROM facturacion.profiles WHERE id = auth.uid();
    IF v_rol IS DISTINCT FROM 'admin_plataforma' THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol admin_plataforma';
    END IF;

    -- ② Verificar que la empresa existe
    IF NOT EXISTS (SELECT 1 FROM facturacion.empresas WHERE id = p_empresa_id) THEN
        RAISE EXCEPTION 'Empresa % no encontrada — operación cancelada', p_empresa_id;
    END IF;

    -- ③ Borrar en orden correcto (hijos antes que padres)
    CASE p_grupo

    WHEN 'facturas' THEN
        -- Gestiones y acuerdos de cartera relacionados
        DELETE FROM facturacion.cartera_gestiones    WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.cartera_acuerdo_cuotas WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.cartera_acuerdos     WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.cartera_cxc_pagos    WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.cartera_cxc          WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        DELETE FROM facturacion.notas_credito        WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        DELETE FROM facturacion.comprobantes         WHERE empresa_id = p_empresa_id AND tipo_comprobante = 'FACTURA' AND created_at BETWEEN v_desde AND v_hasta;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'notas_credito' THEN
        DELETE FROM facturacion.notas_credito WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'proformas' THEN
        DELETE FROM facturacion.proformas WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'compras' THEN
        DELETE FROM facturacion.retenciones_compras WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        DELETE FROM facturacion.cuentas_por_pagar   WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        DELETE FROM facturacion.ingresos_stock      WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'kardex' THEN
        DELETE FROM facturacion.kardex WHERE empresa_id = p_empresa_id AND fecha BETWEEN v_desde_d AND v_hasta_d;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'caja' THEN
        DELETE FROM facturacion.caja_general_movimientos WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        DELETE FROM facturacion.caja_general_depositos   WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.caja_general_cierres     WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        DELETE FROM facturacion.caja_sesiones            WHERE empresa_id = p_empresa_id AND fecha_apertura BETWEEN v_desde AND v_hasta;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'cartera' THEN
        DELETE FROM facturacion.cartera_gestiones      WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.cartera_notificaciones WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.cartera_acuerdo_cuotas WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.cartera_acuerdos       WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.cartera_cxc_pagos      WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        DELETE FROM facturacion.cartera_cxc            WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'pagos_prov' THEN
        DELETE FROM facturacion.egreso_anticipos    WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.egreso_pagos_cxp    WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.comprobantes_egreso WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        DELETE FROM facturacion.pagos_proveedores   WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        DELETE FROM facturacion.anticipos           WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'mov_bancarios' THEN
        DELETE FROM facturacion.conciliacion_lineas  WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.conciliaciones       WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        DELETE FROM facturacion.movimientos_bancarios WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        DELETE FROM facturacion.cheques              WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'nominas' THEN
        DELETE FROM nominas.rol_lineas   WHERE empresa_id = p_empresa_id;
        DELETE FROM nominas.rol_cabecera WHERE empresa_id = p_empresa_id;
        DELETE FROM nominas.periodos     WHERE empresa_id = p_empresa_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    -- ── MAESTROS (sin filtro de fecha) ───────────────────────────────────
    WHEN 'productos' THEN
        DELETE FROM facturacion.kardex       WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.stock_bodega WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.productos    WHERE empresa_id = p_empresa_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'clientes' THEN
        -- Nunca borra el Consumidor Final (9999999999999)
        DELETE FROM facturacion.cartera_cxc WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.clientes    WHERE empresa_id = p_empresa_id AND identificacion != '9999999999999';
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'proveedores' THEN
        DELETE FROM facturacion.proveedores WHERE empresa_id = p_empresa_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'empleados' THEN
        DELETE FROM nominas.rol_lineas   WHERE empresa_id = p_empresa_id;
        DELETE FROM nominas.rol_cabecera WHERE empresa_id = p_empresa_id;
        DELETE FROM nominas.empleados    WHERE empresa_id = p_empresa_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'vendedores' THEN
        DELETE FROM facturacion.vendedores WHERE empresa_id = p_empresa_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'categorias' THEN
        DELETE FROM facturacion.categorias WHERE empresa_id = p_empresa_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    ELSE
        RAISE EXCEPTION 'Grupo no válido: %', p_grupo;
    END CASE;

    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION facturacion.admin_contar_grupo  TO authenticated;
GRANT EXECUTE ON FUNCTION facturacion.admin_depurar_grupo TO authenticated;
