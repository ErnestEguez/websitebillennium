-- =====================================================
-- Fix: Agregar columnas faltantes a caja_sesiones
-- La tabla fue creada sin total_tarjetas y total_transferencia
-- Ejecutar en Supabase SQL Editor
-- =====================================================

ALTER TABLE public.caja_sesiones
    ADD COLUMN IF NOT EXISTS total_tarjetas     DECIMAL(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_transferencia DECIMAL(12,2) DEFAULT 0;

-- Recargar schema cache de PostgREST
NOTIFY pgrst, 'reload schema';

-- Verificar columnas actuales
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'caja_sesiones'
ORDER BY ordinal_position;
