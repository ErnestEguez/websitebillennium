-- =====================================================
-- RECREACIÓN COMPLETA DE BASE DE DATOS (SAAS RESTAURANTE)
-- VERSIÓN ACTUALIZADA: INCLUYE POLÍTICAS RLS V7 Y LIMPIEZA PREVIA
-- =====================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CREACIÓN DE TABLAS (SI NO EXISTEN)

-- Empresas (SaaS Tenants)
CREATE TABLE IF NOT EXISTS public.empresas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ruc TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    direccion TEXT,
    telefono TEXT,
    config_sri JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Perfiles de Usuario (Auth Link)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    email TEXT,
    rol TEXT CHECK (rol IN ('admin_plataforma', 'oficina', 'mesero', 'cocina')),
    pin TEXT, -- Para login rápido en salón
    estado TEXT DEFAULT 'activo' CHECK (estado IN ('activo', 'baja')),
    fecha_baja TIMESTAMP WITH TIME ZONE,
    motivo_baja TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Categorías de Productos
CREATE TABLE IF NOT EXISTS public.categorias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    tipo TEXT DEFAULT 'restaurante', 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Productos
CREATE TABLE IF NOT EXISTS public.productos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
    nombre TEXT NOT NULL,
    precio_venta DECIMAL(12,2) DEFAULT 0,
    costo_promedio DECIMAL(12,2) DEFAULT 0,
    stock DECIMAL(12,2) DEFAULT 0,
    iva_porcentaje DECIMAL(5,2) DEFAULT 15,
    maneja_stock BOOLEAN DEFAULT false,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Mesas
CREATE TABLE IF NOT EXISTS public.mesas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    numero TEXT NOT NULL,
    capacidad INTEGER DEFAULT 4,
    estado TEXT DEFAULT 'libre' CHECK (estado IN ('libre', 'ocupada', 'reservada', 'atendida')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Clientes
CREATE TABLE IF NOT EXISTS public.clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    identificacion TEXT NOT NULL,
    nombre TEXT NOT NULL,
    email TEXT,
    direccion TEXT,
    telefono TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(empresa_id, identificacion)
);

-- Pedidos (Cabecera)
CREATE TABLE IF NOT EXISTS public.pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    mesa_id UUID REFERENCES public.mesas(id) ON DELETE SET NULL,
    mesero_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_preparacion', 'atendido', 'facturado', 'cancelado')),
    total DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Pedidos (Detalle)
CREATE TABLE IF NOT EXISTS public.pedido_detalles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pedido_id UUID REFERENCES public.pedidos(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES public.productos(id) ON DELETE SET NULL,
    cantidad DECIMAL(12,2) NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    notas TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Comprobantes / Facturas (Cabecera)
CREATE TABLE IF NOT EXISTS public.comprobantes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    pedido_id UUID REFERENCES public.pedidos(id) ON DELETE SET NULL,
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
    secuencial TEXT NOT NULL,
    clave_acceso TEXT,
    autorizacion_numero TEXT,
    tipo_comprobante TEXT DEFAULT 'FACTURA',
    ambiente TEXT DEFAULT 'PRUEBAS',
    total DECIMAL(12,2) NOT NULL,
    estado_sri TEXT DEFAULT 'PENDIENTE',
    fecha_autorizacion TIMESTAMP WITH TIME ZONE,
    sri_utilizacion_sistema_financiero BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Comprobante (Detalle - Snapshot para historial)
CREATE TABLE IF NOT EXISTS public.comprobante_detalles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comprobante_id UUID REFERENCES public.comprobantes(id) ON DELETE CASCADE,
    producto_id UUID,
    nombre_producto TEXT,
    cantidad DECIMAL(12,2),
    precio_unitario DECIMAL(12,2),
    subtotal DECIMAL(12,2),
    iva_porcentaje DECIMAL(5,2),
    iva_valor DECIMAL(12,2),
    total DECIMAL(12,2)
);

-- Comprobante (Pagos)
CREATE TABLE IF NOT EXISTS public.comprobante_pagos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comprobante_id UUID REFERENCES public.comprobantes(id) ON DELETE CASCADE,
    metodo_pago TEXT NOT NULL,
    valor DECIMAL(12,2) NOT NULL,
    referencia TEXT
);

