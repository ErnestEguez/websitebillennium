-- ============================================================
-- MIGRACIÓN: Vendedores + Cartera CxC
-- Proyecto: QuickInvoice
-- Fecha: 2026-04-05
-- Descripción:
--   1. Crear tabla vendedores
--   2. Crear tabla cartera_cxc (saldos por factura a crédito)
--   3. Crear tabla cartera_cxc_pagos (abonos / cancelaciones)
--   4. Agregar vendedor_id a comprobantes
--   5. RLS para todas las tablas nuevas
-- ============================================================

-- ───────────────────────────────────────────────────
-- 1. TABLA: vendedores
-- ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendedores (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id       UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nombre           TEXT NOT NULL,
    iniciales        TEXT,
    email            TEXT,
    telefono         TEXT,
    estado           TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'baja')),
    fecha_baja       TIMESTAMP WITH TIME ZONE,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ───────────────────────────────────────────────────
-- 2. AGREGAR vendedor_id A comprobantes
-- ───────────────────────────────────────────────────
ALTER TABLE public.comprobantes
    ADD COLUMN IF NOT EXISTS vendedor_id UUID REFERENCES public.vendedores(id) ON DELETE SET NULL;

-- ───────────────────────────────────────────────────
-- 3. TABLA: cartera_cxc
--    Una fila por factura emitida a crédito.
--    saldo se va reduciendo conforme entran pagos.
-- ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cartera_cxc (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    comprobante_id      UUID NOT NULL REFERENCES public.comprobantes(id) ON DELETE RESTRICT,
    cliente_id          UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
    fecha_emision       DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_vencimiento   DATE,
    valor_original      DECIMAL(12,2) NOT NULL,
    saldo               DECIMAL(12,2) NOT NULL,
    estado              TEXT NOT NULL DEFAULT 'pendiente'
                            CHECK (estado IN ('pendiente', 'parcial', 'pagada', 'anulada')),
    observaciones       TEXT,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE (comprobante_id)   -- una sola entrada CxC por comprobante
);

-- ───────────────────────────────────────────────────
-- 4. TABLA: cartera_cxc_pagos
--    Registra cada abono o cancelación de una cartera.
-- ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cartera_cxc_pagos (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cartera_id      UUID NOT NULL REFERENCES public.cartera_cxc(id) ON DELETE CASCADE,
    empresa_id      UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    fecha_pago      DATE NOT NULL DEFAULT CURRENT_DATE,
    valor           DECIMAL(12,2) NOT NULL CHECK (valor > 0),
    metodo_pago     TEXT NOT NULL DEFAULT 'efectivo'
                        CHECK (metodo_pago IN ('efectivo', 'transferencia', 'cheque', 'tarjeta', 'nota_credito', 'otros')),
    referencia      TEXT,
    usuario_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ───────────────────────────────────────────────────
-- 5. FUNCIÓN: actualizar saldo y estado de cartera_cxc
--    Se dispara automáticamente tras INSERT en cartera_cxc_pagos
-- ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_actualizar_saldo_cxc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_saldo_nuevo DECIMAL(12,2);
BEGIN
    -- Recalcular saldo: valor_original - suma de todos los pagos
    SELECT valor_original - COALESCE(SUM(p.valor), 0)
    INTO v_saldo_nuevo
    FROM public.cartera_cxc c
    LEFT JOIN public.cartera_cxc_pagos p ON p.cartera_id = c.id
    WHERE c.id = NEW.cartera_id
    GROUP BY c.valor_original;

    -- Actualizar saldo y estado en cartera_cxc
    UPDATE public.cartera_cxc
    SET
        saldo      = GREATEST(v_saldo_nuevo, 0),
        estado     = CASE
                        WHEN v_saldo_nuevo <= 0 THEN 'pagada'
                        WHEN v_saldo_nuevo < valor_original THEN 'parcial'
                        ELSE 'pendiente'
                     END,
        updated_at = timezone('utc'::text, now())
    WHERE id = NEW.cartera_id;

    RETURN NEW;
END;
$$;

-- Trigger: se ejecuta después de cada pago insertado
DROP TRIGGER IF EXISTS trg_actualizar_saldo_cxc ON public.cartera_cxc_pagos;
CREATE TRIGGER trg_actualizar_saldo_cxc
AFTER INSERT ON public.cartera_cxc_pagos
FOR EACH ROW EXECUTE FUNCTION public.fn_actualizar_saldo_cxc();

-- ───────────────────────────────────────────────────
-- 6. RLS: vendedores
-- ───────────────────────────────────────────────────
ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendedores_select" ON public.vendedores FOR SELECT TO authenticated
USING (
    public.is_platform_admin()
    OR empresa_id = public.get_my_empresa_id()
);

CREATE POLICY "vendedores_insert" ON public.vendedores FOR INSERT TO authenticated
WITH CHECK (
    public.is_platform_admin()
    OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina())
);

