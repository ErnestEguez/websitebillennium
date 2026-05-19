-- =====================================================
-- MIGRACIÓN: RPC PARA DIVIDIR CUENTA
-- Ejecutar en Supabase SQL Editor
-- =====================================================

CREATE OR REPLACE FUNCTION public.dividir_pedido(
    p_pedido_original_id UUID,
    p_nuevos_pedidos JSONB -- Array de objetos: [{ nombre_cliente: "Juan", items: [{ id: "prod_uuid", cantidad: 1, precio: 10 }] }]
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
    v_detalle_origen RECORD;
    v_nuevo_padre_id UUID;
BEGIN
    -- 1. Obtener datos del pedido original para clonar info (mesa, mesero, empresa)
    SELECT * INTO v_pedido_origen FROM public.pedidos WHERE id = p_pedido_original_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido original no encontrado';
    END IF;

    -- Si el pedido original ya es una división, mantenemos su padre, si no, él es el padre
    IF v_pedido_origen.pedido_padre_id IS NOT NULL THEN
        v_nuevo_padre_id := v_pedido_origen.pedido_padre_id;
    ELSE
        v_nuevo_padre_id := v_pedido_origen.id;
    END IF;

    -- 2. Recorrer los nuevos pedidos solicitados
    FOR v_nuevo_pedido_json IN SELECT * FROM jsonb_array_elements(p_nuevos_pedidos)
    LOOP
        v_total_nuevo_pedido := 0;

        -- Crear cabecera del nuevo pedido
        INSERT INTO public.pedidos (
            empresa_id, mesa_id, mesero_id, estado, total, 
            nombre_cliente_mesa, es_division, pedido_padre_id, created_at
        ) VALUES (
            v_pedido_origen.empresa_id,
            v_pedido_origen.mesa_id,
            v_pedido_origen.mesero_id,
            'pendiente',
            0, -- Se calculará luego
            v_nuevo_pedido_json->>'nombre_cliente',
            TRUE,
            v_nuevo_padre_id,
            NOW()
        ) RETURNING id INTO v_nuevo_pedido_id;

        -- Procesar items para este nuevo pedido
        FOR v_item_json IN SELECT * FROM jsonb_array_elements(v_nuevo_pedido_json->'items')
        LOOP
            v_cantidad_mover := (v_item_json->>'cantidad')::DECIMAL;
            v_subtotal_item := (v_item_json->>'precio')::DECIMAL * v_cantidad_mover;
            v_total_nuevo_pedido := v_total_nuevo_pedido + v_subtotal_item;

            -- A. Insertar detalle en el nuevo pedido
            INSERT INTO public.pedido_detalles (
                pedido_id, producto_id, cantidad, precio_unitario, subtotal
            ) VALUES (
                v_nuevo_pedido_id,
                (v_item_json->>'producto_id')::UUID,
                v_cantidad_mover,
                (v_item_json->>'precio')::DECIMAL,
                v_subtotal_item
            );

            -- B. Restar del pedido original
            -- Buscar el detalle en el origen que coincida con el producto
            -- Nota: Esto asume que el producto es único en el detalle (agrupado). 
            -- Si hubiera lineas repetidas, habría que manejarlo por ID de detalle, pero simplificamos por producto_id.
            
            UPDATE public.pedido_detalles
            SET 
                cantidad = cantidad - v_cantidad_mover,
                subtotal = subtotal - ((precio_unitario) * v_cantidad_mover)
            WHERE pedido_id = p_pedido_original_id 
              AND producto_id = (v_item_json->>'producto_id')::UUID;

        END LOOP;

        -- Actualizar total del nuevo pedido
        UPDATE public.pedidos SET total = v_total_nuevo_pedido WHERE id = v_nuevo_pedido_id;

    END LOOP;

    -- 3. Limpieza del pedido original (borrar items con cantidad 0 o negativa)
    DELETE FROM public.pedido_detalles 
    WHERE pedido_id = p_pedido_original_id AND cantidad <= 0.001;

    -- 4. Recalcular total del pedido original
    UPDATE public.pedidos 
    SET total = (
        SELECT COALESCE(SUM(subtotal), 0) 
        FROM public.pedido_detalles 
        WHERE pedido_id = p_pedido_original_id
    ),
    es_division = TRUE -- Marcar el original también como parte de una división
    WHERE id = p_pedido_original_id;

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error dividiendo pedido: %', SQLERRM;
END;
$$;
