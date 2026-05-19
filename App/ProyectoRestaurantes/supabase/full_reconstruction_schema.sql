-- ============================================================
-- RECREACIÓN ESTRUCTURAL COMPLETA Y SEEDING DE DATOS
-- PROYECTO: Mi Restaurante (Ernesto Eguez)
-- FECHA: 2026-02-28
-- ============================================================

-- 0. Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tablas Nucleares
CREATE TABLE IF NOT EXISTS public.empresas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ruc TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    razon_social TEXT,
    direccion TEXT,
    telefono TEXT,
    config_sri JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    email TEXT,
    rol TEXT CHECK (rol IN ('oficina', 'mesero', 'cocina', 'admin_plataforma')),
    pin TEXT,
    estado TEXT DEFAULT 'activo' CHECK (estado IN ('activo', 'baja')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.categorias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    tipo TEXT DEFAULT 'ALIMENTO' CHECK (tipo IN ('ALIMENTO', 'BEBIDA', 'OTROS')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.productos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    precio_venta DECIMAL(12,2) NOT NULL DEFAULT 0,
    iva_porcentaje INTEGER DEFAULT 15,
    activo BOOLEAN DEFAULT true,
    maneja_stock BOOLEAN DEFAULT true,
    stock DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.mesas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    numero TEXT NOT NULL,
    capacidad INTEGER DEFAULT 4,
    estado TEXT DEFAULT 'libre' CHECK (estado IN ('libre', 'ocupada', 'reservada', 'atendida')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Procesos de Pedidos
CREATE TABLE IF NOT EXISTS public.pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    mesa_id UUID REFERENCES public.mesas(id) ON DELETE SET NULL,
    mesero_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    total DECIMAL(12,2) DEFAULT 0,
    estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_preparacion', 'atendido', 'facturado', 'cancelado', 'servido')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.pedido_detalles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pedido_id UUID REFERENCES public.pedidos(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES public.productos(id) ON DELETE SET NULL,
    cantidad INTEGER NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    notas TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Facturación Electrónica (Comprobantes)
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

CREATE TABLE IF NOT EXISTS public.comprobantes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    pedido_id UUID REFERENCES public.pedidos(id) ON DELETE SET NULL,
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
    tipo_comprobante TEXT DEFAULT 'FACTURA',
    secuencial TEXT,
    clave_acceso TEXT UNIQUE,
    total DECIMAL(12,2) NOT NULL,
    estado_sri TEXT DEFAULT 'PENDIENTE',
    xml_firmado TEXT,
    observaciones_sri TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. SEED DATA (Ajustado a usuario Ernesto Eguez)
-- (Nota: Para profiles/auth se requiere intervención vía Dashboard o Admin por el UUID de Auth)

-- Empresa
INSERT INTO public.empresas (ruc, nombre, razon_social, direccion, config_sri)
VALUES (
    '0907388268001', 
    'Mi Restaurante', 
    'EGUEZ RUIZ ERNESTO GUILLERMO', 
    'Guayaquil, Ecuador',
    '{
        "ambiente": "PRUEBAS",
        "establecimiento": "001",
        "punto_emision": "001",
        "secuencial_inicio": 1,
        "firma_path": "0907388268001/cert.p12",
        "firma_password": "Passw0rd",
        "obligado_contabilidad": "NO"
    }'::jsonb
) ON CONFLICT (ruc) DO UPDATE SET razon_social = EXCLUDED.razon_social, config_sri = public.empresas.config_sri || EXCLUDED.config_sri;

-- Categorias para esa empresa
INSERT INTO public.categorias (empresa_id, nombre, tipo)
SELECT id, 'Entradas', 'ALIMENTO' FROM public.empresas WHERE ruc = '0907388268001'
UNION ALL SELECT id, 'Platos Fuertes', 'ALIMENTO' FROM public.empresas WHERE ruc = '0907388268001'
UNION ALL SELECT id, 'Bebidas', 'BEBIDA' FROM public.empresas WHERE ruc = '0907388268001'
UNION ALL SELECT id, 'Postres', 'ALIMENTO' FROM public.empresas WHERE ruc = '0907388268001'
ON CONFLICT DO NOTHING;

-- Mesas para esa empresa
INSERT INTO public.mesas (empresa_id, numero, capacidad)
SELECT id, '1', 4 FROM public.empresas WHERE ruc = '0907388268001'
UNION ALL SELECT id, '2', 2 FROM public.empresas WHERE ruc = '0907388268001'
UNION ALL SELECT id, '3', 6 FROM public.empresas WHERE ruc = '0907388268001'
UNION ALL SELECT id, '4', 4 FROM public.empresas WHERE ruc = '0907388268001'
ON CONFLICT DO NOTHING;

-- Consumidor Final default para esa empresa
INSERT INTO public.clientes (empresa_id, identificacion, nombre, email, direccion)
SELECT id, '9999999999999', 'CONSUMIDOR FINAL', 'consumidor@final.com', 'CIUDAD' 
FROM public.empresas WHERE ruc = '0907388268001'
ON CONFLICT (empresa_id, identificacion) DO NOTHING;

-- Notificar recarga de schema
NOTIFY pgrst, 'reload schema';
