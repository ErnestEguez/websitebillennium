-- =====================================================
-- DEFINITIVE RLS FIX (v4 - NO RECURSION)
-- =====================================================

-- 1. DROP EVERYTHING FIRST TO START CLEAN
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE tablename IN ('profiles', 'empresas')) 
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON ' || r.tablename;
    END LOOP;
END $$;

-- 2. HELPER FUNCTION (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Use direct query to profiles table. 
  -- SECURITY DEFINER means this runs as the creator (postgres), bypassing RLS on profiles.
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND rol = 'admin_plataforma'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. PROFILES POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Select: Own profile OR Platform Admin
CREATE POLICY "profiles_select" ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_platform_admin());

-- Insert: Own profile OR Platform Admin
CREATE POLICY "profiles_insert" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (id = auth.uid() OR public.is_platform_admin());

-- Update: Own profile OR Platform Admin
CREATE POLICY "profiles_update" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.is_platform_admin())
WITH CHECK (id = auth.uid() OR public.is_platform_admin());

-- Delete: Platform Admin ONLY
CREATE POLICY "profiles_delete" ON public.profiles
FOR DELETE TO authenticated
USING (public.is_platform_admin());


-- 4. EMPRESAS POLICIES
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

-- Select: My empresa OR Platform Admin
CREATE POLICY "empresas_select" ON public.empresas
FOR SELECT TO authenticated
USING (
  id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid())
  OR public.is_platform_admin()
);

-- Insert: Platform Admin ONLY
CREATE POLICY "empresas_insert" ON public.empresas
FOR INSERT TO authenticated
WITH CHECK (public.is_platform_admin());

-- Update: Platform Admin OR Oficina user of THAT empresa
CREATE POLICY "empresas_update" ON public.empresas
FOR UPDATE TO authenticated
USING (
  (id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid() AND rol = 'oficina'))
  OR public.is_platform_admin()
)
WITH CHECK (
  (id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid() AND rol = 'oficina'))
  OR public.is_platform_admin()
);

-- Delete: Platform Admin ONLY
CREATE POLICY "empresas_delete" ON public.empresas
FOR DELETE TO authenticated
USING (public.is_platform_admin());

-- 5. FINAL CHECK/GRANTS
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.empresas TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.empresas TO service_role;
