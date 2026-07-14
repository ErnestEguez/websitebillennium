-- =============================================================
-- Liquidaciones de Compra Electrónicas (codDoc=03, SRI Ecuador)
-- Ejecutar en Supabase SQL Editor (schema: facturacion)
-- =============================================================

-- 1. Tabla principal ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.liquidaciones_compra (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id                  UUID NOT NULL,
    punto_emision_id            UUID NOT NULL,
    establecimiento             TEXT NOT NULL,    -- '001' (3 dígitos)
    punto_emision               TEXT NOT NULL,    -- '001' (3 dígitos)
    secuencial                  TEXT NOT NULL,
    clave_acceso                TEXT,
    ambiente                    TEXT NOT NULL DEFAULT 'PRUEBAS',
    estado_sri                  TEXT NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado_sri IN ('PENDIENTE','AUTORIZADO','RECHAZADO','ANULADO')),
    -- Beneficiario (persona natural, extranjero, empleado, etc.)
    proveedor_id                UUID,             -- FK opcional al catálogo de proveedores
    beneficiario_tipo_id        TEXT NOT NULL DEFAULT 'CEDULA'
        CHECK (beneficiario_tipo_id IN ('CEDULA','PASAPORTE','SIN_RUC','EXTERIOR')),
    beneficiario_identificacion TEXT NOT NULL,
    beneficiario_nombre         TEXT NOT NULL,
    beneficiario_direccion      TEXT,
    beneficiario_email          TEXT,
    -- Fechas
    fecha_emision               DATE NOT NULL DEFAULT CURRENT_DATE,
    -- Sustento tributario
    tipo_sustento               TEXT NOT NULL DEFAULT '02',
    tipo_regimen_pago           TEXT NOT NULL DEFAULT '01',
    pais_pago_exterior          TEXT,
    aplica_convenio_ddi         BOOLEAN NOT NULL DEFAULT false,
    -- Totales
    subtotal                    NUMERIC(12,2) NOT NULL DEFAULT 0,
    base_iva_0                  NUMERIC(12,2) NOT NULL DEFAULT 0,
    base_iva_15                 NUMERIC(12,2) NOT NULL DEFAULT 0,
    valor_iva                   NUMERIC(12,2) NOT NULL DEFAULT 0,
    total                       NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_retenciones           NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- Pago
    forma_pago                  TEXT NOT NULL DEFAULT 'CONTADO'
        CHECK (forma_pago IN ('CONTADO','CREDITO')),
    fecha_vencimiento           DATE,
    -- Respuesta SRI
    numero_autorizacion         TEXT,
    fecha_autorizacion          TIMESTAMPTZ,
    xml_firmado                 TEXT,
    observaciones_sri           TEXT,
    motivo_anulacion            TEXT,
    -- Vínculo contable
    asiento_id                  UUID,
    -- Auditoría
    observaciones               TEXT,
    created_by                  UUID,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 2. Líneas de detalle ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.liquidacion_compra_detalles (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id       UUID NOT NULL,
    liquidacion_id   UUID NOT NULL REFERENCES facturacion.liquidaciones_compra(id) ON DELETE CASCADE,
    descripcion      TEXT NOT NULL,
    cantidad         NUMERIC(12,4) NOT NULL DEFAULT 1,
    precio_unitario  NUMERIC(12,4) NOT NULL DEFAULT 0,
    descuento        NUMERIC(12,4) NOT NULL DEFAULT 0,
    aplica_iva       BOOLEAN NOT NULL DEFAULT true,
    subtotal         NUMERIC(12,4) NOT NULL DEFAULT 0,
    tipo_gasto       TEXT NOT NULL DEFAULT 'SERVICIOS',
    cuenta_contable_id UUID,
    orden            INTEGER NOT NULL DEFAULT 1
);

