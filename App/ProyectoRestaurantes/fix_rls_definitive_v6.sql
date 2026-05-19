-- =====================================================
-- DEFINITIVE RLS FIX (v6 - OFICINA PERMISSIONS)
-- =====================================================

-- 1. DROP EVERYTHING FIRST
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE tablename IN ('profiles', 'empresas')) 
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON ' || r.tablename;
    END LOOP;
END $$;

-- 2. HELPER FUNCTIONS (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND rol = 'admin_plataforma'
  );
END;
$$;

-- Helper to get current user's empresa_id securely
CREATE OR REPLACE FUNCTION public.get_my_empresa_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid());
END;
$$;

-- 3. PROFILES POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Select: 
-- 1. Own profile
-- 2. Platform Admin
-- 3. Oficina user of the same company
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid() 
  OR public.is_platform_admin()
  OR (empresa_id = public.get_my_empresa_id() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rol = 'oficina'))
);

-- Insert:
-- 1. Own profile (initial creation)
-- 2. Platform Admin
-- 3. Oficina user of the same company
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
WITH CHECK (
  id = auth.uid() 
  OR public.is_platform_admin()
  OR (empresa_id = public.get_my_empresa_id() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rol = 'oficina'))
);

-- Update:
-- 1. Own profile
-- 2. Platform Admin
-- 3. Oficina user of the same company
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
USING (
  id = auth.uid() 
  OR public.is_platform_admin()
  OR (empresa_id = public.get_my_empresa_id() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rol = 'oficina'))
)
WITH CHECK (
  id = auth.uid() 
  OR public.is_platform_admin()
  OR (empresa_id = public.get_my_empresa_id() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rol = 'oficina'))
);

-- Delete:
-- 1. Platform Admin
-- 2. Oficina user of the same company
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated
USING (
  public.is_platform_admin()
  OR (empresa_id = public.get_my_empresa_id() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rol = 'oficina'))
);


-- 4. EMPRESAS POLICIES
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresas_select" ON public.empresas FOR SELECT TO authenticated
USING (
  public.is_platform_admin()
  OR 
  id = public.get_my_empresa_id()
);

CREATE POLICY "empresas_insert" ON public.empresas FOR INSERT TO authenticated
WITH CHECK (public.is_platform_admin());

CREATE POLICY "empresas_update" ON public.empresas FOR UPDATE TO authenticated
USING (
  public.is_platform_admin()
  OR
  (id = public.get_my_empresa_id() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rol = 'oficina'))
)
WITH CHECK (
  public.is_platform_admin()
  OR
  (id = public.get_my_empresa_id() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rol = 'oficina'))
);

CREATE POLICY "empresas_delete" ON public.empresas FOR DELETE TO authenticated
USING (public.is_platform_admin());

-- 5. GRANTS
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.empresas TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.empresas TO service_role;

-- 6. CACHE FLUSH
NOTIFY pgrst, 'reload schema';
