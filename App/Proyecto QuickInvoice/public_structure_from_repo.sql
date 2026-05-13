-- Script de creación de estructura basado en el SQL disponible en el repositorio
-- Generado a partir de supabase/full_reconstruction_schema.sql
-- Solo estructura, sin datos

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS target_schema;
SET search_path = target_schema;

CREATE TABLE IF NOT EXISTS empresas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ruc TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    razon_social TEXT,
    direccion TEXT,
    telefono TEXT,
    config_sri JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    email TEXT,
    rol TEXT CHECK (rol IN ('oficina', 'mesero', 'cocina', 'admin_plataforma')),
    pin TEXT,
    estado TEXT DEFAULT 'activo' CHECK (estado IN ('activo', 'baja')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS categorias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    tipo TEXT DEFAULT 'ALIMENTO' CHECK (tipo IN ('ALIMENTO', 'BEBIDA', 'OTROS')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS productos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
    categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    precio_venta DECIMAL(12,2) NOT NULL DEFAULT 0,
    iva_porcentaje INTEGER DEFAULT 15,
    activo BOOLEAN DEFAULT true,
    maneja_stock BOOLEAN DEFAULT true,
    stock DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS mesas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
    numero TEXT NOT NULL,
    capacidad INTEGER DEFAULT 4,
    estado TEXT DEFAULT 'libre' CHECK (estado IN ('libre', 'ocupada', 'reservada', 'atendida')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
    mesa_id UUID REFERENCES mesas(id) ON DELETE SET NULL,
    mesero_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    total DECIMAL(12,2) DEFAULT 0,
    estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_preparacion', 'atendido', 'facturado', 'cancelado', 'servido')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS pedido_detalles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pedido_id UUID REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES productos(id) ON DELETE SET NULL,
    cantidad INTEGER NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    notas TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
    identificacion TEXT NOT NULL,
    nombre TEXT NOT NULL,
    email TEXT,
    direccion TEXT,
    telefono TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(empresa_id, identificacion)
);

CREATE TABLE IF NOT EXISTS comprobantes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
    pedido_id UUID REFERENCES pedidos(id) ON DELETE SET NULL,
    cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
    tipo_comprobante TEXT DEFAULT 'FACTURA',
    secuencial TEXT,
    clave_acceso TEXT UNIQUE,
    total DECIMAL(12,2) NOT NULL,
    estado_sri TEXT DEFAULT 'PENDIENTE',
    xml_firmado TEXT,
    observaciones_sri TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
