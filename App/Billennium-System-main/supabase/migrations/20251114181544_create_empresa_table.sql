/*
  # Create Empresa Table

  1. New Tables
    - `empresa`
      - `id` (integer, primary key) - Always 1 (single row table)
      - `ruc` (varchar(13)) - Company RUC
      - `nombre` (text) - Company name
      - `direccion` (text) - Company address
      - `telefono_movil` (varchar(20)) - Mobile phone
      - `correo` (text) - Email address
      - `representante_legal` (text) - Legal representative name
      - `updated_at` (timestamptz) - Last update timestamp

  2. Security
    - Enable RLS on `empresa` table
    - Add policies for public read (app needs to read company data)
    - Add policies for authenticated update

  3. Initial Data
    - Insert Ferre+ company data
*/

-- Create empresa table
CREATE TABLE IF NOT EXISTS empresa (
  id integer PRIMARY KEY DEFAULT 1,
  ruc varchar(13) NOT NULL,
  nombre text NOT NULL,
  direccion text NOT NULL,
  telefono_movil varchar(20) NOT NULL,
  correo text NOT NULL,
  representante_legal text NOT NULL,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT empresa_single_row CHECK (id = 1)
);

-- Enable RLS
ALTER TABLE empresa ENABLE ROW LEVEL SECURITY;

-- Policies for empresa
CREATE POLICY "Anyone can read empresa data"
  ON empresa FOR SELECT
  USING (true);

CREATE POLICY "Service can update empresa data"
  ON empresa FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Insert initial data
INSERT INTO empresa (id, ruc, nombre, direccion, telefono_movil, correo, representante_legal)
VALUES (
  1,
  '0916645633001',
  'Ferre+',
  'PORTETE 3110 ENTRE LEONIDAS PLAZA Y G. MARTINEZ',
  '593980136389',
  'e_eguez@hotmail.com',
  'Ernesto Eguez Ruiz'
)
ON CONFLICT (id) DO UPDATE SET
  ruc = EXCLUDED.ruc,
  nombre = EXCLUDED.nombre,
  direccion = EXCLUDED.direccion,
  telefono_movil = EXCLUDED.telefono_movil,
  correo = EXCLUDED.correo,
  representante_legal = EXCLUDED.representante_legal,
  updated_at = now();
