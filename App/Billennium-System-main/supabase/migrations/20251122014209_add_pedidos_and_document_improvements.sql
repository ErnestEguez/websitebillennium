/*
  # Agregar Pedidos y Mejoras a Documentos

  ## Cambios Principales

  1. Nueva Tabla: pedido_cabecera
    - Estructura idéntica a proforma_cabecera
    - Campos: id, numero, fecha, cliente_ruc, vendedor_id, empresa_id, subtotal, impuesto, total
    - Campos adicionales: forma_pago, observaciones
    - Nuevos campos de estado: estado, fecha_autorizacion, autorizada_por

  2. Nueva Tabla: pedido_detalle
    - Detalle de artículos por pedido
    - Estructura idéntica a proforma_detalle

  3. Modificaciones a tabla proforma_cabecera
    - Agregar campo: fecha_autorizacion
    - Agregar campo: autorizada_por

  4. Modificaciones a tabla empresas
    - Agregar campo: habilitar_proformas (boolean, default true)
    - Agregar campo: habilitar_pedidos (boolean, default true)

  5. Seguridad
    - RLS para tabla pedido_cabecera (igual que proforma_cabecera)
    - RLS para tabla pedido_detalle (igual que proforma_detalle)
*/

-- Agregar campos de autorizacion a proforma_cabecera
ALTER TABLE proforma_cabecera 
ADD COLUMN IF NOT EXISTS fecha_autorizacion timestamptz,
ADD COLUMN IF NOT EXISTS autorizada_por text REFERENCES vendedores(id);

-- Agregar campos de habilitación a empresas
ALTER TABLE empresas
ADD COLUMN IF NOT EXISTS habilitar_proformas boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS habilitar_pedidos boolean DEFAULT true;

-- Crear tabla pedido_cabecera (igual estructura que proforma_cabecera)
CREATE TABLE IF NOT EXISTS pedido_cabecera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text,
  ruc_cliente text NOT NULL,
  nombre_cliente text NOT NULL,
  vendedor_id text REFERENCES vendedores(id),
  subtotal numeric DEFAULT 0,
  total numeric DEFAULT 0,
  estado text DEFAULT 'Pendiente',
  sincronizada boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  cliente_ruc varchar REFERENCES clientes(ruc),
  forma_pago text,
  observaciones text,
  fecha_procesado timestamptz,
  impuesto numeric DEFAULT 0,
  empresa_id uuid REFERENCES empresas(id),
  fecha_autorizacion timestamptz,
  autorizada_por text REFERENCES vendedores(id)
);

-- Crear tabla pedido_detalle (igual estructura que proforma_detalle)
CREATE TABLE IF NOT EXISTS pedido_detalle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid REFERENCES pedido_cabecera(id) ON DELETE CASCADE,
  articulo_id text NOT NULL,
  descripcion text NOT NULL,
  cantidad numeric NOT NULL,
  precio numeric NOT NULL,
  costo numeric NOT NULL,
  subtotal numeric NOT NULL,
  utilidad_porcentaje numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  empresa_id uuid NOT NULL,
  FOREIGN KEY (articulo_id, empresa_id) REFERENCES articulos(id, empresa_id)
);

-- Índices para mejorar performance
CREATE INDEX IF NOT EXISTS idx_pedido_cabecera_empresa ON pedido_cabecera(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pedido_cabecera_vendedor ON pedido_cabecera(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_pedido_cabecera_estado ON pedido_cabecera(estado);
CREATE INDEX IF NOT EXISTS idx_pedido_detalle_pedido ON pedido_detalle(pedido_id);

-- Habilitar RLS en tablas nuevas
ALTER TABLE pedido_cabecera ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_detalle ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para pedido_cabecera (SELECT)
CREATE POLICY "Usuarios pueden ver pedidos de su empresa"
  ON pedido_cabecera FOR SELECT
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM vendedores WHERE id = auth.uid()::text
    )
  );

-- Políticas RLS para pedido_cabecera (INSERT)
CREATE POLICY "Usuarios pueden crear pedidos en su empresa"
  ON pedido_cabecera FOR INSERT
  TO authenticated
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM vendedores WHERE id = auth.uid()::text
    )
    AND vendedor_id = auth.uid()::text
  );