-- Reservas
CREATE TABLE IF NOT EXISTS public.reservas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    mesa_id UUID REFERENCES public.mesas(id) ON DELETE CASCADE,
    cliente_nombre TEXT NOT NULL,
    personas INTEGER DEFAULT 2,
    fecha_hora TIMESTAMP WITH TIME ZONE NOT NULL,
    estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'completada', 'cancelada')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Proveedores
CREATE TABLE IF NOT EXISTS public.proveedores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    ruc TEXT NOT NULL,
    nombre_empresa TEXT NOT NULL,
    nombre_encargado TEXT,
    direccion TEXT,
    correo TEXT,
    telefono TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Ingresos de Stock (Cabecera)
CREATE TABLE IF NOT EXISTS public.ingresos_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    proveedor_id UUID REFERENCES public.proveedores(id) ON DELETE SET NULL,
    numero_factura TEXT,
    fecha_ingreso DATE DEFAULT CURRENT_DATE,
    observaciones TEXT,
    total DECIMAL(12,2) DEFAULT 0,
    created_by UUID REFERENCES auth.users,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Detalles Ingreso Stock
CREATE TABLE IF NOT EXISTS public.detalle_ingresos_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ingreso_id UUID REFERENCES public.ingresos_stock(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES public.productos(id) ON DELETE SET NULL,
    cantidad DECIMAL(12,2) NOT NULL,
    costo_unitario DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2)
);

-- Kardex (Movimientos de Inventario)
CREATE TABLE IF NOT EXISTS public.kardex (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES public.productos(id) ON DELETE CASCADE,
    fecha TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    tipo_movimiento TEXT NOT NULL CHECK (tipo_movimiento IN ('ENTRADA', 'SALIDA')),
    motivo TEXT NOT NULL,
    documento_referencia TEXT,
    cantidad DECIMAL(12,2) NOT NULL,
    costo_unitario DECIMAL(12,2),
    saldo_cantidad DECIMAL(12,2),
    saldo_costo_promedio DECIMAL(12,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. FUNCIONES DE SEGURIDAD (SECURITY DEFINER)
-- Estas evitan la recursión infinita en las políticas de RLS

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND rol = 'admin_plataforma'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_oficina()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND rol = 'oficina'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_empresa_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid());
END;
$$;

-- 4. POLÍTICAS RLS (VERSIÓN DEFINITIVA V7)

-- Activar RLS en todas las tablas
DO $$ 
DECLARE 
    tbl TEXT;
BEGIN
    FOR tbl IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') 
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    END LOOP;
END $$;

-- LIMPIEZA PREVIA DE POLÍTICAS (Para evitar duplicados)
DO $$ 
DECLARE 
    pol RECORD;
BEGIN
    FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- 4.1 POLÍTICAS PARA PROFILES
-- SELECT: Ver propio perfil OR admin OR oficina viendo a su staff
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid() 
  OR public.is_platform_admin() 
  OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina())
);

-- INSERT: Registro propio OR admin creando usuarios OR oficina creando meseros
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
WITH CHECK (
  id = auth.uid() 
  OR public.is_platform_admin() 
  OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina())
);

-- UPDATE: Propio perfil OR admin OR oficina gestionando staff
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
USING (
  id = auth.uid() 
  OR public.is_platform_admin() 
  OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina())
);

-- DELETE: Solo admin o oficina
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated
USING (
  public.is_platform_admin() 
  OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina())
);

-- 4.2 POLÍTICAS PARA EMPRESAS
-- SELECT: Admin ve todas, Usuarios ven su propia empresa
CREATE POLICY "empresas_select" ON public.empresas FOR SELECT TO authenticated
USING (
  public.is_platform_admin() 
  OR id = public.get_my_empresa_id()
);

-- INSERT: Solo admin
CREATE POLICY "empresas_insert" ON public.empresas FOR INSERT TO authenticated
WITH CHECK (public.is_platform_admin());

-- UPDATE: Admin o Oficina (para configurar su propia empresa)
CREATE POLICY "empresas_update" ON public.empresas FOR UPDATE TO authenticated
USING (
  public.is_platform_admin() 
  OR (id = public.get_my_empresa_id() AND public.is_oficina())
);

-- DELETE: Solo admin
CREATE POLICY "empresas_delete" ON public.empresas FOR DELETE TO authenticated
USING (public.is_platform_admin());

