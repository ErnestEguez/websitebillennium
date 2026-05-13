-- ============================================================
-- MIGRACIÓN: Notas de Crédito Electrónicas
-- Proyecto: QuickInvoice
-- Fecha: 2026-04-05
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. Ampliar estado_sistema en comprobantes ──────────────
-- Primero: crear la columna si no existe (puede que SQL_Anulacion_Facturas.sql no se haya ejecutado)
ALTER TABLE public.comprobantes
    ADD COLUMN IF NOT EXISTS estado_sistema TEXT NOT NULL DEFAULT 'VIGENTE';

ALTER TABLE public.comprobantes
    ADD COLUMN IF NOT EXISTS fecha_anulacion  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT,
    ADD COLUMN IF NOT EXISTS usuario_anulacion UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Segundo: eliminar constraint anterior si existe y recrear con el nuevo valor
ALTER TABLE public.comprobantes
    DROP CONSTRAINT IF EXISTS comprobantes_estado_sistema_check;

ALTER TABLE public.comprobantes
    ADD CONSTRAINT comprobantes_estado_sistema_check
        CHECK (estado_sistema IN ('VIGENTE', 'ANULADA', 'CANCELADA_POR_NC'));

-- ── 2. Agregar tipo_pago y nota_credito_id a cartera_cxc_pagos ──
ALTER TABLE public.cartera_cxc_pagos
    ADD COLUMN IF NOT EXISTS tipo_pago TEXT NOT NULL DEFAULT 'efectivo'
        CHECK (tipo_pago IN ('efectivo', 'transferencia', 'cheque', 'tarjeta', 'nota_credito'));

ALTER TABLE public.cartera_cxc_pagos
    ADD COLUMN IF NOT EXISTS nota_credito_id UUID; -- FK se agrega después de crear la tabla

