-- ═══════════════════════════════════════════════════════════════════════════
-- Depuración de Datos — cubre tablas agregadas DESPUÉS del script original
-- (20260704_admin_depuracion.sql)
--
-- La función admin_depurar_grupo se escribió el 4 de julio. Desde entonces
-- se agregaron varios módulos con FK hacia comprobantes/ingresos_stock/
-- clientes/proveedores que la función nunca llegó a cubrir:
--   - guias_remision            (07-07) → comprobante_id, cliente_id
--   - preparaciones_pintura     (07-09) → comprobante_id
--   - notas_credito_proveedores (07-23) → compra_id, proveedor_id (RESTRICT)
--   - retenciones_ventas        (07-31) → cliente_id
--   - nd_proveedores            (08-09) → compra_id, proveedor_id
--   - facturas_en_vivo          (08-24) → comprobante_id, cliente_id
--   - ventas_pa / ventas_pa_pagos (08-24) → comprobante_id, cliente_id
--   - ventas_talla_color        (08-24) → comprobante_id
--
-- Como ninguna de estas tenía CASCADE (algunas ni ON DELETE explícito, que
-- en Postgres es NO ACTION — bloquea igual que RESTRICT), intentar borrar
-- 'facturas', 'compras', 'clientes' o 'proveedores' fallaba con violación
-- de llave foránea en cuanto la empresa tenía cualquier dato en estos
-- módulos más nuevos — exactamente el caso de una empresa en uso real
-- desde hace meses (ej. Laura Escandón).
--
-- Los detalles de estas tablas (guia_remision_detalles,
-- notas_credito_proveedores_detalle, ventas_pa_detalles,
-- preparacion_insumos) sí tienen CASCADE desde su padre — no hace falta
-- borrarlos aparte.
--
-- 'facturas'/'compras' respetan el filtro de fecha (igual que antes) — se
-- borra solo lo enlazado a un comprobante/compra dentro del rango. Los
-- maestros 'clientes'/'proveedores' no tienen filtro de fecha (igual que ya
-- documenta la UI), así que ahí se limpia por empresa_id directo.
-- ═══════════════════════════════════════════════════════════════════════════

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
        -- Módulos más nuevos que enlazan a un comprobante puntual (solo los
        -- que caen en el rango de fechas seleccionado)
        DELETE FROM facturacion.guias_remision    WHERE comprobante_id IN (SELECT id FROM facturacion.comprobantes WHERE empresa_id = p_empresa_id AND tipo_comprobante = 'FACTURA' AND created_at BETWEEN v_desde AND v_hasta);
        DELETE FROM facturacion.facturas_en_vivo  WHERE comprobante_id IN (SELECT id FROM facturacion.comprobantes WHERE empresa_id = p_empresa_id AND tipo_comprobante = 'FACTURA' AND created_at BETWEEN v_desde AND v_hasta);
        DELETE FROM facturacion.preparaciones_pintura WHERE comprobante_id IN (SELECT id FROM facturacion.comprobantes WHERE empresa_id = p_empresa_id AND tipo_comprobante = 'FACTURA' AND created_at BETWEEN v_desde AND v_hasta);
        DELETE FROM facturacion.ventas_talla_color WHERE comprobante_id IN (SELECT id FROM facturacion.comprobantes WHERE empresa_id = p_empresa_id AND tipo_comprobante = 'FACTURA' AND created_at BETWEEN v_desde AND v_hasta);
        DELETE FROM facturacion.ventas_pa         WHERE comprobante_id IN (SELECT id FROM facturacion.comprobantes WHERE empresa_id = p_empresa_id AND tipo_comprobante = 'FACTURA' AND created_at BETWEEN v_desde AND v_hasta);
        DELETE FROM facturacion.comprobantes         WHERE empresa_id = p_empresa_id AND tipo_comprobante = 'FACTURA' AND created_at BETWEEN v_desde AND v_hasta;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'notas_credito' THEN
        DELETE FROM facturacion.notas_credito WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'proformas' THEN
        DELETE FROM facturacion.proformas WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'compras' THEN
        -- Módulos más nuevos que enlazan a una compra puntual (solo los que
        -- caen en el rango de fechas seleccionado)
        DELETE FROM facturacion.notas_credito_proveedores WHERE compra_id IN (SELECT id FROM facturacion.ingresos_stock WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta);
        DELETE FROM facturacion.nd_proveedores            WHERE compra_id IN (SELECT id FROM facturacion.ingresos_stock WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta);
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
        -- Nunca borra el Consumidor Final (9999999999999). Sin filtro de
        -- fecha (maestro) — se limpia TODO lo de estos módulos más nuevos
        -- que quede enlazado a algún cliente de la empresa.
        DELETE FROM facturacion.guias_remision     WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.facturas_en_vivo   WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.ventas_pa_pagos    WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.ventas_pa          WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.retenciones_ventas WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.cartera_cxc WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.clientes    WHERE empresa_id = p_empresa_id AND identificacion != '9999999999999';
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'proveedores' THEN
        -- Sin filtro de fecha (maestro) — se limpia TODO lo de estos
        -- módulos más nuevos que quede enlazado a algún proveedor de la
        -- empresa, tenga o no compra vinculada.
        DELETE FROM facturacion.notas_credito_proveedores WHERE empresa_id = p_empresa_id;
        DELETE FROM facturacion.nd_proveedores            WHERE empresa_id = p_empresa_id;
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