-- 3. Retenciones de la LC ──────────────────────────────────────
-- tipo: 'IR' = Impuesto a la Renta, 'IVA' = Retención IVA
CREATE TABLE IF NOT EXISTS facturacion.liquidacion_compra_retenciones (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id       UUID NOT NULL,
    liquidacion_id   UUID NOT NULL REFERENCES facturacion.liquidaciones_compra(id) ON DELETE CASCADE,
    tipo             TEXT NOT NULL CHECK (tipo IN ('IR','IVA')),
    codigo_retencion TEXT NOT NULL,
    descripcion      TEXT,
    base_imponible   NUMERIC(12,2) NOT NULL DEFAULT 0,
    porcentaje       NUMERIC(6,2)  NOT NULL DEFAULT 0,
    valor            NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 4. Adaptar cuentas_por_pagar para soportar LC ───────────────
-- Agrega FK opcional a la LC (además de compra_id ya existente)
ALTER TABLE facturacion.cuentas_por_pagar
    ADD COLUMN IF NOT EXISTS liquidacion_id UUID REFERENCES facturacion.liquidaciones_compra(id);

-- Las LC no tienen compra_id, lo hacemos nullable
ALTER TABLE facturacion.cuentas_por_pagar
    ALTER COLUMN compra_id DROP NOT NULL;

-- 5. Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lc_empresa_fecha
    ON facturacion.liquidaciones_compra(empresa_id, fecha_emision DESC);

CREATE INDEX IF NOT EXISTS idx_lc_estado
    ON facturacion.liquidaciones_compra(estado_sri);

CREATE INDEX IF NOT EXISTS idx_lc_proveedor
    ON facturacion.liquidaciones_compra(proveedor_id)
    WHERE proveedor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lcd_liquidacion
    ON facturacion.liquidacion_compra_detalles(liquidacion_id);

CREATE INDEX IF NOT EXISTS idx_lcr_liquidacion
    ON facturacion.liquidacion_compra_retenciones(liquidacion_id);

-- 6. Trigger updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION facturacion.fn_lc_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := timezone('utc', now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lc_updated_at ON facturacion.liquidaciones_compra;
CREATE TRIGGER trg_lc_updated_at
    BEFORE UPDATE ON facturacion.liquidaciones_compra
    FOR EACH ROW EXECUTE FUNCTION facturacion.fn_lc_set_updated_at();

-- 7. Row Level Security ────────────────────────────────────────
ALTER TABLE facturacion.liquidaciones_compra           ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.liquidacion_compra_detalles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.liquidacion_compra_retenciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lc_empresa_propia"  ON facturacion.liquidaciones_compra;
DROP POLICY IF EXISTS "lcd_empresa_propia" ON facturacion.liquidacion_compra_detalles;
DROP POLICY IF EXISTS "lcr_empresa_propia" ON facturacion.liquidacion_compra_retenciones;

CREATE POLICY "lc_empresa_propia" ON facturacion.liquidaciones_compra
    USING (empresa_id IN (SELECT facturacion.mis_empresas_ids()));

CREATE POLICY "lcd_empresa_propia" ON facturacion.liquidacion_compra_detalles
    USING (empresa_id IN (SELECT facturacion.mis_empresas_ids()));

CREATE POLICY "lcr_empresa_propia" ON facturacion.liquidacion_compra_retenciones
    USING (empresa_id IN (SELECT facturacion.mis_empresas_ids()));

-- 8. Grants ───────────────────────────────────────────────────
GRANT ALL ON facturacion.liquidaciones_compra           TO authenticated, service_role;
GRANT ALL ON facturacion.liquidacion_compra_detalles    TO authenticated, service_role;
GRANT ALL ON facturacion.liquidacion_compra_retenciones TO authenticated, service_role;

-- 9. Comentarios ──────────────────────────────────────────────
COMMENT ON TABLE facturacion.liquidaciones_compra IS
    'Liquidaciones de Compra electrónicas (codDoc=03 SRI). La empresa actúa como compradora; el beneficiario es persona natural sin RUC, extranjero o empleado.';
COMMENT ON COLUMN facturacion.liquidaciones_compra.estado_sri IS
    'PENDIENTE=borrador, AUTORIZADO=autorizado por SRI, RECHAZADO=SRI devolvió error, ANULADO=anulado internamente';
COMMENT ON COLUMN facturacion.liquidaciones_compra.beneficiario_tipo_id IS
    'CEDULA=cédula EC, PASAPORTE=pasaporte, SIN_RUC=nivel cultural/rusticidad, EXTERIOR=extranjero sin RUC';
COMMENT ON COLUMN facturacion.liquidaciones_compra.secuencial IS
    'Número de 9 dígitos. Se obtiene con qi_next_secuencial_punto usando clave LIQUIDACION.';
COMMENT ON TABLE facturacion.liquidacion_compra_retenciones IS
    'tipo IR = Impuesto a la Renta (códigos 340, 341, etc.); tipo IVA = Retención IVA (725=30%, 726=70%, 727=100%).';
