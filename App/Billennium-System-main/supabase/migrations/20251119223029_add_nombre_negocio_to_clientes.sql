/*
  # Add nombre_negocio field to clientes table

  1. Changes
    - Add `nombre_negocio` column to `clientes` table
      - Type: text
      - Optional field (can be NULL)
      - Allows storing business name separate from client name
  
  2. Notes
    - This field is optional to maintain compatibility with existing records
    - Business name can be used for invoicing while keeping individual client name
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'nombre_negocio'
  ) THEN
    ALTER TABLE clientes ADD COLUMN nombre_negocio text;
  END IF;
END $$;