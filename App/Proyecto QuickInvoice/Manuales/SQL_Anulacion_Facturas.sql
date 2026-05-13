-- ============================================================
-- MIGRACIÓN: Anulación de Facturas (estado_sistema)
-- Proyecto: QuickInvoice
-- Fecha: 2026-04-05
-- ============================================================

-- Agregar columna estado_sistema a comprobantes
ALTER TABLE public.comprobantes
    ADD COLUMN IF NOT EXISTS estado_sistema TEXT NOT NULL DEFAULT 'VIGENTE'
        CHECK (estado_sistema IN ('VIGENTE', 'ANULADA'));

ALTER TABLE public.comprobantes
    ADD COLUMN IF NOT EXISTS fecha_anulacion  TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT,
    ADD COLUMN IF NOT EXISTS usuario_anulacion UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Índice para filtrar vigentes vs anuladas rápidamente
CREATE INDEX IF NOT EXISTS idx_comprobantes_estado_sistema
    ON public.comprobantes(empresa_id, estado_sistema);

-- Notificar PostgREST
NOTIFY pgrst, 'reload schema';