-- ── 3. Tabla cabecera notas_credito ───────────────────────
CREATE TABLE IF NOT EXISTS public.notas_credito (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id              UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    comprobante_origen_id   UUID NOT NULL REFERENCES public.comprobantes(id),
    cliente_id              UUID NOT NULL REFERENCES public.clientes(id),
    vendedor_id             UUID REFERENCES public.vendedores(id),

    -- Numeración SRI
    secuencial              TEXT NOT NULL,          -- e.g. "001-005-000000001"
    clave_acceso            TEXT UNIQUE,            -- 49 dígitos

    -- Tipo interno (para reportes)
    tipo_nc                 TEXT NOT NULL DEFAULT 'DEVOLUCION'
                                CHECK (tipo_nc IN ('DEVOLUCION', 'DESCUENTO', 'CORRECCION')),

    -- Motivo SRI (catálogo oficial)
    -- 01 = Devolución y anulación de bienes
    -- 02 = Anulación de comprobante electrónico
    -- 03 = Rebaja o descuento
    -- 04 = Corrección en el valor
    motivo_sri              TEXT NOT NULL CHECK (motivo_sri IN ('01','02','03','04')),
    motivo_descripcion      TEXT NOT NULL,

    -- Totales
    total_sin_impuestos     NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_iva               NUMERIC(14,2) NOT NULL DEFAULT 0,
    total                   NUMERIC(14,2) NOT NULL DEFAULT 0,

    -- Saldo disponible para aplicar a cartera
    saldo_nc                NUMERIC(14,2) NOT NULL DEFAULT 0,

    -- Estado SRI
    estado_sri              TEXT NOT NULL DEFAULT 'PENDIENTE'
                                CHECK (estado_sri IN ('PENDIENTE','ENVIADO','AUTORIZADO','RECHAZADO')),
    autorizacion_numero     TEXT,
    observaciones_sri       TEXT,
    xml_firmado             TEXT,       -- XML completo firmado (tamaño similar a factura, ~10KB max)

    -- Auditoría
    usuario_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Tabla detalle notas_credito ────────────────────────
CREATE TABLE IF NOT EXISTS public.notas_credito_detalle (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nota_credito_id     UUID NOT NULL REFERENCES public.notas_credito(id) ON DELETE CASCADE,
    producto_id         UUID REFERENCES public.productos(id),
    nombre_producto     TEXT NOT NULL,
    cantidad            NUMERIC(14,4) NOT NULL,
    precio_unitario     NUMERIC(14,6) NOT NULL,  -- sin IVA
    descuento           NUMERIC(5,2) NOT NULL DEFAULT 0,
    subtotal            NUMERIC(14,2) NOT NULL,  -- sin IVA
    iva_porcentaje      NUMERIC(5,2) NOT NULL DEFAULT 15,
    iva_valor           NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_linea         NUMERIC(14,2) NOT NULL
);

-- ── 5. Tabla de aplicación NC → cartera ───────────────────
CREATE TABLE IF NOT EXISTS public.aplicaciones_nc_cxc (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nota_credito_id     UUID NOT NULL REFERENCES public.notas_credito(id) ON DELETE CASCADE,
    cartera_cxc_id      UUID NOT NULL REFERENCES public.cartera_cxc(id),
    valor_aplicado      NUMERIC(14,2) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. FK diferida: cartera_cxc_pagos.nota_credito_id ─────
ALTER TABLE public.cartera_cxc_pagos
    ADD CONSTRAINT fk_pagos_nota_credito
        FOREIGN KEY (nota_credito_id) REFERENCES public.notas_credito(id) ON DELETE SET NULL;

-- ── 7. Trigger: actualizar saldo_nc tras aplicación ───────
CREATE OR REPLACE FUNCTION fn_actualizar_saldo_nc()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE public.notas_credito
    SET saldo_nc = total - COALESCE((
            SELECT SUM(valor_aplicado)
            FROM public.aplicaciones_nc_cxc
            WHERE nota_credito_id = NEW.nota_credito_id
        ), 0),
        updated_at = NOW()
    WHERE id = NEW.nota_credito_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saldo_nc ON public.aplicaciones_nc_cxc;
CREATE TRIGGER trg_saldo_nc
AFTER INSERT ON public.aplicaciones_nc_cxc
FOR EACH ROW EXECUTE FUNCTION fn_actualizar_saldo_nc();

-- ── 8. Índices ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_nc_empresa      ON public.notas_credito(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nc_origen       ON public.notas_credito(comprobante_origen_id);
CREATE INDEX IF NOT EXISTS idx_nc_cliente      ON public.notas_credito(cliente_id);
CREATE INDEX IF NOT EXISTS idx_nc_detalle      ON public.notas_credito_detalle(nota_credito_id);
CREATE INDEX IF NOT EXISTS idx_aplicaciones_nc ON public.aplicaciones_nc_cxc(nota_credito_id);
CREATE INDEX IF NOT EXISTS idx_aplicaciones_cx ON public.aplicaciones_nc_cxc(cartera_cxc_id);

-- ── 9. RLS ─────────────────────────────────────────────────
ALTER TABLE public.notas_credito         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_credito_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aplicaciones_nc_cxc   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nc_empresa_policy   ON public.notas_credito;
DROP POLICY IF EXISTS nc_detalle_policy   ON public.notas_credito_detalle;
DROP POLICY IF EXISTS nc_aplicacion_policy ON public.aplicaciones_nc_cxc;

CREATE POLICY nc_empresa_policy ON public.notas_credito
    USING (empresa_id = (
        SELECT empresa_id FROM public.profiles WHERE id = auth.uid()
    ));

CREATE POLICY nc_detalle_policy ON public.notas_credito_detalle
    USING (nota_credito_id IN (
        SELECT id FROM public.notas_credito
        WHERE empresa_id = (
            SELECT empresa_id FROM public.profiles WHERE id = auth.uid()
        )
    ));

CREATE POLICY nc_aplicacion_policy ON public.aplicaciones_nc_cxc
    USING (nota_credito_id IN (
        SELECT id FROM public.notas_credito
        WHERE empresa_id = (
            SELECT empresa_id FROM public.profiles WHERE id = auth.uid()
        )
    ));

-- ── 10. Secuencial NC en config_sri (por empresa) ─────────
-- Agrega secuencial_nc_actual al JSONB si no existe (valor por defecto 0)
UPDATE public.empresas
SET config_sri = config_sri || '{"secuencial_nc_actual": 0}'::jsonb
WHERE config_sri IS NOT NULL
  AND NOT (config_sri ? 'secuencial_nc_actual');

NOTIFY pgrst, 'reload schema';
