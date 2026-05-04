/*
  # Remove conflicting PUBLIC policies from proforma_detalle
  
  1. Changes
    - Drop all PUBLIC policies on proforma_detalle table
    - These policies were allowing unrestricted access and causing duplicates
    - Keep only the empresa-scoped policies with admin support
  
  2. Security
    - Maintains RLS security
    - Only empresa members can access their data
    - Admins can manage all proformas in their empresa
*/

-- Drop all public policies on proforma_detalle
DROP POLICY IF EXISTS "Allow public read access to proforma_detalle" ON proforma_detalle;
DROP POLICY IF EXISTS "Allow public insert to proforma_detalle" ON proforma_detalle;
DROP POLICY IF EXISTS "Allow public update to proforma_detalle" ON proforma_detalle;

-- Verify the remaining policies are correct
-- SELECT: Users can read own empresa proforma details
-- INSERT: Users can insert own empresa proforma details  
-- UPDATE: Users can update empresa proforma details (with admin check)
-- DELETE: Users can delete empresa proforma details (with admin check)
