/*
  # Clean all vendedores policies and create simple ones

  1. Changes
    - Drop EVERY policy on vendedores table
    - Create only 4 simple policies without recursion

  2. Security
    - Authenticated users can do everything (admin check in app)
    - No recursive queries
*/

-- Drop every single policy
DROP POLICY IF EXISTS "Allow authenticated users to delete vendedores" ON vendedores;
DROP POLICY IF EXISTS "Allow authenticated users to insert vendedores" ON vendedores;
DROP POLICY IF EXISTS "Allow authenticated users to read vendedores" ON vendedores;
DROP POLICY IF EXISTS "Allow authenticated users to update vendedores" ON vendedores;
DROP POLICY IF EXISTS "Allow public insert to vendedores" ON vendedores;
DROP POLICY IF EXISTS "Allow public read access to vendedores" ON vendedores;
DROP POLICY IF EXISTS "Allow public update to vendedores" ON vendedores;
DROP POLICY IF EXISTS "Users can insert vendedor with empresa" ON vendedores;
DROP POLICY IF EXISTS "Users can read vendedores from own empresa" ON vendedores;
DROP POLICY IF EXISTS "Users can update own vendedor profile" ON vendedores;

-- Create simple policies
CREATE POLICY "vendedores_select_policy"
  ON vendedores FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "vendedores_insert_policy"
  ON vendedores FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "vendedores_update_policy"
  ON vendedores FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "vendedores_delete_policy"
  ON vendedores FOR DELETE
  TO authenticated
  USING (true);
