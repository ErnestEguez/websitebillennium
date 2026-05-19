-- This script fixes the infinite recursion error in the profiles table
-- by removing circular dependencies in RLS policies

-- =====================================================
-- STEP 1: DROP ALL EXISTING POLICIES ON PROFILES TABLE
-- =====================================================
-- This dynamic approach drops ALL policies regardless of their names

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
-- STEP 2: CREATE SIMPLE, NON-RECURSIVE POLICIES
-- =====================================================

-- Allow users to read their own profile (using auth.uid() directly - NO JOIN)
CREATE POLICY "profiles_select_own"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Allow users to update their own profile (using auth.uid() directly - NO JOIN)
CREATE POLICY "profiles_update_own"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Allow authenticated users to insert their own profile during registration
CREATE POLICY "profiles_insert_own"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Optional: Allow service role full access (for admin operations)
CREATE POLICY "profiles_service_role_all"
ON profiles FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =====================================================
-- STEP 3: VERIFY RLS IS ENABLED
-- =====================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- STEP 4: DROP ALL EXISTING POLICIES ON EMPRESAS TABLE
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
-- STEP 5: CREATE SIMPLE POLICIES FOR EMPRESAS
-- =====================================================

-- Users can view their own empresa (via their profile's empresa_id)
-- This uses a subquery but NOT a recursive join
CREATE POLICY "empresas_select_own"
ON empresas FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT empresa_id 
    FROM profiles 
    WHERE id = auth.uid()
  )
);

-- Only service role can insert/update/delete empresas
CREATE POLICY "empresas_service_role_all"
ON empresas FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these to verify the policies are working:

-- Check all policies on profiles
-- SELECT * FROM pg_policies WHERE tablename = 'profiles';

-- Check all policies on empresas
-- SELECT * FROM pg_policies WHERE tablename = 'empresas';
