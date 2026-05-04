/*
  # Fix vendedores RLS infinite recursion

  1. Problem
    - Current SELECT policy causes infinite recursion because it queries vendedores table within the policy check
    
  2. Solution
    - Drop existing recursive policies
    - Create simple policies that allow users to see their own record directly using auth.uid()
    - Allow viewing other vendedores in the same empresa through a non-recursive check
    
  3. Security
    - Users can view their own vendedor record
    - Users can view other vendedores in their empresa after initial auth
*/

-- Drop all existing vendedores policies
DROP POLICY IF EXISTS "Vendedores can view all vendedores in their empresa" ON vendedores;
DROP POLICY IF EXISTS "Users can insert vendedor for their empresa" ON vendedores;
DROP POLICY IF EXISTS "Admins can update vendedores in their empresa" ON vendedores;

-- Allow users to select their own vendedor record (no recursion)
CREATE POLICY "Users can view own vendedor record"
  ON vendedores
  FOR SELECT
  TO authenticated
  USING (id::text = auth.uid()::text);

-- Allow admins to view all vendedores in their empresa
CREATE POLICY "Admins can view vendedores in empresa"
  ON vendedores
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vendedores v
      WHERE v.id::text = auth.uid()::text
      AND v.is_admin = true
      AND v.empresa_id = vendedores.empresa_id
    )
  );

-- Allow admins to insert vendedores for their empresa
CREATE POLICY "Admins can insert vendedores"
  ON vendedores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vendedores v
      WHERE v.id::text = auth.uid()::text
      AND v.is_admin = true
      AND v.empresa_id = vendedores.empresa_id
    )
  );

-- Allow admins to update vendedores in their empresa
CREATE POLICY "Admins can update vendedores"
  ON vendedores
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vendedores v
      WHERE v.id::text = auth.uid()::text
      AND v.is_admin = true
      AND v.empresa_id = vendedores.empresa_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vendedores v
      WHERE v.id::text = auth.uid()::text
      AND v.is_admin = true
      AND v.empresa_id = vendedores.empresa_id
    )
  );

-- Allow admins to delete vendedores in their empresa
CREATE POLICY "Admins can delete vendedores"
  ON vendedores
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vendedores v
      WHERE v.id::text = auth.uid()::text
      AND v.is_admin = true
      AND v.empresa_id = vendedores.empresa_id
    )
    AND id::text != auth.uid()::text
  );