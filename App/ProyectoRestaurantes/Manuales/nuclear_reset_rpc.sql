-- RPC PARA RESETEO TRANSACCIONAL DE UNA EMPRESA
-- BORRA TODO EL MOVIMIENTO (PRUEBAS) PERO DEJA MAESTROS (PRODUCTOS, CLIENTES, ETC)
CREATE OR REPLACE FUNCTION public.reset_empresa_transaccional(p_empresa_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Borrar Comprobantes (Invoices) y sus detalles/pagos
    -- Los detalles y pagos suelen tener FK con ON DELETE CASCADE, pero lo hacemos manual por seguridad
    DELETE FROM public.comprobante_pagos WHERE comprobante_id IN (SELECT id FROM public.comprobantes WHERE empresa_id = p_empresa_id);
    DELETE FROM public.comprobante_detalles WHERE comprobante_id IN (SELECT id FROM public.comprobantes WHERE empresa_id = p_empresa_id);
    DELETE FROM public.comprobantes WHERE empresa_id = p_empresa_id;

    -- 2. Borrar Pedidos (Orders) y sus detalles
    DELETE FROM public.pedido_detalles WHERE pedido_id IN (SELECT id FROM public.pedidos WHERE empresa_id = p_empresa_id);
    DELETE FROM public.pedidos WHERE empresa_id = p_empresa_id;

    -- 3. Borrar Kardex (Movimientos de Inventario)
    DELETE FROM public.kardex WHERE empresa_id = p_empresa_id;

    -- 4. Borrar Ingresos de Stock y detalles
    DELETE FROM public.detalle_ingresos_stock WHERE ingreso_id IN (SELECT id FROM public.ingresos_stock WHERE empresa_id = p_empresa_id);
    DELETE FROM public.ingresos_stock WHERE empresa_id = p_empresa_id;

    -- 5. Borrar Reservas
    DELETE FROM public.reservas WHERE empresa_id = p_empresa_id;

    -- 6. Borrar Sesiones de Caja
    DELETE FROM public.caja_sesiones WHERE empresa_id = p_empresa_id;

    -- 7. Resetear Maestros
    -- Resetear Stock y Costos en Productos
    UPDATE public.productos 
    SET stock = 0, costo_promedio = 0 
    WHERE empresa_id = p_empresa_id;

    -- Resetear Estado de Mesas
    UPDATE public.mesas 
    SET estado = 'libre' 
    WHERE empresa_id = p_empresa_id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Reseteo completo para la empresa. Datos transaccionales eliminados.'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false, 
        'error', SQLERRM
    );
END;
$$;

-- Refrescar permisos para el rol autenticado
GRANT EXECUTE ON FUNCTION public.reset_empresa_transaccional(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_empresa_transaccional(UUID) TO service_role;
NOTIFY pgrst, 'reload schema';
