-- =====================================================
-- MIGRACIÓN COMPLETA: SPLIT CHECK + IDENTIFICACION + OPTIMIZACION
-- Ejecutar TODO este script en Supabase SQL Editor
-- =====================================================

-- 1. AGREGAR COLUMNA DE IDENTIFICACIÓN (Si no existe)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pedidos' AND column_name = 'identificacion_cliente_mesa') THEN
        ALTER TABLE public.pedidos ADD COLUMN identificacion_cliente_mesa TEXT;
    END IF;
END $$;

-- 2. FUNCION PARA REVERTIR DIVISIÓ (Lógica de Reversión Parcial Segura)
CREATE OR REPLACE FUNCTION public.revertir_division_total(
    p_pedido_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pedido_target RECORD;
    v_padre_id UUID;
    v_hijo RECORD;
    v_item_hijo RECORD;
BEGIN
    -- Identificar pedido y padre
    SELECT * INTO v_pedido_target FROM public.pedidos WHERE id = p_pedido_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;

    IF v_pedido_target.pedido_padre_id IS NOT NULL THEN
        v_padre_id := v_pedido_target.pedido_padre_id;
    ELSE
        v_padre_id := v_pedido_target.id;
    END IF;

    -- Verificar que sea división
    IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = v_padre_id AND es_division = TRUE) THEN
        RAISE EXCEPTION 'Este pedido no forma parte de una división activa';
    END IF;

    -- Mover items de hijos (SOLO NO FACTURADOS) al padre
    FOR v_hijo IN SELECT * FROM public.pedidos WHERE pedido_padre_id = v_padre_id AND estado != 'facturado'
    LOOP
        FOR v_item_hijo IN SELECT * FROM public.pedido_detalles WHERE pedido_id = v_hijo.id
        LOOP
            IF EXISTS (SELECT 1 FROM public.pedido_detalles WHERE pedido_id = v_padre_id AND producto_id = v_item_hijo.producto_id) THEN
                UPDATE public.pedido_detalles
                SET cantidad = cantidad + v_item_hijo.cantidad,
                    subtotal = subtotal + v_item_hijo.subtotal
                WHERE pedido_id = v_padre_id AND producto_id = v_item_hijo.producto_id;
            ELSE
                INSERT INTO public.pedido_detalles (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
                VALUES (v_padre_id, v_item_hijo.producto_id, v_item_hijo.cantidad, v_item_hijo.precio_unitario, v_item_hijo.subtotal);
            END IF;
        END LOOP;

        -- ELIMINAR DEPENDENCIAS ANTES DE BORRAR PEDIDO
        -- Solo borramos comprobantes (los pagos se borran en cascada si están ligados a comprobantes)
        DELETE FROM public.comprobantes WHERE pedido_id = v_hijo.id;
        
        -- Safe checking for direct payments table just in case, ignoring errors
        BEGIN
            EXECUTE 'DELETE FROM public.pagos WHERE pedido_id = $1' USING v_hijo.id;
        EXCEPTION WHEN OTHERS THEN 
            NULL; -- Ignore if table/column missing
        END;

        -- BORRAR PEDIDO HIJO
        DELETE FROM public.pedidos WHERE id = v_hijo.id;
    END LOOP;

    -- Verificar si quedan hijos (facturados)
    IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE pedido_padre_id = v_padre_id) THEN
        -- Si no quedan hijos, ya no es división
        UPDATE public.pedidos 
        SET es_division = FALSE,
            estado = 'pendiente', -- Restaurar a pendiente para que sea visible
            nombre_cliente_mesa = NULL,
            identificacion_cliente_mesa = NULL
        WHERE id = v_padre_id;
    END IF;

    -- Recalcular total del padre
    UPDATE public.pedidos 
    SET total = (SELECT COALESCE(SUM(subtotal), 0) FROM public.pedido_detalles WHERE pedido_id = v_padre_id)
    WHERE id = v_padre_id;

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error: %', SQLERRM;
END;
$$;


