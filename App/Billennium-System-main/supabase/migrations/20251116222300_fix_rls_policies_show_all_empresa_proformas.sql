/*
  # Fix RLS policies to show all company proformas

  1. Changes
    - Update proforma policies to show ALL proformas from user's empresa
    - Not just the ones they created
    - This allows viewing all company proformas regardless of who created them
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read own empresa proformas" ON proforma_cabecera;
DROP POLICY IF EXISTS "Users can insert proformas for own empresa" ON proforma_cabecera;
DROP POLICY IF EXISTS "Users can update own empresa proformas" ON proforma_cabecera;
DROP POLICY IF EXISTS "Users can delete own empresa proformas" ON proforma_cabecera;

-- New policies: Allow viewing ALL proformas from their empresa
CREATE POLICY "Users can read all proformas from own empresa"
  ON proforma_cabecera FOR SELECT
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert proformas for own empresa"
  ON proforma_cabecera FOR INSERT
  TO authenticated
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    ) AND auth.uid()::text = vendedor_id
  );

CREATE POLICY "Users can update proformas from own empresa"
  ON proforma_cabecera FOR UPDATE
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete proformas from own empresa"
  ON proforma_cabecera FOR DELETE
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    )
  );
