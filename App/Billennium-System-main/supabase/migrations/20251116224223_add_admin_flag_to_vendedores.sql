/*
  # Add admin flag to vendedores

  1. Changes
    - Add is_admin column to vendedores table
    - Update RLS policies to allow admin access

  2. Security
    - Admin can view and modify all data
    - Regular users only see their empresa data
*/

-- Add is_admin column to vendedores
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Update RLS policies for admin access
DROP POLICY IF EXISTS "Authenticated users can view all active empresas" ON empresas;
DROP POLICY IF EXISTS "Users can read own empresa" ON empresas;
DROP POLICY IF EXISTS "Authenticated users can insert empresas" ON empresas;

CREATE POLICY "Admin can view all empresas or users can view own"
  ON empresas FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM vendedores WHERE vendedores.id = auth.uid()::text AND vendedores.is_admin = true)
    OR id IN (SELECT empresa_id FROM vendedores WHERE vendedores.id = auth.uid()::text)
  );

CREATE POLICY "Admin can insert empresas"
  ON empresas FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM vendedores WHERE vendedores.id = auth.uid()::text AND vendedores.is_admin = true)
  );

CREATE POLICY "Admin can update empresas"
  ON empresas FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM vendedores WHERE vendedores.id = auth.uid()::text AND vendedores.is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM vendedores WHERE vendedores.id = auth.uid()::text AND vendedores.is_admin = true)
  );

-- Update vendedores policies for admin
DROP POLICY IF EXISTS "Users can read own vendedor data" ON vendedores;

CREATE POLICY "Users can read own data or admin can read all"
  ON vendedores FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()::text 
    OR EXISTS (SELECT 1 FROM vendedores WHERE vendedores.id = auth.uid()::text AND vendedores.is_admin = true)
  );

CREATE POLICY "Admin can insert vendedores"
  ON vendedores FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM vendedores WHERE vendedores.id = auth.uid()::text AND vendedores.is_admin = true)
  );

CREATE POLICY "Admin can update vendedores"
  ON vendedores FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM vendedores WHERE vendedores.id = auth.uid()::text AND vendedores.is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM vendedores WHERE vendedores.id = auth.uid()::text AND vendedores.is_admin = true)
  );

CREATE POLICY "Admin can delete vendedores"
  ON vendedores FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM vendedores WHERE vendedores.id = auth.uid()::text AND vendedores.is_admin = true)
  );
