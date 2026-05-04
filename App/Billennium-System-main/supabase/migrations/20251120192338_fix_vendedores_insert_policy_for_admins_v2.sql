/*
  # Fix vendedores INSERT policy to allow admins

  ## Problem
  Current INSERT policy on vendedores uses `WITH CHECK (true)` which should allow
  inserts, but admins are getting "user not allowed" errors when trying to create
  new vendedores.

  ## Solution
  Replace the existing policies with proper admin-aware policies that check:
  1. User is authenticated
  2. User exists in vendedores table with is_admin = true

  ## Changes
  1. Drop all existing vendedores policies
  2. Create new policies for SELECT, INSERT, UPDATE, DELETE
  3. All operations require the user to be an admin (is_admin = true)
  
  ## Important Note
  - vendedores.id is TEXT type (user_id from auth.users)
  - auth.uid() returns UUID, so we cast it to TEXT for comparison
*/

-- Drop all existing policies on vendedores
DROP POLICY IF EXISTS "vendedores_select_policy" ON vendedores;
DROP POLICY IF EXISTS "vendedores_insert_policy" ON vendedores;
DROP POLICY IF EXISTS "vendedores_update_policy" ON vendedores;
DROP POLICY IF EXISTS "vendedores_delete_policy" ON vendedores;

-- SELECT: Admins can view all vendedores, non-admins can only view themselves
CREATE POLICY "Admins can view all vendedores"
  ON vendedores FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vendedores v
      WHERE v.id = auth.uid()::text
      AND v.is_admin = true
    )
    OR id = auth.uid()::text
  );

-- INSERT: Only admins can create new vendedores
CREATE POLICY "Admins can create vendedores"
  ON vendedores FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vendedores v
      WHERE v.id = auth.uid()::text
      AND v.is_admin = true
    )
  );

-- UPDATE: Only admins can update vendedores
CREATE POLICY "Admins can update vendedores"
  ON vendedores FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vendedores v
      WHERE v.id = auth.uid()::text
      AND v.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vendedores v
      WHERE v.id = auth.uid()::text
      AND v.is_admin = true
    )
  );

-- DELETE: Only admins can delete vendedores
CREATE POLICY "Admins can delete vendedores"
  ON vendedores FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vendedores v
      WHERE v.id = auth.uid()::text
      AND v.is_admin = true
    )
  );
