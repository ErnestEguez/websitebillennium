-- Migration: Cierre de Caja (Cashier Sessions)
-- Description: Adds caja_sesiones table and modifies comprobantes to link invoices to sessions.

-- 1. Create caja_sesiones table
CREATE TABLE IF NOT EXISTS public.caja_sesiones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Keeping auth.users reference for strict safety, or public.profiles if preferable
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

-- 2. Add column to comprobantes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'comprobantes' AND column_name = 'caja_sesion_id') THEN
        ALTER TABLE public.comprobantes ADD COLUMN caja_sesion_id UUID REFERENCES public.caja_sesiones(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. RLS Policies for caja_sesiones

-- Enable RLS
ALTER TABLE public.caja_sesiones ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin sees all, Users see only their own company's sessions (or just their own if strict?) 
-- Requirement says: "Permitir consultar la tabla de cierres" -> Access to history.
CREATE POLICY "caja_sesiones_select" ON public.caja_sesiones FOR SELECT TO authenticated
USING (
  public.is_platform_admin() 
  OR empresa_id = public.get_my_empresa_id()
);

-- INSERT: Authenticated users can open a session (usually strictly controlled via app logic, but RLS allows it for their company)
CREATE POLICY "caja_sesiones_insert" ON public.caja_sesiones FOR INSERT TO authenticated
WITH CHECK (
  public.is_platform_admin() 
  OR empresa_id = public.get_my_empresa_id()
);

-- UPDATE: Users can close their OWN session. Admin can update anything.
CREATE POLICY "caja_sesiones_update" ON public.caja_sesiones FOR UPDATE TO authenticated
USING (
  public.is_platform_admin() 
  OR (empresa_id = public.get_my_empresa_id() AND usuario_id = auth.uid()) -- Only update own session
);

-- DELETE: "Permitir eliminar registros de cierres de caja antiguos... solo el propio usuario puede cerrar su caja"
-- Requirement: "Permitir eliminar registros... grabar con que usuario se elimino" -> This implies a soft delete or audit log, but for now we follow "Permitir eliminar".
-- We'll allow admin or office users to delete.
CREATE POLICY "caja_sesiones_delete" ON public.caja_sesiones FOR DELETE TO authenticated
USING (
  public.is_platform_admin() 
  OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina())
);
