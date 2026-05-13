CREATE OR REPLACE FUNCTION public.crear_pedido_completo(
    p_mesa_id UUID,
    p_mesero_id UUID,
    p_empresa_id UUID,
    p_total NUMERIC,
    p_detalles JSONB,
    p_nombre_cliente TEXT DEFAULT NULL,
    p_identificacion_cliente TEXT DEFAULT NULL,
    p_email_cliente TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pedido_id UUID;
    v_detalle JSONB;
    v_pedido_result JSONB;
BEGIN
    -- 1. Insertar la cabecera del pedido con los nuevos campos
    INSERT INTO pedidos (
        mesa_id, 
        mesero_id, 
        empresa_id, 
        total, 
        estado,
        nombre_cliente_mesa,
        identificacion_cliente_mesa,
        email_cliente_mesa
    )
    VALUES (
        p_mesa_id, 
        p_mesero_id, 
        p_empresa_id, 
        p_total, 
        'pendiente',
        p_nombre_cliente,
        p_identificacion_cliente,
        p_email_cliente
    )
    RETURNING id INTO v_pedido_id;

    -- 2. Insertar los detalles
    FOR v_detalle IN SELECT * FROM jsonb_array_elements(p_detalles)
    LOOP
        INSERT INTO pedido_detalles (
            pedido_id,
            producto_id,
            cantidad,
            precio_unitario,
            subtotal
        )
        VALUES (
            v_pedido_id,
            (v_detalle->>'producto_id')::UUID,
            (v_detalle->>'cantidad')::NUMERIC,
            (v_detalle->>'precio_unitario')::NUMERIC,
            (v_detalle->>'subtotal')::NUMERIC
        );
    END LOOP;

    -- 3. Actualizar el estado de la mesa
    UPDATE mesas
    SET estado = 'ocupada'
    WHERE id = p_mesa_id;

    -- 4. Devolver el pedido creado
    SELECT jsonb_build_object(
        'id', v_pedido_id,
        'mesa_id', p_mesa_id,
        'empresa_id', p_empresa_id,
        'estado', 'pendiente',
        'total', p_total
    ) INTO v_pedido_result;

    RETURN v_pedido_result;

EXCEPTION WHEN OTHERS THEN
    RAISE;
END;
$$;

-- Refrescar permisos
GRANT EXECUTE ON FUNCTION public.crear_pedido_completo(UUID, UUID, UUID, NUMERIC, JSONB, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_pedido_completo(UUID, UUID, UUID, NUMERIC, JSONB, TEXT, TEXT, TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';
