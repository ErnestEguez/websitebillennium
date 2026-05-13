-- 1. AGREGAR COLUMNA DE EMAIL A LA TABLA DE PEDIDOS
ALTER TABLE public.pedidos 
ADD COLUMN IF NOT EXISTS email_cliente_mesa TEXT;

-- 2. ACTUALIZAR RPC dividir_pedido PARA MANEJAR EL EMAIL
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
    v_nuevo_padre_id UUID;
    v_empresa_id UUID;
BEGIN
    -- Obtener datos del pedido original
    SELECT * INTO v_pedido_origen 
    FROM public.pedidos 
    WHERE id = p_pedido_original_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido original no encontrado';
    END IF;

    -- Si el pedido original es una división, el padre es el mismo padre
    -- Si es el primer split, el padre es el original
    IF v_pedido_origen.es_division THEN
        v_nuevo_padre_id := v_pedido_origen.pedido_padre_id;
    ELSE
        v_nuevo_padre_id := v_pedido_origen.id;
    END IF;

    -- Iterar sobre cada nuevo pedido solicitado
    FOR v_nuevo_pedido_json IN SELECT * FROM jsonb_array_elements(p_nuevos_pedidos)
    LOOP
        -- Crear el nuevo pedido
        INSERT INTO public.pedidos (
            empresa_id, 
            mesa_id, 
            mesero_id, 
            estado, 
            total, 
            nombre_cliente_mesa, 
            identificacion_cliente_mesa,
            email_cliente_mesa, -- Nueva columna
            es_division, 
            pedido_padre_id, 
            created_at
        ) VALUES (
            v_pedido_origen.empresa_id, 
            v_pedido_origen.mesa_id, 
            v_pedido_origen.mesero_id, 
            'pendiente', 
            0,
            v_nuevo_pedido_json->>'nombre_cliente', 
            v_nuevo_pedido_json->>'identificacion_cliente',
            v_nuevo_pedido_json->>'email_cliente', -- Nuevo campo del JSON
            TRUE, 
            v_nuevo_padre_id, 
            NOW()
        ) RETURNING id INTO v_nuevo_pedido_id;

        -- Transferir items y restar del original
        FOR v_item_json IN SELECT * FROM jsonb_array_elements(v_nuevo_pedido_json->'items')
        LOOP
            -- 1. Insertar en el nuevo pedido
            INSERT INTO public.pedido_detalles (
                pedido_id, 
                producto_id, 
                cantidad, 
                precio_unitario, 
                subtotal
            ) VALUES (
                v_nuevo_pedido_id,
                (v_item_json->>'producto_id')::UUID,
                (v_item_json->>'cantidad')::NUMERIC,
                (v_item_json->>'precio')::NUMERIC,
                (v_item_json->>'cantidad')::NUMERIC * (v_item_json->>'precio')::NUMERIC
            );

            -- 2. Restar cantidad del pedido original
            UPDATE public.pedido_detalles
            SET cantidad = cantidad - (v_item_json->>'cantidad')::NUMERIC,
                subtotal = (cantidad - (v_item_json->>'cantidad')::NUMERIC) * precio_unitario
            WHERE pedido_id = p_pedido_original_id 
              AND producto_id = (v_item_json->>'producto_id')::UUID;
        END LOOP;

        -- Actualizar el total del nuevo pedido
        UPDATE public.pedidos
        SET total = (SELECT COALESCE(SUM(subtotal), 0) FROM public.pedido_detalles WHERE pedido_id = v_nuevo_pedido_id)
        WHERE id = v_nuevo_pedido_id;
    END LOOP;

    -- Eliminar items con cantidad 0 del original
    DELETE FROM public.pedido_detalles WHERE pedido_id = p_pedido_original_id AND cantidad <= 0;

    -- Recalcular total del pedido original
    UPDATE public.pedidos
    SET total = (SELECT COALESCE(SUM(subtotal), 0) FROM public.pedido_detalles WHERE pedido_id = p_pedido_original_id)
    WHERE id = p_pedido_original_id;

    -- Si el original quedó vacío, marcarlo como cancelado para que no estorbe (opcional)
    -- UPDATE public.pedidos SET estado = 'cancelado' WHERE id = p_pedido_original_id AND total = 0;

    RETURN jsonb_build_object('success', true, 'parent_id', v_nuevo_padre_id);
END;
$$;

-- Refrescar permisos
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
NOTIFY pgrst, 'reload schema';
