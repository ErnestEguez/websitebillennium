-- ============================================================
-- PARCHE: columnas faltantes en schema restaurantes
-- Solo agrega lo que falta. No toca otros schemas.
-- ============================================================

-- ─────────────────────────────────────────────────────────
-- 1. pedidos: columnas del split check
-- ─────────────────────────────────────────────────────────
ALTER TABLE restaurantes.pedidos
    ADD COLUMN IF NOT EXISTS identificacion_cliente_mesa TEXT,
    ADD COLUMN IF NOT EXISTS email_cliente_mesa          TEXT;

-- ─────────────────────────────────────────────────────────
-- 2. config_empresa: campos de empresa RestoFlow
-- ─────────────────────────────────────────────────────────
ALTER TABLE restaurantes.config_empresa
    ADD COLUMN IF NOT EXISTS razon_social             TEXT,
    ADD COLUMN IF NOT EXISTS habilitar_division_cuenta BOOLEAN DEFAULT FALSE;

-- ─────────────────────────────────────────────────────────
-- 3. RPC crear_pedido_completo (actualizado con nuevos parámetros)
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION restaurantes.crear_pedido_completo(
    p_mesa_id                  UUID,
    p_mesero_id                UUID,
    p_empresa_id               UUID,
    p_total                    NUMERIC,
    p_detalles                 JSONB,
    p_nombre_cliente           TEXT DEFAULT NULL,
    p_identificacion_cliente   TEXT DEFAULT NULL,
    p_email_cliente            TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = restaurantes, public
AS $$
DECLARE
    v_pedido_id UUID;
    v_det       JSONB;
BEGIN
    INSERT INTO restaurantes.pedidos (
        mesa_id, mesero_id, empresa_id, total, estado,
        nombre_cliente_mesa, identificacion_cliente_mesa, email_cliente_mesa
    )
    VALUES (
        p_mesa_id, p_mesero_id, p_empresa_id, p_total, 'pendiente',
        p_nombre_cliente, p_identificacion_cliente, p_email_cliente
    )
    RETURNING id INTO v_pedido_id;

    FOR v_det IN SELECT * FROM jsonb_array_elements(p_detalles) LOOP
        INSERT INTO restaurantes.pedido_detalles
            (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
        VALUES (
            v_pedido_id,
            (v_det->>'producto_id')::UUID,
            (v_det->>'cantidad')::NUMERIC,
            (v_det->>'precio_unitario')::NUMERIC,
            (v_det->>'subtotal')::NUMERIC
        );
    END LOOP;

    UPDATE restaurantes.mesas SET estado = 'ocupada' WHERE id = p_mesa_id;

    RETURN jsonb_build_object(
        'id', v_pedido_id, 'mesa_id', p_mesa_id,
        'empresa_id', p_empresa_id, 'estado', 'pendiente', 'total', p_total
    );
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- 4. RPC dividir_pedido (actualizado con nuevos campos)
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION restaurantes.dividir_pedido(
    p_pedido_original_id UUID,
    p_nuevos_pedidos     JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = restaurantes, public
AS $$
DECLARE
    v_origen         RECORD;
    v_nuevo_json     JSONB;
    v_item_json      JSONB;
    v_nuevo_id       UUID;
    v_total_nuevo    DECIMAL(12,2);
    v_cantidad_mover DECIMAL(12,2);
    v_padre_id       UUID;
BEGIN
    SELECT * INTO v_origen FROM restaurantes.pedidos WHERE id = p_pedido_original_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;

    v_padre_id := COALESCE(v_origen.pedido_padre_id, v_origen.id);

    FOR v_nuevo_json IN SELECT * FROM jsonb_array_elements(p_nuevos_pedidos) LOOP
        v_total_nuevo := 0;

        INSERT INTO restaurantes.pedidos (
            empresa_id, mesa_id, mesero_id, estado, total,
            nombre_cliente_mesa, identificacion_cliente_mesa, email_cliente_mesa,
            es_division, pedido_padre_id, created_at
        ) VALUES (
            v_origen.empresa_id, v_origen.mesa_id, v_origen.mesero_id,
            'pendiente', 0,
            v_nuevo_json->>'nombre_cliente',
            v_nuevo_json->>'identificacion_cliente',
            v_nuevo_json->>'email_cliente',
            TRUE, v_padre_id, NOW()
        ) RETURNING id INTO v_nuevo_id;

        FOR v_item_json IN SELECT * FROM jsonb_array_elements(v_nuevo_json->'items') LOOP
            v_cantidad_mover := (v_item_json->>'cantidad')::DECIMAL;
            v_total_nuevo    := v_total_nuevo + (v_item_json->>'precio')::DECIMAL * v_cantidad_mover;

            INSERT INTO restaurantes.pedido_detalles
                (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
            VALUES (
                v_nuevo_id,
                (v_item_json->>'producto_id')::UUID,
                v_cantidad_mover,
                (v_item_json->>'precio')::DECIMAL,
                (v_item_json->>'precio')::DECIMAL * v_cantidad_mover
            );

            UPDATE restaurantes.pedido_detalles
            SET cantidad = cantidad - v_cantidad_mover,
                subtotal = subtotal - (precio_unitario * v_cantidad_mover)
            WHERE pedido_id = p_pedido_original_id
              AND producto_id = (v_item_json->>'producto_id')::UUID;
        END LOOP;

        UPDATE restaurantes.pedidos SET total = v_total_nuevo WHERE id = v_nuevo_id;
    END LOOP;

    DELETE FROM restaurantes.pedido_detalles
    WHERE pedido_id = p_pedido_original_id AND cantidad <= 0.001;

    UPDATE restaurantes.pedidos
    SET total = (
            SELECT COALESCE(SUM(subtotal), 0)
            FROM restaurantes.pedido_detalles
            WHERE pedido_id = p_pedido_original_id
        ),
        es_division = TRUE
    WHERE id = p_pedido_original_id;

    RETURN jsonb_build_object('success', true, 'parent_id', v_padre_id);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error dividiendo pedido: %', SQLERRM;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- 5. PERMISOS NUEVAS FUNCIONES
-- ─────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION restaurantes.crear_pedido_completo(UUID,UUID,UUID,NUMERIC,JSONB,TEXT,TEXT,TEXT)
    TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION restaurantes.dividir_pedido(UUID,JSONB)
    TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
