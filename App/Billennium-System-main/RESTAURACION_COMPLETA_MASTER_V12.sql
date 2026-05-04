/* 
  ============================================================================
  MASTER SCRIPT: REGENERACIÓN TOTAL - BILLENNIUM SYSTEM
  Versión: 1.2 (20/01/2026)
  Objetivo: Recrear estructura, funciones de seguridad y políticas RLS.
  ============================================================================
*/

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLAS BASE
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
    id text PRIMARY KEY, -- UID de Auth
    nombre text NOT NULL,
    email text,
    telefono text,
    activo boolean DEFAULT true,
    is_admin boolean DEFAULT false,
    empresa_id uuid REFERENCES empresas(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clientes (
    ruc text PRIMARY KEY,
    nombres_completos text NOT NULL,
    nombre_negocio text,
    correo text,
    telefono text,
    empresa_id uuid REFERENCES empresas(id),
    activo boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS articulos (
    id text NOT NULL,
    descripcion text NOT NULL,
    precio numeric DEFAULT 0,
    costo numeric DEFAULT 0,
    stock numeric DEFAULT 0,
    activo boolean DEFAULT true,
    empresa_id uuid REFERENCES empresas(id),
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (id, empresa_id)
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

-- 3. FUNCIONES DE SEGURIDAD (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
BEGIN
  RETURN COALESCE((SELECT is_admin FROM vendedores WHERE id = auth.uid()::text), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_empresa_id()
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
BEGIN
  RETURN (SELECT empresa_id FROM vendedores WHERE id = auth.uid()::text);
END;
$$;

-- 4. LIMPIEZA DE RLS ANTERIORES
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE articulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE proforma_cabecera ENABLE ROW LEVEL SECURITY;
ALTER TABLE proforma_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_cabecera ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_detalle ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- 5. POLÍTICAS RLS MAESTRAS

-- Empresas
CREATE POLICY "empresas_select" ON empresas FOR SELECT TO authenticated USING (id = get_my_empresa_id());

-- Vendedores
CREATE POLICY "vendedores_select" ON vendedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "vendedores_insert" ON vendedores FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "vendedores_update" ON vendedores FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "vendedores_delete" ON vendedores FOR DELETE TO authenticated USING (is_admin());

-- Clientes (Globales/Multi-tenant)
CREATE POLICY "clientes_select" ON clientes FOR SELECT TO authenticated 
USING (empresa_id = get_my_empresa_id() OR empresa_id IS NULL);
CREATE POLICY "clientes_insert" ON clientes FOR INSERT TO authenticated 
WITH CHECK (empresa_id = get_my_empresa_id() OR empresa_id IS NULL);
CREATE POLICY "clientes_update" ON clientes FOR UPDATE TO authenticated 
USING (empresa_id = get_my_empresa_id() OR is_admin());
CREATE POLICY "clientes_delete" ON clientes FOR DELETE TO authenticated 
USING (empresa_id = get_my_empresa_id() OR is_admin());

-- Artículos
CREATE POLICY "articulos_all_policy" ON articulos FOR ALL TO authenticated 
USING (empresa_id = get_my_empresa_id())
WITH CHECK (empresa_id = get_my_empresa_id());

-- Proformas
CREATE POLICY "proforma_select" ON proforma_cabecera FOR SELECT TO authenticated 
USING (vendedor_id = auth.uid()::text OR (is_admin() AND empresa_id = get_my_empresa_id()));
CREATE POLICY "proforma_insert" ON proforma_cabecera FOR INSERT TO authenticated WITH CHECK (vendedor_id = auth.uid()::text);
CREATE POLICY "proforma_update" ON proforma_cabecera FOR UPDATE TO authenticated 
USING (vendedor_id = auth.uid()::text OR is_admin()) WITH CHECK (vendedor_id = auth.uid()::text OR is_admin());
CREATE POLICY "proforma_delete" ON proforma_cabecera FOR DELETE TO authenticated USING (vendedor_id = auth.uid()::text OR is_admin());

CREATE POLICY "proforma_detalle_select" ON proforma_detalle FOR SELECT TO authenticated 
USING (empresa_id = get_my_empresa_id());
CREATE POLICY "proforma_detalle_all" ON proforma_detalle FOR ALL TO authenticated 
USING (empresa_id = get_my_empresa_id()) WITH CHECK (empresa_id = get_my_empresa_id());

-- Pedidos
CREATE POLICY "pedido_select" ON pedido_cabecera FOR SELECT TO authenticated 
USING (vendedor_id = auth.uid()::text OR (is_admin() AND empresa_id = get_my_empresa_id()));
CREATE POLICY "pedido_insert" ON pedido_cabecera FOR INSERT TO authenticated WITH CHECK (vendedor_id = auth.uid()::text);
CREATE POLICY "pedido_update" ON pedido_cabecera FOR UPDATE TO authenticated 
USING (vendedor_id = auth.uid()::text OR is_admin()) WITH CHECK (vendedor_id = auth.uid()::text OR is_admin());
CREATE POLICY "pedido_delete" ON pedido_cabecera FOR DELETE TO authenticated USING (vendedor_id = auth.uid()::text OR is_admin());

CREATE POLICY "pedido_detalle_select" ON pedido_detalle FOR SELECT TO authenticated 
USING (empresa_id = get_my_empresa_id());
CREATE POLICY "pedido_detalle_all" ON pedido_detalle FOR ALL TO authenticated 
USING (empresa_id = get_my_empresa_id()) WITH CHECK (empresa_id = get_my_empresa_id());


-- 6. RECARGAR SISTEMA
NOTIFY pgrst, 'reload schema';
