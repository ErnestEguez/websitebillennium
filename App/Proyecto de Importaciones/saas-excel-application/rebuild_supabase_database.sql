-- REBUILD SUPABASE DATABASE SCRIPT
-- Este script crea la estructura de las tablas usadas por la app y carga datos de ejemplo.
-- No modifica el código de la app actual.
-- Úsalo en el editor SQL de Supabase o en un cliente SQL conectado a tu base de datos.
-- ADVERTENCIA: al ejecutarlo se eliminarán los datos existentes en las tablas listadas.

/*
  Instrucciones:
  1) Abre el proyecto en Supabase.
  2) Ve a SQL Editor.
  3) Crea una nueva consulta y copia/pega este contenido.
  4) Ejecuta.

  Nota: este script reconstruye solo la base de datos SQL y datos de ejemplo.
  La autenticación de Supabase (auth.users) debe gestionarse por separado.
*/

-- Eliminar tablas en orden seguro
DROP TABLE IF EXISTS importacion_detalle CASCADE;
DROP TABLE IF EXISTS gastos CASCADE;
DROP TABLE IF EXISTS importaciones CASCADE;
DROP TABLE IF EXISTS productos CASCADE;
DROP TABLE IF EXISTS proveedores CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS empresas CASCADE;
DROP TABLE IF EXISTS monedas CASCADE;
DROP TABLE IF EXISTS aranceles CASCADE;

-- Tablas base
CREATE TABLE monedas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descripcion text NOT NULL,
  tipo_cambio numeric(18,6) NOT NULL DEFAULT 1.000000,
  estado text NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruc text NOT NULL,
  nombre text NOT NULL,
  plan_suscripcion text NOT NULL DEFAULT 'BÁSICO',
  estado text NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE aranceles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partida text NOT NULL,
  descripcion text NOT NULL,
  advalorem numeric(10,4) NOT NULL DEFAULT 0,
  fodinfa numeric(10,4) NOT NULL DEFAULT 0,
  ice numeric(10,4) NOT NULL DEFAULT 0,
  iva numeric(10,4) NOT NULL DEFAULT 0,
  fecha_actualizacion timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  email text NOT NULL UNIQUE,
  rol text NOT NULL DEFAULT 'USUARIO',
  id_empresa uuid REFERENCES empresas(id) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre_empresa text NOT NULL,
  id_moneda uuid REFERENCES monedas(id) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE productos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  descripcion text NOT NULL,
  costo numeric(18,6) NOT NULL DEFAULT 0,
  precio numeric(18,6) NOT NULL DEFAULT 0,
  partida_senae uuid REFERENCES aranceles(id) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE importaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero_importacion text NOT NULL,
  id_proveedor uuid NOT NULL REFERENCES proveedores(id) ON DELETE SET NULL,
  fecha_importacion date NOT NULL,
  estado text NOT NULL DEFAULT 'BORRADOR',
  tasa_iva numeric(10,4) NOT NULL DEFAULT 15,
  seguro numeric(18,6) NOT NULL DEFAULT 0,
  flete numeric(18,6) NOT NULL DEFAULT 0,
  fob_total numeric(18,6) NOT NULL DEFAULT 0,
  fecha_creacion timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE importacion_detalle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_importacion uuid NOT NULL REFERENCES importaciones(id) ON DELETE CASCADE,
  secuencial integer NOT NULL,
  id_producto uuid NOT NULL REFERENCES productos(id) ON DELETE SET NULL,
  cantidad numeric(18,6) NOT NULL DEFAULT 0,
  precio_unitario numeric(18,6) NOT NULL DEFAULT 0,
  tasa_margen_ganancia numeric(10,4) NOT NULL DEFAULT 0,
  pvp_mercado numeric(18,6) NOT NULL DEFAULT 0,
  tasa_incremento_pvp numeric(10,4) NOT NULL DEFAULT 0
);

CREATE TABLE gastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  id_importacion uuid NOT NULL REFERENCES importaciones(id) ON DELETE CASCADE,
  descripcion_gasto text NOT NULL,
  valor_gasto numeric(18,6) NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion timestamp with time zone NOT NULL DEFAULT now()
);

-- Índices de búsqueda y relaciones comunes
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_productos_id_empresa ON productos(id_empresa);
CREATE INDEX IF NOT EXISTS idx_proveedores_id_empresa ON proveedores(id_empresa);
CREATE INDEX IF NOT EXISTS idx_importaciones_id_empresa ON importaciones(id_empresa);
CREATE INDEX IF NOT EXISTS idx_importacion_detalle_id_importacion ON importacion_detalle(id_importacion);
CREATE INDEX IF NOT EXISTS idx_gastos_id_importacion ON gastos(id_importacion);
