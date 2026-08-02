-- ============================================================
-- ANULAR COMPRA — reversa completa (kardex, stock, CxP,
-- retenciones y contabilidad), a diferencia del código actual
-- (compraService.anular en vendorService.ts), que:
--   - inserta una fila de reversa en kardex SIN calcular
--     saldo_cantidad/saldo_costo_promedio (quedan NULL) y sin
--     tocar stock_bodega/productos.stock — el stock físico nunca
--     se revierte,
--   - nunca reversa el asiento contable (lp_comprobantes),
--   - nunca marca retenciones_compras como ANULADO (quedan
--     ACTIVO aunque la compra esté anulada),
--   - no bloquea si la CxP ya tiene pagos aplicados.
--
-- A diferencia de facturacion.fn_eliminar_compra (borrado
-- permanente), esta función es la versión NO destructiva:
-- ingresos_stock, detalle y retenciones_compras se CONSERVAN,
-- solo cambian de estado a ANULADO. Por eso el kardex tampoco se
-- borra ni se recalcula desde cero — se agrega un movimiento de
-- reversa (SALIDA) a partir del stock ACTUAL, igual que cualquier
-- otra salida (venta, ajuste), en vez de reconstruir la línea de
-- tiempo completa.
-- ============================================================

CREATE OR REPLACE FUNCTION facturacion.fn_anular_compra(p_compra_id UUID, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO facturacion, contabilidad, public
AS $$
DECLARE
    v_compra        facturacion.ingresos_stock%ROWTYPE;
    v_cxp_id        UUID;
    v_pagos_count   INT;
    v_nc_count      INT;
    v_snapshot      JSONB;
    v_lp_id         UUID;
    v_lp_estado     TEXT;
    rec             RECORD;
    v_stock_actual  NUMERIC;
    v_costo_actual  NUMERIC;
    v_nueva_cant    NUMERIC;
BEGIN
    -- 1. Cargar y validar la compra
    SELECT * INTO v_compra FROM facturacion.ingresos_stock WHERE id = p_compra_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Compra no encontrada';
    END IF;

    IF v_compra.estado <> 'ACTIVO' THEN
        RAISE EXCEPTION 'Solo se pueden anular compras activas';
    END IF;

    -- 2. Autorización: admin_plataforma, o cualquier usuario de ESA
    --    empresa (misma regla de acceso que hoy tiene ComprasPage —
    --    anular NO está restringido a admin, a diferencia de eliminar).
    IF NOT (
        facturacion.es_admin_plataforma()
        OR v_compra.empresa_id IN (SELECT facturacion.mis_empresas_ids())
    ) THEN
        RAISE EXCEPTION 'No autorizado para anular compras de esta empresa';
    END IF;

    -- 3. Bloqueos — mismo criterio que fn_eliminar_compra: si ya hay
    --    dinero de por medio, se debe reversar desde Tesorería/Egresos
    --    primero (evita un asiento contable descuadrado).
    SELECT id INTO v_cxp_id FROM facturacion.cuentas_por_pagar WHERE compra_id = p_compra_id;
    IF FOUND THEN
        SELECT COUNT(*) INTO v_pagos_count FROM facturacion.pagos_proveedores WHERE cxp_id = v_cxp_id;
        IF v_pagos_count > 0 THEN
            RAISE EXCEPTION 'No se puede anular: la cuenta por pagar tiene % pago(s) registrado(s). Reverse los pagos desde Tesorería/Egresos antes de anular esta compra.', v_pagos_count;
        END IF;
    END IF;

    SELECT COUNT(*) INTO v_nc_count FROM facturacion.notas_credito_proveedores WHERE compra_id = p_compra_id;
    IF v_nc_count > 0 THEN
        RAISE EXCEPTION 'No se puede anular: existen % nota(s) de crédito de proveedor asociada(s) a esta compra.', v_nc_count;
    END IF;

    -- 4. Marcar cabecera como ANULADA
    UPDATE facturacion.ingresos_stock
       SET estado = 'ANULADO',
           motivo_anulacion = p_motivo,
           fecha_anulacion  = CURRENT_DATE,
           anulado_por      = auth.uid()
     WHERE id = p_compra_id;

    -- 5. Si es INVENTARIO: reversar el stock con una SALIDA por
    --    producto, calculada desde el stock ACTUAL (no se toca el
    --    historial de kardex previo — solo se agrega el movimiento de
    --    reversa, igual que cualquier otra salida del sistema).
    IF v_compra.tipo_compra = 'INVENTARIO' THEN
        FOR rec IN
            SELECT d.producto_id, d.cantidad
            FROM facturacion.detalle_ingresos_stock d
            WHERE d.ingreso_id = p_compra_id
        LOOP
            IF v_compra.bodega_id IS NOT NULL THEN
                SELECT cantidad, costo_promedio INTO v_stock_actual, v_costo_actual
                FROM facturacion.stock_bodega
                WHERE bodega_id = v_compra.bodega_id AND producto_id = rec.producto_id;
            ELSE
                SELECT stock, costo_promedio INTO v_stock_actual, v_costo_actual
                FROM facturacion.productos WHERE id = rec.producto_id;
            END IF;
            v_stock_actual := COALESCE(v_stock_actual, 0);
            v_costo_actual := COALESCE(v_costo_actual, 0);

            v_nueva_cant := v_stock_actual - rec.cantidad;
            IF v_nueva_cant < 0 THEN
                RAISE EXCEPTION 'No se puede anular: el stock del producto % ya fue consumido después de esta compra (el saldo quedaría negativo)', rec.producto_id;
            END IF;

            INSERT INTO facturacion.kardex
                (empresa_id, producto_id, bodega_id, compra_id, fecha, tipo_movimiento,
                 motivo, documento_referencia, cantidad, costo_unitario,
                 saldo_cantidad, saldo_costo_promedio)
            VALUES
                (v_compra.empresa_id, rec.producto_id, v_compra.bodega_id, p_compra_id, timezone('utc', now()), 'SALIDA',
                 'Anulación compra ' || COALESCE(v_compra.numero_factura, p_compra_id::text),
                 p_compra_id::text, rec.cantidad, v_costo_actual,
                 v_nueva_cant, v_costo_actual);

            IF v_compra.bodega_id IS NOT NULL THEN
                INSERT INTO facturacion.stock_bodega (empresa_id, bodega_id, producto_id, cantidad, costo_promedio, updated_at)
                VALUES (v_compra.empresa_id, v_compra.bodega_id, rec.producto_id, v_nueva_cant, v_costo_actual, timezone('utc', now()))
                ON CONFLICT (bodega_id, producto_id) DO UPDATE
                    SET cantidad = EXCLUDED.cantidad, updated_at = EXCLUDED.updated_at;

                UPDATE facturacion.productos p
                   SET stock = (SELECT COALESCE(SUM(sb.cantidad), 0) FROM facturacion.stock_bodega sb WHERE sb.producto_id = p.id)
                 WHERE p.id = rec.producto_id;
            ELSE
                UPDATE facturacion.productos SET stock = v_nueva_cant WHERE id = rec.producto_id;
            END IF;
        END LOOP;
    END IF;

    -- 6. Anular retenciones (se conservan, solo cambian de estado)
    UPDATE facturacion.retenciones_compras
       SET estado = 'ANULADO'
     WHERE compra_id = p_compra_id;

    -- 7. Anular CxP si existe (ya se validó que no tiene pagos)
    UPDATE facturacion.cuentas_por_pagar
       SET estado = 'ANULADO', updated_at = timezone('utc', now())
     WHERE compra_id = p_compra_id;

    -- 8. Reversar el asiento contable si existe (mismo patrón que
    --    contabilidadComprasService.anularAsientoPagoProveedor).
    SELECT id, estado INTO v_lp_id, v_lp_estado
    FROM contabilidad.lp_comprobantes
    WHERE referencia_externa = p_compra_id::text AND origen = 'quickinvoice';

    IF FOUND THEN
        UPDATE contabilidad.lp_comprobantes
           SET estado = 'anulado', updated_at = timezone('utc', now())
         WHERE id = v_lp_id;

        IF v_lp_estado = 'confirmado' THEN
            PERFORM contabilidad.lp_actualizar_saldos(p_comprobante_id => v_lp_id, p_operacion => 'restar');
        END IF;
    END IF;

    -- 9. Snapshot para auditoría
    SELECT jsonb_build_object(
        'compra',        to_jsonb(v_compra),
        'motivo',        p_motivo,
        'anulado_por',   auth.uid(),
        'anulado_en',    timezone('utc', now()),
        'lp_comprobante_id',  v_lp_id,
        'lp_estado_previo',   v_lp_estado
    ) INTO v_snapshot;

    RETURN v_snapshot;
END;
$$;

GRANT EXECUTE ON FUNCTION facturacion.fn_anular_compra(UUID, TEXT) TO authenticated;

-- ============================================================
-- Verificación
-- ============================================================
-- SELECT facturacion.fn_anular_compra('<COMPRA_ID>', 'Motivo de prueba');

-- ============================================================
-- Rollback (comentado)
-- ============================================================
-- DROP FUNCTION IF EXISTS facturacion.fn_anular_compra(UUID, TEXT);
