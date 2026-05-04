/*
  # Add logo URL field to empresas table

  ## Changes
  1. Add logo_url column to empresas table
     - Type: TEXT (will store URL to logo image)
     - Nullable: YES (optional field)
  
  ## Usage
  - Admins can upload logos for their empresas
  - Logos will be used in proformas and reports
*/

-- Add logo_url column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'empresas' AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE empresas ADD COLUMN logo_url TEXT;
  END IF;
END $$;
