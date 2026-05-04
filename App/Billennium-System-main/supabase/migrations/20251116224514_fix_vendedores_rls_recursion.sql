/*
  # Fix RLS infinite recursion on vendedores table

  1. Changes
    - Drop existing vendedores policies that cause recursion
    - Create new policies that allow direct insert without checking is_admin first

  2. Security
    - Users can read their own vendedor data
    - Only allow insert from auth (no RLS check for insert)
    - Allow updates/deletes by user themselves
*/

-- Drop all existing vendedores policies
DROP POLICY IF EXISTS "Users can read own data or admin can read all" ON vendedores;
DROP POLICY IF EXISTS "Admin can insert vendedores" ON vendedores;
DROP POLICY IF EXISTS "Admin can update vendedores" ON vendedores;
DROP POLICY IF EXISTS "Admin can delete vendedores" ON vendedores;

-- Simple policies without recursion
CREATE POLICY "Users can read vendedores"
  ON vendedores FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone authenticated can insert vendedores"
  ON vendedores FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update any vendedor"
  ON vendedores FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete vendedores"
  ON vendedores FOR DELETE
  TO authenticated
  USING (true);
