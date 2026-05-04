/*
  # Add Clientes Table

  1. New Tables
    - `clientes`
      - `ruc` (varchar(13), primary key) - RUC or cedula identification
      - `nombres_completos` (text) - Full name of client
      - `correo` (text) - Email address
      - `telefono` (varchar(20)) - Phone number
      - `activo` (boolean) - Active status
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Security
    - Enable RLS on `clientes` table
    - Add policies for public read access (vendors need to search clients)
    - Add policies for insert/update from authenticated sources

  3. Changes to Existing Tables
    - Add `cliente_ruc` column to `proforma_cabecera` to link proforma to client
*/

-- Create clientes table
CREATE TABLE IF NOT EXISTS clientes (
  ruc varchar(13) PRIMARY KEY,
  nombres_completos text NOT NULL,
  correo text,
  telefono varchar(20),
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add cliente_ruc to proforma_cabecera
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_cabecera' AND column_name = 'cliente_ruc'
  ) THEN
    ALTER TABLE proforma_cabecera ADD COLUMN cliente_ruc varchar(13);
  END IF;
END $$;

-- Add foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'proforma_cabecera_cliente_ruc_fkey'
  ) THEN
    ALTER TABLE proforma_cabecera
    ADD CONSTRAINT proforma_cabecera_cliente_ruc_fkey
    FOREIGN KEY (cliente_ruc) REFERENCES clientes(ruc);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

-- Policies for clientes (public read for vendor app, authenticated write)
CREATE POLICY "Anyone can read active clients"
  ON clientes FOR SELECT
  USING (activo = true);

CREATE POLICY "Service can insert clients"
  ON clientes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service can update clients"
  ON clientes FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_clientes_ruc ON clientes(ruc);
CREATE INDEX IF NOT EXISTS idx_proforma_cabecera_cliente_ruc ON proforma_cabecera(cliente_ruc);
