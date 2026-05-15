-- ============================================================
-- VENDOR MANAGEMENT — Migración completa
-- Extiende tablas existentes + crea tablas nuevas
-- Seguro para ejecutar sobre datos existentes (ADD COLUMN IF NOT EXISTS)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. EXTENDER proveedores
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.proveedores
    ADD COLUMN IF NOT EXISTS tipo_identificacion  TEXT DEFAULT 'RUC'
        CHECK (tipo_identificacion IN ('RUC','CEDULA','PASAPORTE','EXTERIOR')),
    ADD COLUMN IF NOT EXISTS tipo_proveedor       TEXT DEFAULT 'SOCIEDAD'
        CHECK (tipo_proveedor IN ('PERSONA_NATURAL','SOCIEDAD')),
    ADD COLUMN IF NOT EXISTS estado               TEXT DEFAULT 'ACTIVO'
        CHECK (estado IN ('ACTIVO','INACTIVO')),
    ADD COLUMN IF NOT EXISTS condicion_pago       TEXT DEFAULT 'CONTADO'
        CHECK (condicion_pago IN ('CONTADO','CREDITO')),
    ADD COLUMN IF NOT EXISTS dias_credito         INTEGER,
    ADD COLUMN IF NOT EXISTS ciudad               TEXT,
    ADD COLUMN IF NOT EXISTS provincia            TEXT,
    ADD COLUMN IF NOT EXISTS pais                 TEXT DEFAULT 'Ecuador',
    ADD COLUMN IF NOT EXISTS contribuyente_especial BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS agente_retencion     BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS tipo_regimen         TEXT DEFAULT 'GENERAL'
        CHECK (tipo_regimen IN ('GENERAL','RIMPE_EMPRENDEDOR','RIMPE_NEGOCIO_POPULAR'));

