-- ============================================================
-- Reparación de costo en stock_bodega — herramienta de SuperAdmin
--
-- Problema: la migración masiva de artículos (ImportarArticulosPage)
-- nunca grabó facturacion.stock_bodega.costo_promedio (solo
-- productos.costo_promedio), dejando esa columna en su DEFAULT 0
-- para toda fila creada por esa vía. Esto sesga a $0,00 el costo
-- mostrado en "Inventario Valorado" cuando se filtra por una bodega
-- específica (ver ValorizacionInventarioPage.tsx).
--
-- Esta función reconstruye stock_bodega.cantidad/costo_promedio desde
-- el último saldo del Kardex (que sí quedó correcto) para UNA empresa
-- puntual — no toca ninguna otra. Reemplaza (CREATE OR REPLACE) la
-- versión de referencia que solo existía como documentación en
-- Manuales/SQL_Bodegas_Estructura.sql, nunca aplicada como migración
-- real; se le agrega aquí el chequeo de rol que faltaba, ya que se
-- expone vía RPC a authenticated y debe quedar reservada a
-- admin_plataforma (herramienta de SuperAdmin, no de cada empresa).
-- ============================================================

CREATE OR REPLACE FUNCTION facturacion.fn_recalcular_stock_bodega(p_empresa_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT facturacion.es_admin_plataforma() THEN
        RAISE EXCEPTION 'No autorizado: solo admin_plataforma puede ejecutar esta reparación';
    END IF;

    -- Toma el último saldo de kardex por (bodega, producto) y lo upserta en stock_bodega
    WITH ultimo_kardex AS (
        SELECT DISTINCT ON (bodega_id, producto_id)
            empresa_id,
            bodega_id,
            producto_id,
            saldo_cantidad,
            saldo_costo_promedio
        FROM facturacion.kardex
        WHERE empresa_id = p_empresa_id
          AND bodega_id IS NOT NULL
        ORDER BY bodega_id, producto_id, fecha DESC, created_at DESC NULLS LAST
    )
    INSERT INTO facturacion.stock_bodega
        (empresa_id, bodega_id, producto_id, cantidad, costo_promedio, updated_at)
    SELECT
        empresa_id,
        bodega_id,
        producto_id,
        COALESCE(saldo_cantidad, 0),
        COALESCE(saldo_costo_promedio, 0),
        timezone('utc', now())
    FROM ultimo_kardex
    ON CONFLICT (bodega_id, producto_id) DO UPDATE
        SET cantidad       = EXCLUDED.cantidad,
            costo_promedio = EXCLUDED.costo_promedio,
            updated_at     = EXCLUDED.updated_at;

    -- Actualiza productos.stock como suma de todas las bodegas (compatibilidad)
    UPDATE facturacion.productos p
    SET stock = (
        SELECT COALESCE(SUM(sb.cantidad), 0)
        FROM facturacion.stock_bodega sb
        WHERE sb.producto_id = p.id
    )
    WHERE p.empresa_id = p_empresa_id;
END;
$$;

GRANT EXECUTE ON FUNCTION facturacion.fn_recalcular_stock_bodega(UUID) TO authenticated;

-- ============================================================
-- Verificación
-- ============================================================
-- SELECT * FROM facturacion.stock_bodega WHERE empresa_id = '<EMPRESA_ID>' ORDER BY producto_id LIMIT 20;
-- SELECT facturacion.fn_recalcular_stock_bodega('<EMPRESA_ID>');
-- (repetir el SELECT de arriba y comparar costo_promedio antes/después)

-- ============================================================
-- Rollback (comentado)
-- ============================================================
-- DROP FUNCTION IF EXISTS facturacion.fn_recalcular_stock_bodega(UUID);
