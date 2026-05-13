-- =====================================================
-- Agregar forma de pago: Tarjeta D/C
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. Eliminar la restricción CHECK existente en comprobante_pagos
ALTER TABLE public.comprobante_pagos
    DROP CONSTRAINT IF EXISTS comprobante_pagos_metodo_pago_check;

-- 2. Recrear con el nuevo valor 'tarjeta'
ALTER TABLE public.comprobante_pagos
    ADD CONSTRAINT comprobante_pagos_metodo_pago_check
    CHECK (metodo_pago IN ('efectivo','transferencia','credito','cheque','otros','tarjeta'));

-- Verificar
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'comprobante_pagos_metodo_pago_check';
-- =====================================================
