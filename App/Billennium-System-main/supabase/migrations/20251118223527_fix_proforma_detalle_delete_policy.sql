/*
  # Fix proforma_detalle DELETE policy for admins and editing
  
  1. Changes
    - Drop existing restrictive DELETE policy on proforma_detalle
    - Create new policy that allows DELETE if:
      - User is the vendor who created the proforma, OR
      - User is admin of the same empresa as the proforma
  
  2. Security
    - Maintains empresa isolation
    - Allows admins to manage all proformas in their empresa
    - Allows vendors to delete their own proforma details
*/

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Users can delete own empresa proforma details" ON proforma_detalle;

-- Create new permissive policy for deleting proforma details
CREATE POLICY "Users can delete empresa proforma details"
  ON proforma_detalle FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proforma_cabecera pc
      INNER JOIN vendedores v ON v.id = auth.uid()::text
      WHERE pc.id = proforma_detalle.proforma_id
      AND pc.empresa_id = v.empresa_id
      AND (pc.vendedor_id = auth.uid()::text OR v.is_admin = true)
    )
  );

-- Also fix UPDATE policy for proforma_detalle (same issue)
DROP POLICY IF EXISTS "Users can update own empresa proforma details" ON proforma_detalle;

CREATE POLICY "Users can update empresa proforma details"
  ON proforma_detalle FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proforma_cabecera pc
      INNER JOIN vendedores v ON v.id = auth.uid()::text
      WHERE pc.id = proforma_detalle.proforma_id
      AND pc.empresa_id = v.empresa_id
      AND (pc.vendedor_id = auth.uid()::text OR v.is_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proforma_cabecera pc
      INNER JOIN vendedores v ON v.id = auth.uid()::text
      WHERE pc.id = proforma_detalle.proforma_id
      AND pc.empresa_id = v.empresa_id
      AND (pc.vendedor_id = auth.uid()::text OR v.is_admin = true)
    )
  );
