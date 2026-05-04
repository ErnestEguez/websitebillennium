/*
  # Remove UNIQUE constraint from proforma numero field

  ## Problem
  The proforma_cabecera table has a UNIQUE constraint on the 'numero' field.
  This prevents multiple empresas from having the same proforma number,
  which is incorrect since each empresa should have independent numbering.

  ## Solution
  Drop the UNIQUE constraint 'proforma_cabecera_numero_key'

  ## Impact
  - Multiple proformas can now have the same numero value
  - This is correct because numbering is independent per empresa
  - The numero field will still exist and work, just without the uniqueness constraint
*/

-- Drop the UNIQUE constraint on numero field
ALTER TABLE proforma_cabecera 
DROP CONSTRAINT IF EXISTS proforma_cabecera_numero_key;
