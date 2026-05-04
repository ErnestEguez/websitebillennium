/*
  # Fix proforma consecutive numbering per empresa

  ## Problem
  Current generar_numero_proforma function generates consecutive numbers globally,
  not per empresa. This causes numbering conflicts when multiple empresas use the system.

  ## Solution
  1. Drop the existing function
  2. Create a new function that accepts empresa_id as parameter
  3. Generate consecutive numbers per empresa

  ## Changes
  - Drop old generar_numero_proforma function
  - Create new generar_numero_proforma(empresa_id UUID) function
  - Numbers will be in format: PRO-YYYYMMDD-XXXX where XXXX is sequential per empresa
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS generar_numero_proforma();

-- Create new function that accepts empresa_id
CREATE OR REPLACE FUNCTION generar_numero_proforma(p_empresa_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  nuevo_numero TEXT;
  contador INTEGER;
BEGIN
  -- Count proformas for this specific empresa
  SELECT COUNT(*) + 1 INTO contador 
  FROM proforma_cabecera 
  WHERE empresa_id = p_empresa_id;
  
  -- Generate number in format PRO-YYYYMMDD-XXXX
  nuevo_numero := 'PRO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(contador::text, 4, '0');
  
  RETURN nuevo_numero;
END;
$$;
