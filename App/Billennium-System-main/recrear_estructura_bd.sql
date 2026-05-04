/*
  Script de recreación de la base de datos del proyecto Billennium-System-main (Pedidos)
  - Sin datos
  - Solo estructura: tablas, índices, funciones, RLS y triggers necesarios
  - Basado en las migraciones actuales del proyecto
*/

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- TABLAS PRINCIPALES
CREATE TABLE IF NOT EXISTS empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruc text UNIQUE NOT NULL,
  nombre_comercial text NOT NULL,
  representante_legal text NOT NULL,
  direccion text NOT NULL,
  telefonos text NOT NULL,
  correos text NOT NULL,
  activo boolean DEFAULT true,
  logo_url text,
  habilitar_proformas boolean DEFAULT true,
  habilitar_pedidos boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendedores (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  email text,
  telefono text,
  activo boolean DEFAULT true,
  is_admin boolean DEFAULT false,
  is_office boolean DEFAULT false,
  empresa_id uuid REFERENCES empresas(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clientes (
  ruc text PRIMARY KEY,
  nombres_completos text NOT NULL,
  nombre_negocio text,
  correo text,
  telefono text,
  activo boolean DEFAULT true,
  empresa_id uuid REFERENCES empresas(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS articulos (
  id text PRIMARY KEY,
  descripcion text NOT NULL,
  precio numeric DEFAULT 0,
  costo numeric DEFAULT 0,
  stock numeric DEFAULT 0,
  activo boolean DEFAULT true,
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT articulos_id_empresa_id_key UNIQUE (id, empresa_id)
);

CREATE TABLE IF NOT EXISTS proforma_cabecera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text,
  ruc_cliente text NOT NULL,
  nombre_cliente text NOT NULL,
  vendedor_id text REFERENCES vendedores(id),
  empresa_id uuid REFERENCES empresas(id),
  subtotal numeric DEFAULT 0,
  impuesto numeric DEFAULT 0,
  total numeric DEFAULT 0,
  estado text DEFAULT 'PENDIENTE',
  sincronizada boolean DEFAULT false,
  forma_pago text,
  observaciones text,
  fecha_autorizacion timestamptz,
  autorizada_por text REFERENCES vendedores(id),
  cliente_ruc varchar(13) REFERENCES clientes(ruc),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proforma_detalle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proforma_id uuid REFERENCES proforma_cabecera(id) ON DELETE CASCADE,
  articulo_id text NOT NULL,
  descripcion text NOT NULL,
  cantidad numeric NOT NULL,
  precio numeric NOT NULL,
  costo numeric NOT NULL,
  subtotal numeric NOT NULL,
  utilidad_porcentaje numeric DEFAULT 0,
  empresa_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pedido_cabecera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text,
  ruc_cliente text NOT NULL,
  nombre_cliente text NOT NULL,
  vendedor_id text REFERENCES vendedores(id),
  empresa_id uuid REFERENCES empresas(id),
  subtotal numeric DEFAULT 0,
  impuesto numeric DEFAULT 0,
  total numeric DEFAULT 0,
  estado text DEFAULT 'Pendiente',
  sincronizada boolean DEFAULT false,
  forma_pago text,
  observaciones text,
  fecha_autorizacion timestamptz,
  autorizada_por text REFERENCES vendedores(id),
  cliente_ruc varchar(13) REFERENCES clientes(ruc),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

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
  empresa_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  vendedor_id text NOT NULL REFERENCES vendedores(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(vendedor_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id text NOT NULL REFERENCES vendedores(id),
  content text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ÍNDICES
CREATE INDEX IF NOT EXISTS idx_articulos_empresa_id ON articulos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_id ON clientes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_proforma_cabecera_empresa_id ON proforma_cabecera(empresa_id);
CREATE INDEX IF NOT EXISTS idx_proforma_cabecera_cliente_ruc ON proforma_cabecera(cliente_ruc);
CREATE INDEX IF NOT EXISTS idx_proforma_detalle_proforma_id ON proforma_detalle(proforma_id);
CREATE INDEX IF NOT EXISTS idx_pedido_cabecera_empresa_id ON pedido_cabecera(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pedido_detalle_pedido_id ON pedido_detalle(pedido_id);

-- FUNCIONES
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN COALESCE((SELECT is_admin FROM vendedores WHERE id = auth.uid()::text LIMIT 1), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_office()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN COALESCE((SELECT is_office FROM vendedores WHERE id = auth.uid()::text LIMIT 1), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_empresa_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN (SELECT empresa_id FROM vendedores WHERE id = auth.uid()::text LIMIT 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_articulos_empresa(p_empresa_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_detalle_count integer;
  deleted_articulos_count integer;
BEGIN
  DELETE FROM public.proforma_detalle
  WHERE articulo_id IN (
    SELECT id FROM public.articulos WHERE empresa_id = p_empresa_id
  );
  GET DIAGNOSTICS deleted_detalle_count = ROW_COUNT;

  DELETE FROM public.articulos
  WHERE empresa_id = p_empresa_id;
  GET DIAGNOSTICS deleted_articulos_count = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'deleted_articulos', deleted_articulos_count,
    'deleted_detalle', deleted_detalle_count,
    'empresa_id', p_empresa_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_articulos_empresa(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_articulos_empresa(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_admin_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.id = 'fc111af9-ad57-4cba-b406-cc842b118689' THEN
    RAISE EXCEPTION 'No se puede eliminar el usuario administrador protegido.';
  END IF;
  RETURN OLD;
END;
$$;

-- HABILITAR RLS
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE articulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE proforma_cabecera ENABLE ROW LEVEL SECURITY;
ALTER TABLE proforma_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_cabecera ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- LIMPIAR POLÍTICAS EXISTENTES
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- POLÍTICAS RLS
CREATE POLICY "empresas_select" ON empresas FOR SELECT TO authenticated USING (id = get_my_empresa_id());

CREATE POLICY "vendedores_select" ON vendedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "vendedores_insert" ON vendedores FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "vendedores_update" ON vendedores FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "vendedores_delete" ON vendedores FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "clientes_all_policy" ON clientes FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR empresa_id IS NULL)
  WITH CHECK (empresa_id = get_my_empresa_id() OR empresa_id IS NULL);

CREATE POLICY "articulos_all_policy" ON articulos FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

CREATE POLICY "proforma_cabecera_all" ON proforma_cabecera FOR ALL TO authenticated
  USING (vendedor_id = auth.uid()::text OR (is_admin() AND empresa_id = get_my_empresa_id()))
  WITH CHECK (vendedor_id = auth.uid()::text OR (is_admin() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "proforma_detalle_all" ON proforma_detalle FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

CREATE POLICY "pedido_cabecera_all" ON pedido_cabecera FOR ALL TO authenticated
  USING (vendedor_id = auth.uid()::text OR (is_admin() AND empresa_id = get_my_empresa_id()))
  WITH CHECK (vendedor_id = auth.uid()::text OR (is_admin() AND empresa_id = get_my_empresa_id()));

CREATE POLICY "pedido_detalle_all" ON pedido_detalle FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

CREATE POLICY "rooms_select_vendedor" ON chat_rooms FOR SELECT TO authenticated
  USING (vendedor_id = auth.uid()::text);
CREATE POLICY "rooms_select_oficina" ON chat_rooms FOR SELECT TO authenticated
  USING (empresa_id = get_my_empresa_id());
CREATE POLICY "rooms_select_admin" ON chat_rooms FOR SELECT TO authenticated
  USING (is_admin());
CREATE POLICY "rooms_insert_vendedor" ON chat_rooms FOR INSERT TO authenticated
  WITH CHECK (vendedor_id = auth.uid()::text);
CREATE POLICY "rooms_insert_oficina" ON chat_rooms FOR INSERT TO authenticated
  WITH CHECK (empresa_id = get_my_empresa_id() AND is_office());

CREATE POLICY "messages_select_vendedor" ON chat_messages FOR SELECT TO authenticated
  USING (sender_id = auth.uid()::text OR EXISTS (
    SELECT 1 FROM chat_rooms r WHERE r.id = room_id AND r.vendedor_id = auth.uid()::text
  ));
CREATE POLICY "messages_select_oficina" ON chat_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chat_rooms r WHERE r.id = room_id AND r.empresa_id = get_my_empresa_id()
  ));
CREATE POLICY "messages_select_admin" ON chat_messages FOR SELECT TO authenticated
  USING (is_admin());
CREATE POLICY "messages_insert_all" ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid()::text);
CREATE POLICY "messages_select_all_office" ON chat_messages FOR SELECT TO authenticated
  USING (is_office() AND EXISTS (
    SELECT 1 FROM chat_rooms r WHERE r.id = room_id AND r.empresa_id = get_my_empresa_id()
  ));
CREATE POLICY "messages_insert_office" ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (is_office() AND EXISTS (
    SELECT 1 FROM chat_rooms r WHERE r.id = room_id AND r.empresa_id = get_my_empresa_id()
  ));
CREATE POLICY "messages_delete_office" ON chat_messages FOR DELETE TO authenticated
  USING (is_office() AND EXISTS (
    SELECT 1 FROM chat_rooms r WHERE r.id = room_id AND r.empresa_id = get_my_empresa_id()
  ));

CREATE POLICY "Permitir lectura anónima de pedidos" ON pedido_cabecera FOR SELECT TO anon USING (true);
CREATE POLICY "Permitir lectura anónima de detalles de pedidos" ON pedido_detalle FOR SELECT TO anon USING (true);
CREATE POLICY "Permitir actualización anónima de estado de pedidos" ON pedido_cabecera FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Permitir eliminación anónima de articulos" ON articulos FOR DELETE TO anon USING (true);

-- PROTECCIÓN ADMINISTRADOR
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vendedores') THEN
    DROP TRIGGER IF EXISTS protect_admin_vendedor ON vendedores;
    CREATE TRIGGER protect_admin_vendedor
      BEFORE DELETE ON vendedores
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_admin_deletion();
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    DROP TRIGGER IF EXISTS protect_admin_auth_user ON auth.users;
    CREATE TRIGGER protect_admin_auth_user
      BEFORE DELETE ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_admin_deletion();
  END IF;
END $$;

-- RECARGAR SCHEMA POSTGREST
NOTIFY pgrst, 'reload schema';
