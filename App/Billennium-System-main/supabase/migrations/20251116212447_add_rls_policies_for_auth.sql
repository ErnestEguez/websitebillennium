/*
  # Add Row Level Security policies for authenticated users

  1. Changes
    - Add RLS policies to allow users to only see their own proformas
    - Add policies for vendedores table
    - Add policies for articulos table (shared across all users)
    - Add policies for clientes table (shared across all users)
    - Add policies for empresa table (shared across all users)
  
  2. Security
    - Users can only insert/update/delete their own proformas
    - Users can read all vendedores but only update their own profile
    - All users can read articulos, clientes, and empresa data
    - Only authenticated users can access the system
*/

-- Policies for vendedores table
CREATE POLICY "Users can read all vendedores"
  ON vendedores FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own vendedor profile"
  ON vendedores FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = id)
  WITH CHECK (auth.uid()::text = id);

CREATE POLICY "Users can insert own vendedor profile"
  ON vendedores FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = id);

-- Policies for proforma_cabecera table
CREATE POLICY "Users can read own proformas"
  ON proforma_cabecera FOR SELECT
  TO authenticated
  USING (auth.uid()::text = vendedor_id);

CREATE POLICY "Users can insert own proformas"
  ON proforma_cabecera FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = vendedor_id);

CREATE POLICY "Users can update own proformas"
  ON proforma_cabecera FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = vendedor_id)
  WITH CHECK (auth.uid()::text = vendedor_id);

CREATE POLICY "Users can delete own proformas"
  ON proforma_cabecera FOR DELETE
  TO authenticated
  USING (auth.uid()::text = vendedor_id);

-- Policies for proforma_detalle table
CREATE POLICY "Users can read own proforma details"
  ON proforma_detalle FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proforma_cabecera
      WHERE proforma_cabecera.id = proforma_detalle.proforma_id
      AND proforma_cabecera.vendedor_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert own proforma details"
  ON proforma_detalle FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proforma_cabecera
      WHERE proforma_cabecera.id = proforma_detalle.proforma_id
      AND proforma_cabecera.vendedor_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own proforma details"
  ON proforma_detalle FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proforma_cabecera
      WHERE proforma_cabecera.id = proforma_detalle.proforma_id
      AND proforma_cabecera.vendedor_id = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proforma_cabecera
      WHERE proforma_cabecera.id = proforma_detalle.proforma_id
      AND proforma_cabecera.vendedor_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own proforma details"
  ON proforma_detalle FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proforma_cabecera
      WHERE proforma_cabecera.id = proforma_detalle.proforma_id
      AND proforma_cabecera.vendedor_id = auth.uid()::text
    )
  );

-- Policies for articulos table (shared resource)
CREATE POLICY "Authenticated users can read articulos"
  ON articulos FOR SELECT
  TO authenticated
  USING (true);

-- Policies for clientes table (shared resource)
CREATE POLICY "Authenticated users can read clientes"
  ON clientes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert clientes"
  ON clientes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update clientes"
  ON clientes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policies for empresa table (shared resource)
CREATE POLICY "Authenticated users can read empresa"
  ON empresa FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update empresa"
  ON empresa FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
