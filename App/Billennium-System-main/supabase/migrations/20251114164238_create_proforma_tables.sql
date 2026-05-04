/*
  # Sistema de Proformas - Base de Datos en la Nube

  ## Tablas Creadas
  
  ### 1. vendedores
  - `id` (text, primary key) - Código del vendedor
  - `nombre` (text) - Nombre completo del vendedor
  - `email` (text) - Email del vendedor
  - `activo` (boolean) - Si el vendedor está activo
  - `created_at` (timestamptz) - Fecha de creación
  - `updated_at` (timestamptz) - Última actualización

  ### 2. articulos
  - `id` (text, primary key) - Código del artículo
  - `descripcion` (text) - Descripción del artículo
  - `precio` (numeric) - Precio de venta
  - `costo` (numeric) - Costo del artículo
  - `stock` (numeric) - Stock disponible
  - `activo` (boolean) - Si el artículo está activo
  - `created_at` (timestamptz) - Fecha de creación
  - `updated_at` (timestamptz) - Última actualización

  ### 3. proforma_cabecera
  - `id` (uuid, primary key) - ID único de la proforma
  - `numero` (text) - Número de proforma (generado)
  - `ruc_cliente` (text) - RUC del cliente
  - `nombre_cliente` (text) - Nombre del cliente
  - `vendedor_id` (text, foreign key) - ID del vendedor
  - `subtotal` (numeric) - Subtotal de la proforma
  - `total` (numeric) - Total de la proforma
  - `estado` (text) - Estado: PENDIENTE, PROCESADA
  - `sincronizada` (boolean) - Si ya fue sincronizada al ERP
  - `created_at` (timestamptz) - Fecha de creación
  - `updated_at` (timestamptz) - Última actualización

  ### 4. proforma_detalle
  - `id` (uuid, primary key) - ID único del detalle
  - `proforma_id` (uuid, foreign key) - ID de la proforma cabecera
  - `articulo_id` (text, foreign key) - ID del artículo
  - `descripcion` (text) - Descripción del artículo
  - `cantidad` (numeric) - Cantidad
  - `precio` (numeric) - Precio unitario
  - `costo` (numeric) - Costo unitario
  - `subtotal` (numeric) - Subtotal de la línea
  - `utilidad_porcentaje` (numeric) - Porcentaje de utilidad

  ## Seguridad
  - RLS habilitado en todas las tablas
  - Políticas para permitir lectura/escritura desde la aplicación
*/

-- Tabla de Vendedores
CREATE TABLE IF NOT EXISTS vendedores (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  email text,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE vendedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to vendedores"
  ON vendedores FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert to vendedores"
  ON vendedores FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update to vendedores"
  ON vendedores FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Tabla de Artículos
CREATE TABLE IF NOT EXISTS articulos (
  id text PRIMARY KEY,
  descripcion text NOT NULL,
  precio numeric(18, 2) DEFAULT 0,
  costo numeric(18, 2) DEFAULT 0,
  stock numeric(18, 2) DEFAULT 0,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE articulos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to articulos"
  ON articulos FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert to articulos"
  ON articulos FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update to articulos"
  ON articulos FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Tabla de Proforma Cabecera
CREATE TABLE IF NOT EXISTS proforma_cabecera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text UNIQUE,
  ruc_cliente text NOT NULL,
  nombre_cliente text NOT NULL,
  vendedor_id text REFERENCES vendedores(id),
  subtotal numeric(18, 2) DEFAULT 0,
  total numeric(18, 2) DEFAULT 0,
  estado text DEFAULT 'PENDIENTE',
  sincronizada boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE proforma_cabecera ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to proforma_cabecera"
  ON proforma_cabecera FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert to proforma_cabecera"
  ON proforma_cabecera FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update to proforma_cabecera"
  ON proforma_cabecera FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Tabla de Proforma Detalle
CREATE TABLE IF NOT EXISTS proforma_detalle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proforma_id uuid REFERENCES proforma_cabecera(id) ON DELETE CASCADE,
  articulo_id text REFERENCES articulos(id),
  descripcion text NOT NULL,
  cantidad numeric(18, 2) NOT NULL,
  precio numeric(18, 2) NOT NULL,
  costo numeric(18, 2) NOT NULL,
  subtotal numeric(18, 2) NOT NULL,
  utilidad_porcentaje numeric(18, 2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE proforma_detalle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to proforma_detalle"
  ON proforma_detalle FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert to proforma_detalle"
  ON proforma_detalle FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update to proforma_detalle"
  ON proforma_detalle FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_articulos_descripcion ON articulos(descripcion);
CREATE INDEX IF NOT EXISTS idx_proforma_cabecera_sincronizada ON proforma_cabecera(sincronizada);
CREATE INDEX IF NOT EXISTS idx_proforma_cabecera_created ON proforma_cabecera(created_at);
CREATE INDEX IF NOT EXISTS idx_proforma_detalle_proforma_id ON proforma_detalle(proforma_id);

-- Función para generar número de proforma
CREATE OR REPLACE FUNCTION generar_numero_proforma()
RETURNS text AS $$
DECLARE
  nuevo_numero text;
  contador integer;
BEGIN
  SELECT COUNT(*) + 1 INTO contador FROM proforma_cabecera;
  nuevo_numero := 'PRO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(contador::text, 4, '0');
  RETURN nuevo_numero;
END;
$$ LANGUAGE plpgsql;