-- 3. FUNCION MEJORADA PARA DIVIDIR (Incluye Identificación)
CREATE OR REPLACE FUNCTION public.dividir_pedido(
    p_pedido_original_id UUID,
    p_nuevos_pedidos JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pedido_origen RECORD;
    v_nuevo_pedido_json JSONB;
    v_item_json JSONB;
    v_nuevo_pedido_id UUID;
    v_total_nuevo_pedido DECIMAL(12,2);
    v_subtotal_item DECIMAL(12,2);
    v_cantidad_mover DECIMAL(12,2);
    v_nuevo_padre_id UUID;
    v_cant_disponible DECIMAL(12,2);
BEGIN
    SELECT * INTO v_pedido_origen FROM public.pedidos WHERE id = p_pedido_original_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido original no encontrado'; END IF;

    -- Definir padre
    IF v_pedido_origen.pedido_padre_id IS NOT NULL THEN
        v_nuevo_padre_id := v_pedido_origen.pedido_padre_id;
    ELSE
        v_nuevo_padre_id := v_pedido_origen.id;
    END IF;

    -- Procesar nuevos pedidos
    FOR v_nuevo_pedido_json IN SELECT * FROM jsonb_array_elements(p_nuevos_pedidos)
    LOOP
        v_total_nuevo_pedido := 0;

        INSERT INTO public.pedidos (
            empresa_id, mesa_id, mesero_id, estado, total, 
            nombre_cliente_mesa, identificacion_cliente_mesa, es_division, pedido_padre_id, created_at
        ) VALUES (
            v_pedido_origen.empresa_id, v_pedido_origen.mesa_id, v_pedido_origen.mesero_id, 'pendiente', 0,
            v_nuevo_pedido_json->>'nombre_cliente', 
            v_nuevo_pedido_json->>'identificacion_cliente', 
            TRUE, v_nuevo_padre_id, NOW()
        ) RETURNING id INTO v_nuevo_pedido_id;

        -- Procesar items
        FOR v_item_json IN SELECT * FROM jsonb_array_elements(v_nuevo_pedido_json->'items')
        LOOP
            v_cantidad_mover := (v_item_json->>'cantidad')::DECIMAL;
            v_subtotal_item := (v_item_json->>'precio')::DECIMAL * v_cantidad_mover;
            v_total_nuevo_pedido := v_total_nuevo_pedido + v_subtotal_item;

            -- VERIFICAR EXISTENCIA Y CANTIDAD EN ORIGEN ANTES DE MOVER
            SELECT cantidad INTO v_cant_disponible 
            FROM public.pedido_detalles 
            WHERE pedido_id = p_pedido_original_id AND producto_id = (v_item_json->>'producto_id')::UUID;
            
            IF v_cant_disponible IS NULL OR v_cant_disponible < v_cantidad_mover THEN
                RAISE EXCEPTION 'No hay suficiente cantidad del producto % en el pedido original (Disponible: %, Solicitado: %)', 
                    (v_item_json->>'producto_id'), COALESCE(v_cant_disponible, 0), v_cantidad_mover;
            END IF;

            -- A. Insertar en nuevo
            INSERT INTO public.pedido_detalles (
                pedido_id, producto_id, cantidad, precio_unitario, subtotal
            ) VALUES (
                v_nuevo_pedido_id, (v_item_json->>'producto_id')::UUID, v_cantidad_mover, (v_item_json->>'precio')::DECIMAL, v_subtotal_item
            );

            -- B. Restar del original (asegurando actualización correcta)
            UPDATE public.pedido_detalles
            SET cantidad = cantidad - v_cantidad_mover,
                subtotal = subtotal - ((precio_unitario) * v_cantidad_mover)
            WHERE pedido_id = p_pedido_original_id AND producto_id = (v_item_json->>'producto_id')::UUID;
            
        END LOOP;

        UPDATE public.pedidos SET total = v_total_nuevo_pedido WHERE id = v_nuevo_pedido_id;
    END LOOP;

    -- Limpieza y Recálculo final del padre
    DELETE FROM public.pedido_detalles WHERE pedido_id = p_pedido_original_id AND cantidad <= 0.001;

    UPDATE public.pedidos 
    SET total = (SELECT COALESCE(SUM(subtotal), 0) FROM public.pedido_detalles WHERE pedido_id = p_pedido_original_id),
        es_division = TRUE
    WHERE id = p_pedido_original_id;

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error dividiendo pedido: %', SQLERRM;
END;
$$;

-- 4. REFRESCAR ESQUEMA Y PERMISOS (Para solucionar timeouts de Auth)
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
NOTIFY pgrst, 'reload schema';
