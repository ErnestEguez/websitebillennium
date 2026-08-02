-- ============================================================
-- ELIMINAR COMPRA — borrado permanente con reversa completa
--
-- Hoy solo existe compraService.anular() (soft-void), que tiene bugs
-- reales: revierte el kardex con saldo_cantidad/saldo_costo_promedio
-- en NULL (nunca toca stock_bodega/productos.stock), nunca reversa el
-- asiento contable, y nunca anula las retenciones_compras.
--
-- Esta migración agrega una función SECURITY DEFINER que hace el
-- borrado real (ingresos_stock + cascada: detalle_ingresos_stock,
-- detalle_servicios, retenciones_compras) y además:
--   - recalcula el saldo corrido de kardex de los productos afectados
--     (reproduce la fórmula de costo promedio ponderado de
--     kardexService.registrarMovimiento) y sincroniza
--     stock_bodega/productos,
--   - bloquea si la CxP ya tiene pagos aplicados (se debe reversar el
--     pago primero desde Tesorería/Egresos) o si existe una nota de
--     crédito de proveedor asociada,
--   - reversa el asiento contable (contabilidad.lp_comprobantes) si
--     existe, mismo patrón que
--     contabilidadComprasService.anularAsientoPagoProveedor,
--   - valida permisos (admin_plataforma o admin de la empresa dueña
--     de la compra) y devuelve un snapshot en JSONB para que el
--     cliente registre el evento de auditoría (auditService.logEvent).
--
-- Todo ocurre en una sola transacción: si el stock de algún producto
-- ya fue consumido después de esta compra (el saldo quedaría
-- negativo), se aborta con RAISE EXCEPTION y no se borra nada.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. kardex.compra_id — enlace confiable compra → movimientos.
--    kardex hoy no tiene FK a ingresos_stock, solo documento_referencia
--    TEXT (numero_factura ?? compra.id, no necesariamente único) y
--    motivo TEXT. Columna nueva, nullable, aditiva.
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturacion.kardex
    ADD COLUMN IF NOT EXISTS compra_id UUID REFERENCES facturacion.ingresos_stock(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_kardex_compra ON facturacion.kardex(compra_id) WHERE compra_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. Función principal
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION facturacion.fn_eliminar_compra(p_compra_id UUID, p_motivo TEXT)
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
    k               RECORD;
    v_kardex_ids    UUID[];
    v_saldo_cant    NUMERIC;
    v_saldo_costo   NUMERIC;
BEGIN
    -- 1. Cargar y validar la compra
    SELECT * INTO v_compra FROM facturacion.ingresos_stock WHERE id = p_compra_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Compra no encontrada';
    END IF;

    -- 2. Autorización: admin_plataforma, o admin de ESA empresa
    IF NOT (
        facturacion.es_admin_plataforma()
        OR (facturacion.es_admin_empresa() AND v_compra.empresa_id IN (SELECT facturacion.mis_empresas_ids()))
    ) THEN
        RAISE EXCEPTION 'No autorizado para eliminar compras de esta empresa';
    END IF;

    -- 3. Bloqueos — abortan antes de tocar nada
    SELECT id INTO v_cxp_id FROM facturacion.cuentas_por_pagar WHERE compra_id = p_compra_id;
    IF FOUND THEN
        SELECT COUNT(*) INTO v_pagos_count FROM facturacion.pagos_proveedores WHERE cxp_id = v_cxp_id;
        IF v_pagos_count > 0 THEN
            RAISE EXCEPTION 'No se puede eliminar: la cuenta por pagar tiene % pago(s) registrado(s). Reverse los pagos desde Tesorería/Egresos antes de eliminar esta compra.', v_pagos_count;
        END IF;
    END IF;

    SELECT COUNT(*) INTO v_nc_count FROM facturacion.notas_credito_proveedores WHERE compra_id = p_compra_id;
    IF v_nc_count > 0 THEN
        RAISE EXCEPTION 'No se puede eliminar: existen % nota(s) de crédito de proveedor asociada(s) a esta compra.', v_nc_count;
    END IF;

    -- 4. Snapshot para auditoría (antes de borrar nada)
    SELECT jsonb_build_object(
        'compra',             to_jsonb(v_compra),
        'detalle_inventario', COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM facturacion.detalle_ingresos_stock d WHERE d.ingreso_id = p_compra_id), '[]'::jsonb),
        'detalle_servicios',  COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM facturacion.detalle_servicios s WHERE s.compra_id = p_compra_id), '[]'::jsonb),
        'retenciones',        COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM facturacion.retenciones_compras r WHERE r.compra_id = p_compra_id), '[]'::jsonb),
        'cxp',                (SELECT to_jsonb(c) FROM facturacion.cuentas_por_pagar c WHERE c.compra_id = p_compra_id),
        'motivo',             p_motivo,
        'eliminado_por',      auth.uid(),
        'eliminado_en',       timezone('utc', now())
    ) INTO v_snapshot;

    -- 5. Si es compra de INVENTARIO: recalcular saldo corrido de kardex
    --    por cada producto afectado, ANTES de borrar la cabecera (se
    --    necesita detalle_ingresos_stock, que cascadea con ingresos_stock).
    IF v_compra.tipo_compra = 'INVENTARIO' THEN
        FOR rec IN
            SELECT DISTINCT d.producto_id
            FROM facturacion.detalle_ingresos_stock d
            WHERE d.ingreso_id = p_compra_id
        LOOP
            -- Filas de kardex de ESTA compra para este producto: por
            -- compra_id (confiable, compras nuevas) o por el match de
            -- respaldo (compras históricas sin compra_id poblado).
            SELECT array_agg(id) INTO v_kardex_ids
            FROM facturacion.kardex
            WHERE producto_id = rec.producto_id
              AND empresa_id  = v_compra.empresa_id
              AND (
                    compra_id = p_compra_id
                 OR (
                        compra_id IS NULL
                    AND bodega_id IS NOT DISTINCT FROM v_compra.bodega_id
                    AND tipo_movimiento = 'ENTRADA'
                    AND motivo = 'Compra inventario'
                    AND documento_referencia = COALESCE(v_compra.numero_factura, v_compra.id::text)
                    AND fecha = v_compra.fecha_ingreso
                    )
              );

            IF v_kardex_ids IS NULL OR array_length(v_kardex_ids, 1) = 0 THEN
                CONTINUE;
            END IF;

            -- Reconstruir la línea de tiempo de kardex restante (sin las
            -- filas de esta compra), recalculando saldo_cantidad y
            -- saldo_costo_promedio con la misma fórmula que
            -- kardexService.registrarMovimiento.
            v_saldo_cant  := 0;
            v_saldo_costo := 0;

            FOR k IN
                SELECT id, tipo_movimiento, cantidad, costo_unitario
                FROM facturacion.kardex
                WHERE producto_id = rec.producto_id
                  AND empresa_id  = v_compra.empresa_id
                  AND bodega_id IS NOT DISTINCT FROM v_compra.bodega_id
                  AND id <> ALL(v_kardex_ids)
                ORDER BY fecha, created_at
            LOOP
                IF k.tipo_movimiento = 'ENTRADA' THEN
                    v_saldo_costo := CASE WHEN (v_saldo_cant + k.cantidad) > 0
                        THEN ((v_saldo_cant * v_saldo_costo) + (k.cantidad * COALESCE(k.costo_unitario, 0))) / (v_saldo_cant + k.cantidad)
                        ELSE COALESCE(k.costo_unitario, 0)
                    END;
                    v_saldo_cant := v_saldo_cant + k.cantidad;
                ELSE
                    v_saldo_cant := v_saldo_cant - k.cantidad;
                END IF;

                IF v_saldo_cant < 0 THEN
                    RAISE EXCEPTION 'No se puede eliminar: el stock del producto % ya fue consumido después de esta compra (el saldo quedaría negativo)', rec.producto_id;
                END IF;

                UPDATE facturacion.kardex
                   SET saldo_cantidad = v_saldo_cant, saldo_costo_promedio = v_saldo_costo
                 WHERE id = k.id;
            END LOOP;

            -- Sincronizar stock_bodega/productos con el último saldo de
            -- la línea de tiempo recalculada (mismo patrón que
            -- facturacion.fn_recalcular_stock_bodega).
            IF v_compra.bodega_id IS NOT NULL THEN
                INSERT INTO facturacion.stock_bodega (empresa_id, bodega_id, producto_id, cantidad, costo_promedio, updated_at)
                VALUES (v_compra.empresa_id, v_compra.bodega_id, rec.producto_id, v_saldo_cant, v_saldo_costo, timezone('utc', now()))
                ON CONFLICT (bodega_id, producto_id) DO UPDATE
                    SET cantidad = EXCLUDED.cantidad, costo_promedio = EXCLUDED.costo_promedio, updated_at = EXCLUDED.updated_at;

                UPDATE facturacion.productos p
                   SET stock = (SELECT COALESCE(SUM(sb.cantidad), 0) FROM facturacion.stock_bodega sb WHERE sb.producto_id = p.id),
                       costo_promedio = v_saldo_costo
                 WHERE p.id = rec.producto_id;
            ELSE
                UPDATE facturacion.productos
                   SET stock = v_saldo_cant, costo_promedio = v_saldo_costo
                 WHERE id = rec.producto_id;
            END IF;

            -- Borrar las filas de kardex de esta compra
            DELETE FROM facturacion.kardex WHERE id = ANY(v_kardex_ids);
        END LOOP;
    END IF;

    -- 6. Borrar la CxP si existe (ya se validó que no tiene pagos).
    --    Debe hacerse ANTES de borrar ingresos_stock: cuentas_por_pagar.compra_id
    --    es ON DELETE RESTRICT.
    DELETE FROM facturacion.cuentas_por_pagar WHERE compra_id = p_compra_id;

    -- 7. Borrar la cabecera — cascada automática de detalle_ingresos_stock,
    --    detalle_servicios y retenciones_compras (ON DELETE CASCADE).
    DELETE FROM facturacion.ingresos_stock WHERE id = p_compra_id;

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

        v_snapshot := v_snapshot || jsonb_build_object('lp_comprobante_id', v_lp_id, 'lp_estado_previo', v_lp_estado);
    END IF;

    RETURN v_snapshot;
END;
$$;

GRANT EXECUTE ON FUNCTION facturacion.fn_eliminar_compra(UUID, TEXT) TO authenticated;

-- ============================================================
-- Verificación
-- ============================================================
-- SELECT facturacion.fn_eliminar_compra('<COMPRA_ID>', 'Prueba de retenciones — corrección de datos');
-- (con un usuario admin_plataforma o admin de la empresa dueña de la compra)

-- ============================================================
-- Rollback (comentado)
-- ============================================================
-- DROP FUNCTION IF EXISTS facturacion.fn_eliminar_compra(UUID, TEXT);
-- ALTER TABLE facturacion.kardex DROP COLUMN IF EXISTS compra_id;
