-- =====================================================
-- FIX RLS POLICIES FOR ADMIN_PLATAFORMA
-- =====================================================
-- This script adds policies that allow admin_plataforma to see EVERYTHING

-- =====================================================
-- STEP 1: DROP ALL EXISTING POLICIES ON PROFILES TABLE
-- =====================================================

DO $$ 
DECLARE 
    r RECORD;
BEGIN
    -- Drop all policies on profiles table
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'profiles') 
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON profiles';
    END LOOP;
END $$;

-- =====================================================
-- STEP 2: CREATE POLICIES FOR PROFILES
-- =====================================================

-- Allow users to read their own profile OR admin_plataforma to read ALL
CREATE POLICY "profiles_select_policy"
ON profiles FOR SELECT
TO authenticated
USING (
    auth.uid() = id 
    OR 
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND rol = 'admin_plataforma'
    )
);

-- Allow users to update their own profile OR admin_plataforma to update ALL
CREATE POLICY "profiles_update_policy"
ON profiles FOR UPDATE
TO authenticated
USING (
    auth.uid() = id 
    OR 
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND rol = 'admin_plataforma'
    )
)
WITH CHECK (
    auth.uid() = id 
    OR 
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND rol = 'admin_plataforma'
    )
);

-- Allow authenticated users to insert their own profile during registration
CREATE POLICY "profiles_insert_policy"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Allow admin_plataforma to delete profiles
CREATE POLICY "profiles_delete_policy"
ON profiles FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND rol = 'admin_plataforma'
    )
);

-- Ensure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 3: DROP ALL EXISTING POLICIES ON EMPRESAS TABLE
-- =====================================================

DO $$ 
DECLARE 
    r RECORD;
BEGIN
    -- Drop all policies on empresas table
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'empresas') 
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON empresas';
    END LOOP;
END $$;

-- =====================================================
-- STEP 4: CREATE POLICIES FOR EMPRESAS
-- =====================================================

-- Allow users to see their own empresa OR admin_plataforma to see ALL
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
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND rol = 'admin_plataforma'
    )
);

-- Allow admin_plataforma and oficina to insert empresas
CREATE POLICY "empresas_insert_policy"
ON empresas FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND rol IN ('admin_plataforma', 'oficina')
    )
);

-- Allow users to update their own empresa OR admin_plataforma to update ALL
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
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND rol = 'admin_plataforma'
    )
)
WITH CHECK (
    id IN (
        SELECT empresa_id 
        FROM profiles 
        WHERE id = auth.uid()
        AND rol IN ('oficina', 'admin_plataforma')
    )
    OR
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND rol = 'admin_plataforma'
    )
);

-- Allow admin_plataforma to delete empresas
CREATE POLICY "empresas_delete_policy"
ON empresas FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND rol = 'admin_plataforma'
    )
);

-- Ensure RLS is enabled
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- VERIFICATION
-- =====================================================
-- Run these queries to verify the policies were created:
-- SELECT * FROM pg_policies WHERE tablename = 'profiles';
-- SELECT * FROM pg_policies WHERE tablename = 'empresas';
