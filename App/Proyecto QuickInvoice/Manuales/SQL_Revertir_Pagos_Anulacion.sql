-- ============================================================
-- MIGRACIÓN: Trigger DELETE en cartera_cxc_pagos + RLS para revertir pagos
-- Proyecto: QuickInvoice
-- Fecha: 2026-04-10
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. Función que recalcula saldo al ELIMINAR un pago ──────
CREATE OR REPLACE FUNCTION public.fn_saldo_cxc_on_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_saldo DECIMAL(12,2);
BEGIN
    SELECT valor_original - COALESCE(SUM(p.valor), 0)
    INTO v_saldo
    FROM cartera_cxc c
    LEFT JOIN cartera_cxc_pagos p ON p.cartera_id = c.id
    WHERE c.id = OLD.cartera_id
    GROUP BY c.valor_original;

    UPDATE cartera_cxc
    SET saldo      = GREATEST(COALESCE(v_saldo, valor_original), 0),
        estado     = CASE
                        WHEN COALESCE(v_saldo, valor_original) <= 0 THEN 'pagada'
                        WHEN COALESCE(v_saldo, valor_original) < valor_original THEN 'parcial'
                        ELSE 'pendiente'
                     END,
        updated_at = timezone('utc', now())
    WHERE id = OLD.cartera_id;

    RETURN OLD;
END;
$$;

-- ── 2. Trigger AFTER DELETE ─────────────────────────────────
DROP TRIGGER IF EXISTS trg_saldo_cxc_delete ON public.cartera_cxc_pagos;
CREATE TRIGGER trg_saldo_cxc_delete
AFTER DELETE ON public.cartera_cxc_pagos
FOR EACH ROW EXECUTE FUNCTION public.fn_saldo_cxc_on_delete();

-- ── 3. RLS: permitir a oficina eliminar pagos (revertir) ────
--    (antes solo platform_admin podía borrar)
DROP POLICY IF EXISTS "cartera_pagos_delete" ON public.cartera_cxc_pagos;
CREATE POLICY "cartera_pagos_delete" ON public.cartera_cxc_pagos
FOR DELETE TO authenticated
USING (
    public.is_platform_admin()
    OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina())
);

-- ── 4. Asegurar que estado_sistema existe en comprobantes ───
--    (por si SQL_Anulacion_Facturas.sql no se ejecutó antes)
ALTER TABLE public.comprobantes
    ADD COLUMN IF NOT EXISTS estado_sistema TEXT NOT NULL DEFAULT 'VIGENTE'
        CHECK (estado_sistema IN ('VIGENTE', 'ANULADA', 'CANCELADA_POR_NC'));

ALTER TABLE public.comprobantes
    ADD COLUMN IF NOT EXISTS fecha_anulacion   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS motivo_anulacion  TEXT,
    ADD COLUMN IF NOT EXISTS usuario_anulacion UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comprobantes_estado_sistema
    ON public.comprobantes(empresa_id, estado_sistema);

NOTIFY pgrst, 'reload schema';
