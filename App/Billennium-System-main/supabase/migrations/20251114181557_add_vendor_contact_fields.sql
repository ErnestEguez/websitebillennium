/*
  # Add Contact Fields to Vendedores

  1. Changes to Tables
    - `vendedores`
      - Add `telefono` (varchar(20)) - Vendor phone number
      - Email already exists

  2. Notes
    - These fields will be used as the sender info for WhatsApp and email
*/

-- Add telefono field to vendedores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendedores' AND column_name = 'telefono'
  ) THEN
    ALTER TABLE vendedores ADD COLUMN telefono varchar(20);
  END IF;
END $$;

-- Update existing vendors with sample phone numbers
UPDATE vendedores SET telefono = '593991234567' WHERE id = 'V001' AND telefono IS NULL;
UPDATE vendedores SET telefono = '593987654321' WHERE id = 'V002' AND telefono IS NULL;
