/*
  # Add Payment Method and Observations Fields

  1. Changes to Tables
    - `proforma_cabecera`
      - Add `forma_pago` (text) - Payment method description
      - Add `observaciones` (text) - Additional observations or notes

  2. Notes
    - These fields are optional and will store important information for the proforma
    - Will be included in PDF generation
*/

-- Add forma_pago field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_cabecera' AND column_name = 'forma_pago'
  ) THEN
    ALTER TABLE proforma_cabecera ADD COLUMN forma_pago text;
  END IF;
END $$;

-- Add observaciones field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_cabecera' AND column_name = 'observaciones'
  ) THEN
    ALTER TABLE proforma_cabecera ADD COLUMN observaciones text;
  END IF;
END $$;
