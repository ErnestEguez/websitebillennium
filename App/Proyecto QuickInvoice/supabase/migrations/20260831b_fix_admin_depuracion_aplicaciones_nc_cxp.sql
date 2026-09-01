-- ═══════════════════════════════════════════════════════════════════════════
-- Depuración de Datos — segunda ronda de tablas faltantes (detectadas en
-- retest real contra Laura Escandón, 2026-08-31).
--
-- El fix anterior (20260831_fix_admin_depuracion_tablas_faltantes.sql) cubrió
-- guías, N/C y N/D proveedores, retenciones de clientes, facturación en
-- vivo, plan acumulativo y talla/color. Quedaron 4 bloqueos nuevos, todos
-- por FK sin CASCADE (ninguno tenía ON DELETE explícito o era RESTRICT):
--
--   1. facturacion.aplicaciones_nc_cxc.cartera_cxc_id → cartera_cxc(id)
--      (sin ON DELETE = NO ACTION). Bloqueaba borrar cartera_cxc en los
--      grupos 'facturas', 'cartera' y 'clientes'.
--   2. facturacion.cartera_cxc_pagos.nota_credito_id → notas_credito(id)
--      (sin ON DELETE). Bloqueaba borrar notas_credito en el grupo standalone
--      'notas_credito' (en 'facturas' ya no pasa porque ese grupo borra TODO
--      cartera_cxc_pagos de la empresa antes de llegar a notas_credito).
--   3. facturacion.pagos_proveedores.cxp_id → cuentas_por_pagar(id)
--      ON DELETE RESTRICT (explícito). Bloqueaba borrar cuentas_por_pagar en
--      el grupo 'compras'.
--   4. facturacion.preparacion_insumos.producto_id → productos(id)
--      (sin ON DELETE). Distinto de su otra FK preparacion_id→preparaciones_
--      pintura, que sí tiene CASCADE. Bloqueaba borrar productos en el grupo
--      MAESTRO 'productos'.
--
-- aplicaciones_nc_cxc.nota_credito_id → notas_credito(id) sí tiene CASCADE,
-- por eso no hace falta borrarla aparte al limpiar notas_credito.
--
-- Segundo retest (mismo día): 'Pagos a Proveedores/Egresos' y 'Movimientos
-- Bancarios' fallaban con "relation does not exist". Causa real: Tesorería
-- (el antiguo Finance Suite, ya fusionado a QuickInvoice/Corina ERP) vive en
-- el schema `finance`, NO en `facturacion` — egreso_anticipos,
-- egreso_pagos_cxp, comprobantes_egreso, anticipos_proveedores,
-- conciliaciones, conciliacion_lineas, movimientos_bancarios y cheques son
-- todas tablas de `finance`. El admin_depurar_grupo original (04-07) las
-- escribió con el prefijo `facturacion.` por error y nunca se probó contra
-- una empresa con datos de Tesorería hasta ahora. cuentas_por_pagar y
-- pagos_proveedores sí son de `facturacion` (ahí vive el dato real de CxP;
-- Tesorería solo las consulta/referencia) y no se tocan.
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
        DELETE FROM facturacion.aplicaciones_nc_cxc  WHERE cartera_cxc_id IN (SELECT id FROM facturacion.cartera_cxc WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta);
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
        DELETE FROM facturacion.cartera_cxc_pagos WHERE nota_credito_id IN (SELECT id FROM facturacion.notas_credito WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta);
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
        DELETE FROM facturacion.pagos_proveedores   WHERE cxp_id IN (SELECT id FROM facturacion.cuentas_por_pagar WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta);
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
        DELETE FROM facturacion.aplicaciones_nc_cxc    WHERE cartera_cxc_id IN (SELECT id FROM facturacion.cartera_cxc WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta);
        DELETE FROM facturacion.cartera_cxc            WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'pagos_prov' THEN
        -- Tesorería (Finance Suite fusionado) vive en el schema `finance`,
        -- no en `facturacion` — estas 4 tablas nunca existieron con ese
        -- nombre y por eso el DELETE fallaba con "relation does not exist"
        -- en cuanto la empresa tenía datos de Tesorería.
        DELETE FROM finance.egreso_anticipos WHERE egreso_id IN (SELECT id FROM finance.comprobantes_egreso WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta);
        DELETE FROM finance.egreso_pagos_cxp WHERE egreso_id IN (SELECT id FROM finance.comprobantes_egreso WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta);
        DELETE FROM finance.comprobantes_egreso     WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        DELETE FROM facturacion.pagos_proveedores   WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        DELETE FROM finance.anticipos_proveedores   WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        GET DIAGNOSTICS v_count = ROW_COUNT;

    WHEN 'mov_bancarios' THEN
        -- Mismo caso: tablas de Tesorería en schema `finance`, no `facturacion`.
        DELETE FROM finance.conciliacion_lineas  WHERE empresa_id = p_empresa_id;
        DELETE FROM finance.conciliaciones       WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        DELETE FROM finance.movimientos_bancarios WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
        DELETE FROM finance.cheques              WHERE empresa_id = p_empresa_id AND created_at BETWEEN v_desde AND v_hasta;
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
        DELETE FROM facturacion.preparacion_insumos WHERE producto_id IN (SELECT id FROM facturacion.productos WHERE empresa_id = p_empresa_id);
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
        DELETE FROM facturacion.aplicaciones_nc_cxc WHERE cartera_cxc_id IN (SELECT id FROM facturacion.cartera_cxc WHERE empresa_id = p_empresa_id);
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
