-- =====================================================
-- FIX RLS INSERT POLICY FOR ADMIN_PLATAFORMA
-- =====================================================
-- This script updates the INSERT policy to allow admin to create users

-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "profiles_insert_policy" ON profiles;

-- Create new INSERT policy that allows:
-- 1. Users to insert their own profile during registration
-- 2. Admin_plataforma to insert ANY profile (for creating Oficina users)
CREATE POLICY "profiles_insert_policy"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = id 
    OR 
    is_admin_plataforma()
);

-- =====================================================
-- VERIFICATION
-- =====================================================
-- This should now allow admin_plataforma to create Oficina users
-- for any empresa
