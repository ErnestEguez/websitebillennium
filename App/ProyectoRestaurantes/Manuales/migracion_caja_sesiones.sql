-- =====================================================
-- MIGRACIÓN: MÓDULO DE CAJA Y SESIONES
-- Ejecutar este script en el Editor SQL de Supabase
-- =====================================================

-- 1. Crear tabla de sesiones de caja
CREATE TABLE IF NOT EXISTS public.caja_sesiones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    fecha_apertura TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    fecha_cierre TIMESTAMP WITH TIME ZONE,
    base_inicial DECIMAL(12,2) DEFAULT 0,
    total_efectivo DECIMAL(12,2) DEFAULT 0,
    total_tarjetas DECIMAL(12,2) DEFAULT 0,
    total_transferencia DECIMAL(12,2) DEFAULT 0,
    total_otros DECIMAL(12,2) DEFAULT 0,
    total_propina DECIMAL(12,2) DEFAULT 0,
    estado TEXT DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Habilitar RLS
ALTER TABLE public.caja_sesiones ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de Seguridad (RLS)

-- SELECT: Ver sesiones propias O ver todas si es admin/oficina de la misma empresa
CREATE POLICY "caja_sesiones_select" ON public.caja_sesiones FOR SELECT TO authenticated
USING (
  usuario_id = auth.uid() 
  OR public.is_platform_admin() 
  OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina())
);

-- INSERT: Solo el propio usuario puede abrir su caja (o admin/oficina para otros si fuera necesario)
CREATE POLICY "caja_sesiones_insert" ON public.caja_sesiones FOR INSERT TO authenticated
WITH CHECK (
  usuario_id = auth.uid() 
  OR public.is_platform_admin() 
  OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina())
);

-- UPDATE: Un usuario puede cerrar su propia caja (actualizar totales y estado)
CREATE POLICY "caja_sesiones_update" ON public.caja_sesiones FOR UPDATE TO authenticated
USING (
  usuario_id = auth.uid() 
  OR public.is_platform_admin() 
  OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina())
);

-- DELETE: Solo admin o oficina pueden borrar registros históricos
CREATE POLICY "caja_sesiones_delete" ON public.caja_sesiones FOR DELETE TO authenticated
USING (
  public.is_platform_admin() 
  OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina())
);

-- 4. Modificar tabla de comprobantes para vincular sesión (si no se ha hecho manualmente)
-- Esto agrega la columna si no existe
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'comprobantes' AND column_name = 'caja_sesion_id') THEN
        ALTER TABLE public.comprobantes ADD COLUMN caja_sesion_id UUID REFERENCES public.caja_sesiones(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 5. Otorgar permisos
GRANT ALL ON public.caja_sesiones TO postgres;
GRANT ALL ON public.caja_sesiones TO authenticated;
GRANT ALL ON public.caja_sesiones TO service_role;

-- 6. Recargar esquema
NOTIFY pgrst, 'reload schema';
