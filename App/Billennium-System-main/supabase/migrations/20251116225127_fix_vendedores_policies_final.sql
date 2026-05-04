/*
  # Fix vendedores RLS policies - remove all recursion

  1. Changes
    - Drop ALL existing vendedores policies
    - Create simple policies that don't reference vendedores table in conditions
    - Allow full access to authenticated users (app-level logic handles admin)

  2. Security
    - All authenticated users can read/write vendedores
    - No recursive checks
    - Admin logic handled in application layer
*/

-- Drop ALL existing policies on vendedores
DROP POLICY IF EXISTS "Users can read vendedores" ON vendedores;
DROP POLICY IF EXISTS "Anyone authenticated can insert vendedores" ON vendedores;
DROP POLICY IF EXISTS "Users can update any vendedor" ON vendedores;
DROP POLICY IF EXISTS "Users can delete vendedores" ON vendedores;

-- Simple non-recursive policies
CREATE POLICY "Allow authenticated users to read vendedores"
  ON vendedores FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert vendedores"
  ON vendedores FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update vendedores"
  ON vendedores FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete vendedores"
  ON vendedores FOR DELETE
  TO authenticated
  USING (true);
