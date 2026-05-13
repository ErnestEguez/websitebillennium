-- =====================================================
-- FIX RLS POLICIES - AVOID CIRCULAR RECURSION
-- =====================================================
-- This script creates a helper function to check admin role
-- WITHOUT causing circular dependencies

-- =====================================================
-- STEP 1: CREATE HELPER FUNCTION (NO RECURSION)
-- =====================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS is_admin_plataforma();

-- Create function to check if current user is admin_plataforma
-- This function uses a SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION is_admin_plataforma()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM profiles 
        WHERE id = auth.uid() 
        AND rol = 'admin_plataforma'
    );
END;
$$;

-- =====================================================
-- STEP 2: DROP ALL EXISTING POLICIES ON PROFILES
-- =====================================================

DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'profiles') 
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON profiles';
    END LOOP;
END $$;

-- =====================================================
-- STEP 3: CREATE POLICIES FOR PROFILES (NO RECURSION)
-- =====================================================

-- Allow users to read their own profile OR admin to read ALL
CREATE POLICY "profiles_select_policy"
ON profiles FOR SELECT
TO authenticated
USING (
    auth.uid() = id 
    OR 
    is_admin_plataforma()
);

-- Allow users to update their own profile OR admin to update ALL
CREATE POLICY "profiles_update_policy"
ON profiles FOR UPDATE
TO authenticated
USING (
    auth.uid() = id 
    OR 
    is_admin_plataforma()
)
WITH CHECK (
    auth.uid() = id 
    OR 
    is_admin_plataforma()
);

-- Allow authenticated users to insert their own profile
CREATE POLICY "profiles_insert_policy"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = id 
    OR 
    is_admin_plataforma()
);

-- Allow admin to delete profiles
CREATE POLICY "profiles_delete_policy"
ON profiles FOR DELETE
TO authenticated
USING (is_admin_plataforma());

-- Ensure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 4: DROP ALL EXISTING POLICIES ON EMPRESAS
-- =====================================================

DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'empresas') 
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON empresas';
    END LOOP;
END $$;

-- =====================================================
-- STEP 5: CREATE POLICIES FOR EMPRESAS (NO RECURSION)
-- =====================================================

-- Allow users to see their own empresa OR admin to see ALL
CREATE POLICY "empresas_select_policy"
ON empresas FOR SELECT
TO authenticated
USING (
    id IN (
        SELECT empresa_id 
        FROM profiles 
        WHERE id = auth.uid()
    )
    OR
    is_admin_plataforma()
);

-- Allow admin and oficina to insert empresas
CREATE POLICY "empresas_insert_policy"
ON empresas FOR INSERT
TO authenticated
WITH CHECK (is_admin_plataforma());

-- Allow empresa admins and platform admin to update
CREATE POLICY "empresas_update_policy"
ON empresas FOR UPDATE
TO authenticated
USING (
    id IN (
        SELECT empresa_id 
        FROM profiles 
        WHERE id = auth.uid()
        AND rol IN ('oficina', 'admin_plataforma')
    )
    OR
    is_admin_plataforma()
)
WITH CHECK (
    id IN (
        SELECT empresa_id 
        FROM profiles 
        WHERE id = auth.uid()
        AND rol IN ('oficina', 'admin_plataforma')
    )
    OR
    is_admin_plataforma()
);

-- Allow admin to delete empresas
CREATE POLICY "empresas_delete_policy"
ON empresas FOR DELETE
TO authenticated
USING (is_admin_plataforma());

-- Ensure RLS is enabled
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these to verify:
-- SELECT * FROM pg_policies WHERE tablename = 'profiles';
-- SELECT * FROM pg_policies WHERE tablename = 'empresas';
-- SELECT is_admin_plataforma(); -- Should return true if you're admin