-- Políticas RLS para pedido_cabecera (UPDATE)
CREATE POLICY "Usuarios pueden actualizar pedidos de su empresa"
  ON pedido_cabecera FOR UPDATE
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM vendedores WHERE id = auth.uid()::text
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM vendedores WHERE id = auth.uid()::text
    )
  );

-- Políticas RLS para pedido_cabecera (DELETE)
CREATE POLICY "Usuarios pueden eliminar pedidos de su empresa"
  ON pedido_cabecera FOR DELETE
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM vendedores WHERE id = auth.uid()::text
    )
  );

-- Políticas RLS para pedido_detalle (SELECT)
CREATE POLICY "Usuarios pueden ver detalles de pedidos de su empresa"
  ON pedido_detalle FOR SELECT
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM vendedores WHERE id = auth.uid()::text
    )
  );

-- Políticas RLS para pedido_detalle (INSERT)
CREATE POLICY "Usuarios pueden insertar detalles de pedidos de su empresa"
  ON pedido_detalle FOR INSERT
  TO authenticated
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM vendedores WHERE id = auth.uid()::text
    )
  );

-- Políticas RLS para pedido_detalle (UPDATE)
CREATE POLICY "Usuarios pueden actualizar detalles de pedidos de su empresa"
  ON pedido_detalle FOR UPDATE
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM vendedores WHERE id = auth.uid()::text
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM vendedores WHERE id = auth.uid()::text
    )
  );

-- Políticas RLS para pedido_detalle (DELETE)
CREATE POLICY "Usuarios pueden eliminar detalles de pedidos de su empresa"
  ON pedido_detalle FOR DELETE
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM vendedores WHERE id = auth.uid()::text
    )
  );

-- Función para generar número de pedido (PED-999999)
CREATE OR REPLACE FUNCTION generar_numero_pedido(p_empresa_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ultimo_numero text;
  v_numero_secuencial integer;
  v_nuevo_numero text;
BEGIN
  -- Obtener el último número de pedido de la empresa
  SELECT numero INTO v_ultimo_numero
  FROM pedido_cabecera
  WHERE empresa_id = p_empresa_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Si no existe ningún pedido, empezar desde 1
  IF v_ultimo_numero IS NULL THEN
    v_numero_secuencial := 1;
  ELSE
    -- Extraer el número secuencial del formato PED-999999
    v_numero_secuencial := CAST(SUBSTRING(v_ultimo_numero FROM 'PED-(\d+)') AS INTEGER) + 1;
  END IF;

  -- Generar el nuevo número con formato PED-999999
  v_nuevo_numero := 'PED-' || LPAD(v_numero_secuencial::text, 6, '0');

  RETURN v_nuevo_numero;
END;
$$;

-- Actualizar función para generar número de proforma (PRO-999999)
CREATE OR REPLACE FUNCTION generar_numero_proforma(p_empresa_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ultimo_numero text;
  v_numero_secuencial integer;
  v_nuevo_numero text;
BEGIN
  -- Obtener el último número de proforma de la empresa
  SELECT numero INTO v_ultimo_numero
  FROM proforma_cabecera
  WHERE empresa_id = p_empresa_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Si no existe ninguna proforma, empezar desde 1
  IF v_ultimo_numero IS NULL THEN
    v_numero_secuencial := 1;
  ELSE
    -- Extraer el número secuencial del formato PRO-999999
    -- Si el formato antiguo no tiene PRO-, empezar desde el número más alto
    IF v_ultimo_numero ~ '^PRO-\d+$' THEN
      v_numero_secuencial := CAST(SUBSTRING(v_ultimo_numero FROM 'PRO-(\d+)') AS INTEGER) + 1;
    ELSE
      -- Para migrar desde números antiguos, buscar el más alto
      SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(numero, '\D', '', 'g') AS INTEGER)), 0) + 1
      INTO v_numero_secuencial
      FROM proforma_cabecera
      WHERE empresa_id = p_empresa_id;
    END IF;
  END IF;

  -- Generar el nuevo número con formato PRO-999999
  v_nuevo_numero := 'PRO-' || LPAD(v_numero_secuencial::text, 6, '0');

  RETURN v_nuevo_numero;
END;
$$;