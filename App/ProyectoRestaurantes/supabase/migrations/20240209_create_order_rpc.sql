-- Función RPC para crear un pedido completo de forma atómica
-- Esto reemplaza las 3 llamadas separadas desde el frontend y garantiza integridad de datos.

CREATE OR REPLACE FUNCTION crear_pedido_completo(
    p_mesa_id UUID,
    p_mesero_id UUID,
    p_empresa_id UUID,
    p_total NUMERIC,
    p_detalles JSONB
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
    -- 1. Insertar la cabecera del pedido
    INSERT INTO pedidos (mesa_id, mesero_id, empresa_id, total, estado)
    VALUES (p_mesa_id, p_mesero_id, p_empresa_id, p_total, 'pendiente')
    RETURNING id INTO v_pedido_id;

    -- 2. Insertar los detalles
    -- Iteramos sobre el array de JSONB
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
            (v_detalle->>'cantidad')::INTEGER,
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
    -- Si algo falla, la transacción se revierte automáticamente (ROLLBACK)
    -- pero podemos relanzar el error para que el frontend lo sepa
    RAISE;
END;
$$;