CREATE POLICY "vendedores_update" ON public.vendedores FOR UPDATE TO authenticated
USING (
    public.is_platform_admin()
    OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina())
);

CREATE POLICY "vendedores_delete" ON public.vendedores FOR DELETE TO authenticated
USING (
    public.is_platform_admin()
    OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina())
);

-- ───────────────────────────────────────────────────
-- 7. RLS: cartera_cxc
-- ───────────────────────────────────────────────────
ALTER TABLE public.cartera_cxc ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cartera_cxc_select" ON public.cartera_cxc FOR SELECT TO authenticated
USING (
    public.is_platform_admin()
    OR empresa_id = public.get_my_empresa_id()
);

CREATE POLICY "cartera_cxc_insert" ON public.cartera_cxc FOR INSERT TO authenticated
WITH CHECK (
    public.is_platform_admin()
    OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina())
);

CREATE POLICY "cartera_cxc_update" ON public.cartera_cxc FOR UPDATE TO authenticated
USING (
    public.is_platform_admin()
    OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina())
);

-- No permitir DELETE en cartera (solo anulación lógica vía estado='anulada')
CREATE POLICY "cartera_cxc_delete" ON public.cartera_cxc FOR DELETE TO authenticated
USING (public.is_platform_admin());

-- ───────────────────────────────────────────────────
-- 8. RLS: cartera_cxc_pagos
-- ───────────────────────────────────────────────────
ALTER TABLE public.cartera_cxc_pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cartera_pagos_select" ON public.cartera_cxc_pagos FOR SELECT TO authenticated
USING (
    public.is_platform_admin()
    OR empresa_id = public.get_my_empresa_id()
);

CREATE POLICY "cartera_pagos_insert" ON public.cartera_cxc_pagos FOR INSERT TO authenticated
WITH CHECK (
    public.is_platform_admin()
    OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina())
);

-- Solo admin puede eliminar pagos (auditoría)
CREATE POLICY "cartera_pagos_delete" ON public.cartera_cxc_pagos FOR DELETE TO authenticated
USING (public.is_platform_admin());

-- ───────────────────────────────────────────────────
-- 9. ÍNDICES para consultas frecuentes
-- ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vendedores_empresa     ON public.vendedores(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cartera_cxc_empresa    ON public.cartera_cxc(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cartera_cxc_cliente    ON public.cartera_cxc(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cartera_cxc_estado     ON public.cartera_cxc(estado);
CREATE INDEX IF NOT EXISTS idx_cartera_pagos_cartera  ON public.cartera_cxc_pagos(cartera_id);
CREATE INDEX IF NOT EXISTS idx_comprobantes_vendedor  ON public.comprobantes(vendedor_id);

-- ───────────────────────────────────────────────────
-- 10. Notificar a PostgREST
-- ───────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ───────────────────────────────────────────────────
-- VERIFICACIÓN
-- ───────────────────────────────────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('vendedores', 'cartera_cxc', 'cartera_cxc_pagos')
ORDER BY table_name;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'comprobantes'
  AND column_name = 'vendedor_id';
