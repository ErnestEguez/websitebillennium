-- ============================================================
-- NOTAS DE CRÉDITO DE PROVEEDORES — 2026-07-23
-- Esquema: facturacion
-- Todo aditivo: nuevas tablas + ADD COLUMN + ampliación de un CHECK.
-- No modifica datos ni tablas existentes más allá de eso.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Cabecera
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.notas_credito_proveedores (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id              UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    proveedor_id            UUID NOT NULL REFERENCES facturacion.proveedores(id) ON DELETE RESTRICT,
    compra_id               UUID NOT NULL REFERENCES facturacion.ingresos_stock(id) ON DELETE RESTRICT,

    -- CxP contra la que se aplica el valor de la N/C. Snapshot al momento de
    -- crear (la de la factura origen), o la elegida manualmente por el
    -- contador si esa factura ya no tenía saldo / el valor la superaba.
    cxp_id                  UUID REFERENCES facturacion.cuentas_por_pagar(id) ON DELETE SET NULL,

    tipo                    TEXT NOT NULL CHECK (tipo IN ('DEVOLUCION_MERCADERIA','NC_VALOR')),

    -- Datos del documento que emite el PROVEEDOR (solo se registra, no se firma)
    numero_nc               TEXT,
    autorizacion_nc         TEXT,
    fecha_nc                DATE NOT NULL,
    observacion             TEXT,

    -- Totales (bases por tarifa se capturan a mano — ver iva_porcentaje abajo)
    base_iva_0              DECIMAL(12,2) NOT NULL DEFAULT 0,
    base_iva_5              DECIMAL(12,2) NOT NULL DEFAULT 0,
    base_iva_15             DECIMAL(12,2) NOT NULL DEFAULT 0,
    valor_iva               DECIMAL(12,2) NOT NULL DEFAULT 0,
    total                   DECIMAL(12,2) NOT NULL DEFAULT 0,

    -- Override manual de la cuenta contable (BuscadorCuentaContable). Si es
    -- NULL, el servicio usa el mapeo PAGOS:NOTA_CREDITO ya existente.
    cuenta_contra_id        UUID,

    estado                  TEXT NOT NULL DEFAULT 'ACTIVA'
        CHECK (estado IN ('ACTIVA','ANULADA')),
    motivo_anulacion        TEXT,
    fecha_anulacion         DATE,
    anulado_por             UUID REFERENCES auth.users,

    lp_comprobante_id       UUID,

    created_by              UUID REFERENCES auth.users,
    created_at              TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at              TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- ────────────────────────────────────────────────────────────
-- 2. Detalle (solo aplica a DEVOLUCION_MERCADERIA)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.notas_credito_proveedores_detalle (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nc_proveedor_id     UUID NOT NULL REFERENCES facturacion.notas_credito_proveedores(id) ON DELETE CASCADE,
    detalle_ingreso_id  UUID REFERENCES facturacion.detalle_ingresos_stock(id) ON DELETE SET NULL,
    producto_id         UUID REFERENCES facturacion.productos(id) ON DELETE SET NULL,
    bodega_id           UUID REFERENCES facturacion.bodegas(id) ON DELETE SET NULL,
    cantidad            DECIMAL(12,2) NOT NULL,
    costo_unitario      DECIMAL(12,2) NOT NULL,
    subtotal            DECIMAL(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ncprov_empresa    ON facturacion.notas_credito_proveedores(empresa_id);
CREATE INDEX IF NOT EXISTS idx_ncprov_proveedor  ON facturacion.notas_credito_proveedores(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_ncprov_compra     ON facturacion.notas_credito_proveedores(compra_id);
CREATE INDEX IF NOT EXISTS idx_ncprov_det_nc     ON facturacion.notas_credito_proveedores_detalle(nc_proveedor_id);

ALTER TABLE facturacion.notas_credito_proveedores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.notas_credito_proveedores_detalle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nc_proveedores_empresa" ON facturacion.notas_credito_proveedores
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
    ));

CREATE POLICY "nc_proveedores_detalle_empresa" ON facturacion.notas_credito_proveedores_detalle
    FOR ALL USING (nc_proveedor_id IN (
        SELECT id FROM facturacion.notas_credito_proveedores WHERE empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        )
    ));

-- ────────────────────────────────────────────────────────────
-- 3. Cambios aditivos a pagos_proveedores (tabla existente)
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturacion.pagos_proveedores
    DROP CONSTRAINT IF EXISTS pagos_proveedores_forma_pago_check;
ALTER TABLE facturacion.pagos_proveedores
    ADD CONSTRAINT pagos_proveedores_forma_pago_check
        CHECK (forma_pago IN ('EFECTIVO','TRANSFERENCIA','CHEQUE','NOTA_DEBITO','OTRO','NOTA_CREDITO'));

ALTER TABLE facturacion.pagos_proveedores
    ADD COLUMN IF NOT EXISTS nota_credito_proveedor_id UUID
        REFERENCES facturacion.notas_credito_proveedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pagos_prov_nc ON facturacion.pagos_proveedores(nota_credito_proveedor_id)
    WHERE nota_credito_proveedor_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 4. Captura de tarifa de IVA por línea (hacia adelante — no repara histórico)
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturacion.detalle_ingresos_stock
    ADD COLUMN IF NOT EXISTS iva_porcentaje NUMERIC(5,2);

-- ────────────────────────────────────────────────────────────
-- 5. Permiso de módulo
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturacion.user_permisos
    ADD COLUMN IF NOT EXISTS perm_nc_proveedores BOOLEAN DEFAULT true;
