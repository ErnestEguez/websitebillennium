/*
  # Implement Multi-tenant Architecture

  1. New Tables
    - `empresas` - Master table for companies
      - `id` (uuid, primary key)
      - `ruc` (text, unique)
      - `nombre_comercial` (text)
      - `representante_legal` (text)
      - `direccion` (text)
      - `telefonos` (text)
      - `correos` (text)
      - `activo` (boolean)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Changes to Existing Tables
    - Drop old `empresa` table (was single-row config)
    - Add `empresa_id` to: vendedores, proformas_cabecera, articulos, clientes
  
  3. Security
    - Enable RLS on empresas table
    - Update all RLS policies to filter by empresa_id
    - Users can only see data from their own empresa
*/

-- Drop old empresa table
DROP TABLE IF EXISTS empresa CASCADE;

-- Create new empresas table (multi-tenant)
CREATE TABLE IF NOT EXISTS empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruc varchar(13) UNIQUE NOT NULL,
  nombre_comercial text NOT NULL,
  representante_legal text NOT NULL,
  direccion text NOT NULL,
  telefonos text NOT NULL,
  correos text NOT NULL,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;

-- Add empresa_id to vendedores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendedores' AND column_name = 'empresa_id'
  ) THEN
    ALTER TABLE vendedores ADD COLUMN empresa_id uuid REFERENCES empresas(id);
  END IF;
END $$;

-- Add empresa_id to proforma_cabecera
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_cabecera' AND column_name = 'empresa_id'
  ) THEN
    ALTER TABLE proforma_cabecera ADD COLUMN empresa_id uuid REFERENCES empresas(id);
  END IF;
END $$;

-- Add empresa_id to articulos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'articulos' AND column_name = 'empresa_id'
  ) THEN
    ALTER TABLE articulos ADD COLUMN empresa_id uuid REFERENCES empresas(id);
  END IF;
END $$;

-- Add empresa_id to clientes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'empresa_id'
  ) THEN
    ALTER TABLE clientes ADD COLUMN empresa_id uuid REFERENCES empresas(id);
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_vendedores_empresa_id ON vendedores(empresa_id);
CREATE INDEX IF NOT EXISTS idx_proforma_cabecera_empresa_id ON proforma_cabecera(empresa_id);
CREATE INDEX IF NOT EXISTS idx_articulos_empresa_id ON articulos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_id ON clientes(empresa_id);

-- RLS Policies for empresas table
CREATE POLICY "Users can read own empresa"
  ON empresas FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    )
  );

CREATE POLICY "Authenticated users can insert empresas"
  ON empresas FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Drop old RLS policies
DROP POLICY IF EXISTS "Users can read all vendedores" ON vendedores;
DROP POLICY IF EXISTS "Users can update own vendedor profile" ON vendedores;
DROP POLICY IF EXISTS "Users can insert own vendedor profile" ON vendedores;
DROP POLICY IF EXISTS "Users can read own proformas" ON proforma_cabecera;
DROP POLICY IF EXISTS "Users can insert own proformas" ON proforma_cabecera;
DROP POLICY IF EXISTS "Users can update own proformas" ON proforma_cabecera;
DROP POLICY IF EXISTS "Users can delete own proformas" ON proforma_cabecera;
DROP POLICY IF EXISTS "Users can read own proforma details" ON proforma_detalle;
DROP POLICY IF EXISTS "Users can insert own proforma details" ON proforma_detalle;
DROP POLICY IF EXISTS "Users can update own proforma details" ON proforma_detalle;
DROP POLICY IF EXISTS "Users can delete own proforma details" ON proforma_detalle;
DROP POLICY IF EXISTS "Authenticated users can read articulos" ON articulos;
DROP POLICY IF EXISTS "Authenticated users can read clientes" ON clientes;
DROP POLICY IF EXISTS "Authenticated users can insert clientes" ON clientes;
DROP POLICY IF EXISTS "Authenticated users can update clientes" ON clientes;

-- New RLS Policies for vendedores (multi-tenant)
CREATE POLICY "Users can read vendedores from own empresa"
  ON vendedores FOR SELECT
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own vendedor profile"
  ON vendedores FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = id)
  WITH CHECK (auth.uid()::text = id);

CREATE POLICY "Users can insert vendedor with empresa"
  ON vendedores FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = id);

-- New RLS Policies for proforma_cabecera (multi-tenant)
CREATE POLICY "Users can read own empresa proformas"
  ON proforma_cabecera FOR SELECT
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert proformas for own empresa"
  ON proforma_cabecera FOR INSERT
  TO authenticated
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    ) AND auth.uid()::text = vendedor_id
  );

CREATE POLICY "Users can update own empresa proformas"
  ON proforma_cabecera FOR UPDATE
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    ) AND auth.uid()::text = vendedor_id
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    ) AND auth.uid()::text = vendedor_id
  );

CREATE POLICY "Users can delete own empresa proformas"
  ON proforma_cabecera FOR DELETE
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    ) AND auth.uid()::text = vendedor_id
  );

-- New RLS Policies for proforma_detalle (multi-tenant)
CREATE POLICY "Users can read own empresa proforma details"
  ON proforma_detalle FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proforma_cabecera pc
      INNER JOIN vendedores v ON v.id = auth.uid()::text
      WHERE pc.id = proforma_detalle.proforma_id
      AND pc.empresa_id = v.empresa_id
    )
  );

CREATE POLICY "Users can insert own empresa proforma details"
  ON proforma_detalle FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proforma_cabecera pc
      INNER JOIN vendedores v ON v.id = auth.uid()::text
      WHERE pc.id = proforma_detalle.proforma_id
      AND pc.empresa_id = v.empresa_id
      AND pc.vendedor_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own empresa proforma details"
  ON proforma_detalle FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proforma_cabecera pc
      INNER JOIN vendedores v ON v.id = auth.uid()::text
      WHERE pc.id = proforma_detalle.proforma_id
      AND pc.empresa_id = v.empresa_id
      AND pc.vendedor_id = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proforma_cabecera pc
      INNER JOIN vendedores v ON v.id = auth.uid()::text
      WHERE pc.id = proforma_detalle.proforma_id
      AND pc.empresa_id = v.empresa_id
      AND pc.vendedor_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own empresa proforma details"
  ON proforma_detalle FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proforma_cabecera pc
      INNER JOIN vendedores v ON v.id = auth.uid()::text
      WHERE pc.id = proforma_detalle.proforma_id
      AND pc.empresa_id = v.empresa_id
      AND pc.vendedor_id = auth.uid()::text
    )
  );

-- New RLS Policies for articulos (multi-tenant)
CREATE POLICY "Users can read own empresa articulos"
  ON articulos FOR SELECT
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert articulos for own empresa"
  ON articulos FOR INSERT
  TO authenticated
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own empresa articulos"
  ON articulos FOR UPDATE
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own empresa articulos"
  ON articulos FOR DELETE
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    )
  );

-- New RLS Policies for clientes (multi-tenant)
CREATE POLICY "Users can read own empresa clientes"
  ON clientes FOR SELECT
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert clientes for own empresa"
  ON clientes FOR INSERT
  TO authenticated
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own empresa clientes"
  ON clientes FOR UPDATE
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own empresa clientes"
  ON clientes FOR DELETE
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM vendedores 
      WHERE id = auth.uid()::text
    )
  );
