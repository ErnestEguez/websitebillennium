-- ==========================================================================
-- FUSIÓN: retenciones de Liquidaciones de Compra → retenciones_compras
-- Las retenciones de LC son comprobantes de retención (codDoc=07) iguales
-- a las de compras normales; la única diferencia es el doc de sustento (03).
-- ==========================================================================

-- 1. compra_id ya no es obligatorio (puede ser NULL para retenciones de LC)
ALTER TABLE facturacion.retenciones_compras
    ALTER COLUMN compra_id DROP NOT NULL;

-- 2. Nueva columna para trazar el origen cuando es una LC
ALTER TABLE facturacion.retenciones_compras
    ADD COLUMN IF NOT EXISTS liquidacion_id UUID
        REFERENCES facturacion.liquidaciones_compra(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ret_compras_lc
    ON facturacion.retenciones_compras(liquidacion_id)
    WHERE liquidacion_id IS NOT NULL;

-- 3. Al menos uno de los dos debe estar presente
ALTER TABLE facturacion.retenciones_compras
    ADD CONSTRAINT chk_ret_source
    CHECK (compra_id IS NOT NULL OR liquidacion_id IS NOT NULL);

-- 4. Migrar retenciones existentes en liquidacion_compra_retenciones
--    (si la tabla aún existe y tiene datos)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'facturacion'
          AND table_name   = 'liquidacion_compra_retenciones'
    ) THEN
        INSERT INTO facturacion.retenciones_compras (
            empresa_id,
            liquidacion_id,
            compra_id,
            proveedor_id,
            fecha_emision,
            tipo,
            codigo_retencion,
            descripcion,
            base_imponible,
            porcentaje,
            valor,
            estado,
            origen,
            estado_sri
        )
        SELECT
            r.empresa_id,
            r.liquidacion_id,
            NULL,                          -- sin compra de inventario
            lc.proveedor_id,
            lc.fecha_emision,
            CASE WHEN r.tipo = 'IR' THEN 'FUENTE' ELSE r.tipo END,
            r.codigo_retencion,
            r.descripcion,
            r.base_imponible,
            r.porcentaje,
            r.valor,
            'ACTIVO',
            'MANUAL',
            'NO_FIRMADA'
        FROM facturacion.liquidacion_compra_retenciones r
        JOIN facturacion.liquidaciones_compra lc ON lc.id = r.liquidacion_id
        WHERE NOT EXISTS (
            SELECT 1 FROM facturacion.retenciones_compras rc
            WHERE rc.liquidacion_id    = r.liquidacion_id
              AND rc.codigo_retencion  = r.codigo_retencion
              AND rc.tipo = CASE WHEN r.tipo = 'IR' THEN 'FUENTE' ELSE r.tipo END
        );

        DROP TABLE facturacion.liquidacion_compra_retenciones;
    END IF;
END $$;
