/*
  # Fix articulos table primary key to support multi-tenant

  ## Problem
  Current primary key is only `id` (article code), which prevents the same
  article code from existing in different companies.

  ## Solution
  Change primary key to composite: (id, empresa_id)
  This allows the same article code to exist in multiple companies.

  ## Changes
  1. Drop existing primary key constraint on articulos
  2. Make empresa_id NOT NULL (required for primary key)
  3. Create new composite primary key on (id, empresa_id)
  4. Update foreign key references in proforma_detalle
  5. Add empresa_id to proforma_detalle to complete the relationship

  ## Important Notes
  - Articles are now scoped per company
  - Same article code can exist in different companies
  - Deleting an article only affects one company
*/

-- First, check if proforma_detalle has empresa_id, if not add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_detalle' AND column_name = 'empresa_id'
  ) THEN
    ALTER TABLE proforma_detalle ADD COLUMN empresa_id uuid;

    -- Populate empresa_id in proforma_detalle from proforma_cabecera
    UPDATE proforma_detalle pd
    SET empresa_id = pc.empresa_id
    FROM proforma_cabecera pc
    WHERE pd.proforma_id = pc.id;

    -- Make it NOT NULL after population
    ALTER TABLE proforma_detalle ALTER COLUMN empresa_id SET NOT NULL;
  END IF;
END $$;

-- Drop the foreign key constraint on proforma_detalle.articulo_id if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'proforma_detalle_articulo_id_fkey'
    AND table_name = 'proforma_detalle'
  ) THEN
    ALTER TABLE proforma_detalle DROP CONSTRAINT proforma_detalle_articulo_id_fkey;
  END IF;
END $$;

-- Drop the primary key constraint on articulos
ALTER TABLE articulos DROP CONSTRAINT IF EXISTS articulos_pkey;

-- Make empresa_id NOT NULL (required for primary key)
UPDATE articulos SET empresa_id = (SELECT id FROM empresas LIMIT 1) WHERE empresa_id IS NULL;
ALTER TABLE articulos ALTER COLUMN empresa_id SET NOT NULL;

-- Create new composite primary key
ALTER TABLE articulos ADD PRIMARY KEY (id, empresa_id);

-- Add foreign key constraint back to proforma_detalle with composite key
ALTER TABLE proforma_detalle
  ADD CONSTRAINT proforma_detalle_articulo_fkey
  FOREIGN KEY (articulo_id, empresa_id)
  REFERENCES articulos(id, empresa_id)
  ON DELETE RESTRICT;

-- Create index for better performance on lookups by empresa_id
DROP INDEX IF EXISTS idx_articulos_empresa_id;
CREATE INDEX idx_articulos_empresa_id ON articulos(empresa_id);

-- Create index on proforma_detalle for the composite foreign key
CREATE INDEX IF NOT EXISTS idx_proforma_detalle_articulo_empresa
  ON proforma_detalle(articulo_id, empresa_id);