-- 4.3 POLÍTICAS GENÉRICAS PARA EL RESTO DE TABLAS
-- Se aplican a: productos, pedidos, mesas, clientes, etc.
-- Regla: Admin ve todo, Usuario ve solo data de su empresa_id
DO $$ 
DECLARE 
    tbl TEXT;
BEGIN
    FOR tbl IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('profiles', 'empresas')) 
    LOOP
        -- Política de SELECT/ALL
        EXECUTE format('CREATE POLICY "%I_all_policy" ON public.%I FOR ALL TO authenticated USING (public.is_platform_admin() OR empresa_id = public.get_my_empresa_id()) WITH CHECK (public.is_platform_admin() OR empresa_id = public.get_my_empresa_id());', tbl, tbl);
    END LOOP;
END $$;

-- 5. DATOS DE INICIALIZACIÓN

-- Empresa Billennium (Si no existe, se crea)
INSERT INTO public.empresas (id, ruc, nombre, direccion, telefono)
VALUES ('00000000-0000-0000-0000-000000000001', '1790000000001', 'Billennium Restaurantes', 'Quito, Ecuador', '0999999999')
ON CONFLICT (ruc) DO UPDATE SET nombre = EXCLUDED.nombre;

-- GRANTS
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- RECARGAR SCHEMA
NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================
-- 6. SEED DATA (DATOS DE PRUEBA)
-- =====================================================

-- Asegurar que estamos usando la empresa por defecto
DO $$
DECLARE
    empresa_uuid UUID := '00000000-0000-0000-0000-000000000001';
    cat_bebidas UUID;
    cat_platos UUID;
BEGIN
    -- 6.1 Categorías
    INSERT INTO public.categorias (empresa_id, nombre, tipo) VALUES 
    (empresa_uuid, 'Bebidas', 'restaurante'),
    (empresa_uuid, 'Platos Fuertes', 'restaurante'),
    (empresa_uuid, 'Entradas', 'restaurante')
    ON CONFLICT DO NOTHING;

    SELECT id INTO cat_bebidas FROM public.categorias WHERE nombre = 'Bebidas' AND empresa_id = empresa_uuid LIMIT 1;
    SELECT id INTO cat_platos FROM public.categorias WHERE nombre = 'Platos Fuertes' AND empresa_id = empresa_uuid LIMIT 1;

    -- 6.2 Productos
    IF cat_bebidas IS NOT NULL THEN
        INSERT INTO public.productos (empresa_id, categoria_id, nombre, precio_venta, costo_promedio, stock, maneja_stock, ivar_porcentaje) VALUES
        (empresa_uuid, cat_bebidas, 'Coca Cola Personal', 1.50, 0.80, 100, true, 15),
        (empresa_uuid, cat_bebidas, 'Jugo Natural', 2.00, 0.50, 50, true, 0),
        (empresa_uuid, cat_bebidas, 'Cerveza Club', 3.50, 1.20, 100, true, 15);
    END IF;

    IF cat_platos IS NOT NULL THEN
        INSERT INTO public.productos (empresa_id, categoria_id, nombre, precio_venta, costo_promedio, stock, maneja_stock, ivar_porcentaje) VALUES
        (empresa_uuid, cat_platos, 'Hamburguesa Clásica', 5.50, 2.50, 20, true, 15),
        (empresa_uuid, cat_platos, 'Lomo Fino a la Parrilla', 12.00, 6.00, 15, true, 15),
        (empresa_uuid, cat_platos, 'Pollo Asado (Cuarto)', 4.50, 2.00, 30, true, 0);
    END IF;

    -- 6.3 Mesas
    INSERT INTO public.mesas (empresa_id, numero, capacidad, estado) VALUES
    (empresa_uuid, 'Mesa 1', 4, 'libre'),
    (empresa_uuid, 'Mesa 2', 2, 'libre'),
    (empresa_uuid, 'Mesa 3', 6, 'libre'),
    (empresa_uuid, 'Mesa 4', 4, 'libre'),
    (empresa_uuid, 'Mesa 5', 8, 'libre');

    -- 6.4 Cliente Consumidor Final
    INSERT INTO public.clientes (empresa_id, identificacion, nombre, direccion, telefono, email) VALUES
    (empresa_uuid, '9999999999999', 'CONSUMIDOR FINAL', 'S/D', '9999999999', 'cf@consumidor.com')
    ON CONFLICT (empresa_id, identificacion) DO NOTHING;

END $$;