-- ────────────────────────────────────────────────────────────
-- 2. EXTENDER ingresos_stock → cabecera única de compras
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.ingresos_stock
    -- Tipo y estado
    ADD COLUMN IF NOT EXISTS tipo_compra    TEXT DEFAULT 'INVENTARIO'
        CHECK (tipo_compra IN ('INVENTARIO','SERVICIO')),
    ADD COLUMN IF NOT EXISTS estado         TEXT DEFAULT 'ACTIVO'
        CHECK (estado IN ('ACTIVO','ANULADO','DEVUELTO')),
    ADD COLUMN IF NOT EXISTS origen         TEXT DEFAULT 'MANUAL'
        CHECK (origen IN ('MANUAL','SRI','OC')),

    -- Datos del comprobante del proveedor (SRI)
    ADD COLUMN IF NOT EXISTS fecha_emision        DATE,
    ADD COLUMN IF NOT EXISTS estab                TEXT,
    ADD COLUMN IF NOT EXISTS pto_emi              TEXT,
    ADD COLUMN IF NOT EXISTS secuencial           TEXT,
    ADD COLUMN IF NOT EXISTS numero_autorizacion  TEXT,
    ADD COLUMN IF NOT EXISTS clave_acceso         TEXT,

    -- Bases y totales fiscales
    ADD COLUMN IF NOT EXISTS base_iva_0    DECIMAL(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS base_iva_5    DECIMAL(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS base_iva_15   DECIMAL(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS subtotal      DECIMAL(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS valor_iva     DECIMAL(12,2) DEFAULT 0,

    -- Pago
    ADD COLUMN IF NOT EXISTS forma_pago         TEXT DEFAULT 'CONTADO'
        CHECK (forma_pago IN ('CONTADO','CREDITO')),
    ADD COLUMN IF NOT EXISTS fecha_vencimiento  DATE,

    -- Anulación
    ADD COLUMN IF NOT EXISTS motivo_anulacion   TEXT,
    ADD COLUMN IF NOT EXISTS fecha_anulacion    DATE,
    ADD COLUMN IF NOT EXISTS anulado_por        UUID REFERENCES auth.users,

    -- ATS
    ADD COLUMN IF NOT EXISTS tipo_sustento      TEXT DEFAULT '02'
        CHECK (tipo_sustento IN ('01','02','03','04','05')),
    ADD COLUMN IF NOT EXISTS tipo_regimen_pago  TEXT DEFAULT '01'
        CHECK (tipo_regimen_pago IN ('01','02')),
    ADD COLUMN IF NOT EXISTS pais_pago_exterior TEXT,
    ADD COLUMN IF NOT EXISTS aplica_convenio_ddi BOOLEAN DEFAULT false;

-- Registros existentes → tipo_compra INVENTARIO, estado ACTIVO
UPDATE public.ingresos_stock
    SET tipo_compra = 'INVENTARIO', estado = 'ACTIVO', origen = 'MANUAL'
    WHERE tipo_compra IS NULL;

-- ────────────────────────────────────────────────────────────
-- 3. NUEVA: ordenes_compra (antes de ingresos_stock FK)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ordenes_compra (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id              UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    proveedor_id            UUID REFERENCES public.proveedores(id) ON DELETE SET NULL,
    numero_oc               TEXT NOT NULL,
    fecha_emision           DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_entrega_esperada  DATE,
    estado                  TEXT NOT NULL DEFAULT 'BORRADOR'
        CHECK (estado IN ('BORRADOR','ENVIADA','PARCIALMENTE_RECIBIDA','RECIBIDA','ANULADA')),
    observaciones           TEXT,
    subtotal                DECIMAL(12,2) DEFAULT 0,
    total                   DECIMAL(12,2) DEFAULT 0,
    created_by              UUID REFERENCES auth.users,
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at              TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.detalle_ordenes_compra (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oc_id               UUID NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
    producto_id         UUID REFERENCES public.productos(id) ON DELETE SET NULL,
    descripcion         TEXT,
    cantidad_solicitada DECIMAL(12,2) NOT NULL,
    cantidad_recibida   DECIMAL(12,2) NOT NULL DEFAULT 0,
    costo_unitario      DECIMAL(12,2) NOT NULL DEFAULT 0,
    subtotal            DECIMAL(12,2) NOT NULL DEFAULT 0
);

-- FK de ingresos_stock a ordenes_compra
ALTER TABLE public.ingresos_stock
    ADD COLUMN IF NOT EXISTS orden_compra_id UUID REFERENCES public.ordenes_compra(id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────
-- 4. NUEVA: detalle_servicios
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.detalle_servicios (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    compra_id       UUID NOT NULL REFERENCES public.ingresos_stock(id) ON DELETE CASCADE,
    descripcion     TEXT NOT NULL,
    cantidad        DECIMAL(12,2) NOT NULL DEFAULT 1,
    precio_unitario DECIMAL(12,2) NOT NULL DEFAULT 0,
    subtotal        DECIMAL(12,2) NOT NULL DEFAULT 0,
    aplica_iva      BOOLEAN NOT NULL DEFAULT false,
    tipo_gasto      TEXT DEFAULT 'SERVICIOS'
        CHECK (tipo_gasto IN (
            'HONORARIOS','SERVICIOS_BASICOS','ARRENDAMIENTO',
            'TRANSPORTE','PUBLICIDAD','MANTENIMIENTO',
            'SEGUROS','SERVICIOS','OTROS'
        )),
    orden           INTEGER NOT NULL DEFAULT 1
);

-- ────────────────────────────────────────────────────────────
-- 5. NUEVA: retenciones_compras
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.retenciones_compras (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id              UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    compra_id               UUID NOT NULL REFERENCES public.ingresos_stock(id) ON DELETE CASCADE,
    proveedor_id            UUID REFERENCES public.proveedores(id) ON DELETE SET NULL,
    numero_retencion        TEXT,
    fecha_emision           DATE NOT NULL DEFAULT CURRENT_DATE,
    tipo                    TEXT NOT NULL CHECK (tipo IN ('FUENTE','IVA')),
    codigo_retencion        TEXT NOT NULL,
    descripcion             TEXT,
    base_imponible          DECIMAL(12,2) NOT NULL DEFAULT 0,
    porcentaje              DECIMAL(5,2)  NOT NULL DEFAULT 0,
    valor                   DECIMAL(12,2) NOT NULL DEFAULT 0,
    estado                  TEXT NOT NULL DEFAULT 'ACTIVO'
        CHECK (estado IN ('ACTIVO','ANULADO')),
    origen                  TEXT NOT NULL DEFAULT 'MANUAL'
        CHECK (origen IN ('MANUAL','SRI')),
    numero_autorizacion     TEXT,
    clave_acceso            TEXT,
    created_by              UUID REFERENCES auth.users,
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- ────────────────────────────────────────────────────────────
-- 6. NUEVA: cuentas_por_pagar
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cuentas_por_pagar (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    proveedor_id        UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE RESTRICT,
    compra_id           UUID NOT NULL REFERENCES public.ingresos_stock(id) ON DELETE RESTRICT,
    fecha_emision       DATE NOT NULL,
    fecha_vencimiento   DATE NOT NULL,
    monto_original      DECIMAL(12,2) NOT NULL,
    saldo_pendiente     DECIMAL(12,2) NOT NULL,
    estado              TEXT NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado IN ('PENDIENTE','PARCIALMENTE_PAGADO','PAGADO','ANULADO')),
    observaciones       TEXT,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- ────────────────────────────────────────────────────────────
-- 7. NUEVA: pagos_proveedores
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pagos_proveedores (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    cxp_id              UUID NOT NULL REFERENCES public.cuentas_por_pagar(id) ON DELETE RESTRICT,
    proveedor_id        UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE RESTRICT,
    fecha_pago          DATE NOT NULL DEFAULT CURRENT_DATE,
    monto               DECIMAL(12,2) NOT NULL,
    forma_pago          TEXT NOT NULL DEFAULT 'TRANSFERENCIA'
        CHECK (forma_pago IN ('EFECTIVO','TRANSFERENCIA','CHEQUE','NOTA_DEBITO','OTRO')),
    numero_referencia   TEXT,
    observaciones       TEXT,
    created_by          UUID REFERENCES auth.users,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- ────────────────────────────────────────────────────────────
-- 8. ÍNDICES para rendimiento
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ingresos_stock_tipo_compra   ON public.ingresos_stock(empresa_id, tipo_compra);
CREATE INDEX IF NOT EXISTS idx_ingresos_stock_estado        ON public.ingresos_stock(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_ingresos_stock_proveedor     ON public.ingresos_stock(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_ingresos_stock_clave_acceso  ON public.ingresos_stock(clave_acceso) WHERE clave_acceso IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_detalle_servicios_compra     ON public.detalle_servicios(compra_id);
CREATE INDEX IF NOT EXISTS idx_retenciones_compra           ON public.retenciones_compras(compra_id);
CREATE INDEX IF NOT EXISTS idx_retenciones_empresa          ON public.retenciones_compras(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cxp_empresa_estado           ON public.cuentas_por_pagar(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_cxp_proveedor                ON public.cuentas_por_pagar(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_cxp_vencimiento              ON public.cuentas_por_pagar(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_pagos_cxp                    ON public.pagos_proveedores(cxp_id);
CREATE INDEX IF NOT EXISTS idx_oc_empresa_estado            ON public.ordenes_compra(empresa_id, estado);

-- ────────────────────────────────────────────────────────────
-- 9. RLS — Row Level Security
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.ordenes_compra        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalle_ordenes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalle_servicios     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retenciones_compras   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuentas_por_pagar     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_proveedores     ENABLE ROW LEVEL SECURITY;

-- Políticas: usuario autenticado ve solo los registros de su empresa
CREATE POLICY "ordenes_compra_empresa" ON public.ordenes_compra
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM public.profiles WHERE id = auth.uid()
    ));

CREATE POLICY "detalle_oc_empresa" ON public.detalle_ordenes_compra
    FOR ALL USING (oc_id IN (
        SELECT id FROM public.ordenes_compra WHERE empresa_id IN (
            SELECT empresa_id FROM public.profiles WHERE id = auth.uid()
        )
    ));

CREATE POLICY "detalle_servicios_empresa" ON public.detalle_servicios
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM public.profiles WHERE id = auth.uid()
    ));

CREATE POLICY "retenciones_compras_empresa" ON public.retenciones_compras
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM public.profiles WHERE id = auth.uid()
    ));

CREATE POLICY "cxp_empresa" ON public.cuentas_por_pagar
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM public.profiles WHERE id = auth.uid()
    ));

CREATE POLICY "pagos_proveedores_empresa" ON public.pagos_proveedores
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM public.profiles WHERE id = auth.uid()
    ));

-- ────────────────────────────────────────────────────────────
-- 10. FUNCIÓN: actualizar saldo CxP al registrar un pago
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_actualizar_saldo_cxp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_saldo_nuevo DECIMAL(12,2);
BEGIN
    -- Recalcular saldo restando todos los pagos
    SELECT c.monto_original - COALESCE(SUM(p.monto), 0)
      INTO v_saldo_nuevo
      FROM public.cuentas_por_pagar c
      LEFT JOIN public.pagos_proveedores p ON p.cxp_id = c.id
     WHERE c.id = NEW.cxp_id
     GROUP BY c.monto_original;

    UPDATE public.cuentas_por_pagar
       SET saldo_pendiente = GREATEST(v_saldo_nuevo, 0),
           estado = CASE
               WHEN v_saldo_nuevo <= 0 THEN 'PAGADO'
               WHEN v_saldo_nuevo < monto_original THEN 'PARCIALMENTE_PAGADO'
               ELSE 'PENDIENTE'
           END,
           updated_at = timezone('utc', now())
     WHERE id = NEW.cxp_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_actualizar_saldo_cxp ON public.pagos_proveedores;
CREATE TRIGGER trg_actualizar_saldo_cxp
    AFTER INSERT ON public.pagos_proveedores
    FOR EACH ROW EXECUTE FUNCTION public.fn_actualizar_saldo_cxp();

-- ────────────────────────────────────────────────────────────
-- 11. FUNCIÓN: secuencial de OC por empresa
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_siguiente_numero_oc(p_empresa_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    v_siguiente INTEGER;
BEGIN
    SELECT COALESCE(MAX(
        CAST(SPLIT_PART(numero_oc, '-', 3) AS INTEGER)
    ), 0) + 1
      INTO v_siguiente
      FROM public.ordenes_compra
     WHERE empresa_id = p_empresa_id
       AND numero_oc ~ '^\d{4}-OC-\d+$';

    RETURN EXTRACT(YEAR FROM NOW())::TEXT || '-OC-' || LPAD(v_siguiente::TEXT, 5, '0');
END;
$$;
