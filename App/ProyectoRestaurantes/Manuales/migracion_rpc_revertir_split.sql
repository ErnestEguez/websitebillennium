-- =====================================================
-- MIGRACIÓN: RPC PARA REVERTIR DIVISIÓN DE CUENTA
-- Ejecutar en Supabase SQL Editor
-- =====================================================

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
    v_total_padre DECIMAL(12,2) := 0;
BEGIN
    -- 1. Identificar el pedido padre
    SELECT * INTO v_pedido_target FROM public.pedidos WHERE id = p_pedido_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    IF v_pedido_target.pedido_padre_id IS NOT NULL THEN
        v_padre_id := v_pedido_target.pedido_padre_id;
    ELSE
        -- Si este es el padre, lo usamos
        v_padre_id := v_pedido_target.id;
    END IF;

    -- Verificar que sea una división
    IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = v_padre_id AND es_division = TRUE) THEN
        RAISE EXCEPTION 'Este pedido no forma parte de una división activa';
    END IF;

    -- 2. Recorrer todos los hijos (y el mismo padre si tuviera items, pero la logica es mover hijos -> padre)
    --    No movemos items del padre al padre. Solo de hijos al padre.
    FOR v_hijo IN SELECT * FROM public.pedidos WHERE pedido_padre_id = v_padre_id
    LOOP
        -- Procesar items del hijo
        FOR v_item_hijo IN SELECT * FROM public.pedido_detalles WHERE pedido_id = v_hijo.id
        LOOP
            -- Buscar si el item ya existe en el padre
            IF EXISTS (SELECT 1 FROM public.pedido_detalles WHERE pedido_id = v_padre_id AND producto_id = v_item_hijo.producto_id) THEN
                UPDATE public.pedido_detalles
                SET 
                    cantidad = cantidad + v_item_hijo.cantidad,
                    subtotal = subtotal + v_item_hijo.subtotal
                WHERE pedido_id = v_padre_id AND producto_id = v_item_hijo.producto_id;
            ELSE
                INSERT INTO public.pedido_detalles (
                    pedido_id, producto_id, cantidad, precio_unitario, subtotal
                ) VALUES (
                    v_padre_id,
                    v_item_hijo.producto_id,
                    v_item_hijo.cantidad,
                    v_item_hijo.precio_unitario,
                    v_item_hijo.subtotal
                );
            END IF;
        END LOOP;

        -- Borrar el pedido hijo (ON DELETE CASCADE debería borrar los detalles, pero por seguridad...)
        DELETE FROM public.pedidos WHERE id = v_hijo.id;
    END LOOP;

    -- 3. Recalcular total del padre
    UPDATE public.pedidos 
    SET total = (
        SELECT COALESCE(SUM(subtotal), 0) 
        FROM public.pedido_detalles 
        WHERE pedido_id = v_padre_id
    ),
    es_division = FALSE, -- Ya no es división
    nombre_cliente_mesa = NULL -- Resetear nombre si se quiere, o dejarlo como estaba
    WHERE id = v_padre_id;

    RETURN jsonb_build_object('success', true, 'padre_id', v_padre_id);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error revirtiendo división: %', SQLERRM;
END;
$$;
