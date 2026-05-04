/*
  # Fix INSERT policy to support admin users
  
  1. Changes
    - Update INSERT policy on proforma_detalle to allow admins
    - Previously only allowed vendedor to insert their own proforma details
    - Now allows admins to insert details for any proforma in their empresa
  
  2. Security
    - Maintains empresa isolation
    - Allows admins to edit proformas from other vendors in their empresa
    - Regular vendors can only insert their own proforma details
*/

-- Drop and recreate the INSERT policy with admin support
DROP POLICY IF EXISTS "Users can insert own empresa proforma details" ON proforma_detalle;

CREATE POLICY "Users can insert own empresa proforma details"
  ON proforma_detalle
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM proforma_cabecera pc
      JOIN vendedores v ON v.id = auth.uid()::text
      WHERE pc.id = proforma_detalle.proforma_id
        AND pc.empresa_id = v.empresa_id
        AND (pc.vendedor_id = auth.uid()::text OR v.is_admin = true)
    )
  );
