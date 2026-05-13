-- =====================================================
-- RECREACIÓN DE BASE DE DATOS: QuickInvoice
-- Sistema de Facturación Electrónica para Ferreterías
-- Basado en QuickInvoice SaaS - Adaptado para Artículos/Servicios
-- Versión: 1.0 | Fecha: 2026-03-09
-- =====================================================

-- ───────────────────────────────────────────────────
-- 1. EXTENSIONES
-- ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ───────────────────────────────────────────────────
-- 2. TABLAS BASE
-- ───────────────────────────────────────────────────

-- Empresas (Tenants SaaS)
CREATE TABLE IF NOT EXISTS public.empresas (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ruc        TEXT UNIQUE NOT NULL,
    nombre     TEXT NOT NULL,
    direccion  TEXT,
    telefono   TEXT,
    logo_url   TEXT,
    config_sri JSONB DEFAULT '{}',
    habilitar_division_cuenta BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Perfiles de Usuario
CREATE TABLE IF NOT EXISTS public.profiles (
    id         UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    nombre     TEXT NOT NULL,
    email      TEXT,
    rol        TEXT CHECK (rol IN ('admin_plataforma', 'oficina', 'mesero', 'cocina')),
    pin        TEXT,
    estado     TEXT DEFAULT 'activo' CHECK (estado IN ('activo', 'baja')),
    fecha_baja    TIMESTAMP WITH TIME ZONE,
    motivo_baja   TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Categorías de Productos/Servicios
CREATE TABLE IF NOT EXISTS public.categorias (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    nombre     TEXT NOT NULL,
    tipo       TEXT DEFAULT 'ferreteria',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Productos / Servicios
CREATE TABLE IF NOT EXISTS public.productos (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    categoria_id    UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
    codigo          TEXT,
    nombre          TEXT NOT NULL,
    descripcion     TEXT,
    precio_venta    DECIMAL(12,2) DEFAULT 0,
    costo_promedio  DECIMAL(12,2) DEFAULT 0,
    stock           DECIMAL(12,2) DEFAULT 0,
    stock_minimo    DECIMAL(12,2) DEFAULT 0,
    iva_porcentaje  DECIMAL(5,2) DEFAULT 15,
    maneja_stock    BOOLEAN DEFAULT true,
    activo          BOOLEAN DEFAULT true,
    imagen_url      TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Clientes
CREATE TABLE IF NOT EXISTS public.clientes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    identificacion  TEXT NOT NULL,
    nombre          TEXT NOT NULL,
    email           TEXT,
    direccion       TEXT,
    telefono        TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(empresa_id, identificacion)
);

-- Comprobantes / Facturas (Cabecera)
-- NOTA: pedido_id es NULL para facturas directas (sin mesa)
CREATE TABLE IF NOT EXISTS public.comprobantes (
    id                              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id                      UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    pedido_id                       UUID,  -- NULL para factura directa
    cliente_id                      UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
    secuencial                      TEXT NOT NULL,
    clave_acceso                    TEXT,
    autorizacion_numero             TEXT,
    tipo_comprobante                TEXT DEFAULT 'FACTURA',
    ambiente                        TEXT DEFAULT 'PRUEBAS',
    total                           DECIMAL(12,2) NOT NULL,
    estado_sri                      TEXT DEFAULT 'PENDIENTE',
    observaciones_sri               TEXT,
    xml_generado                    TEXT,
    fecha_autorizacion              TIMESTAMP WITH TIME ZONE,
    sri_utilizacion_sistema_financiero BOOLEAN DEFAULT false,
    caja_sesion_id                  UUID,
    created_at                      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Comprobante (Detalle — snapshot para historial)
CREATE TABLE IF NOT EXISTS public.comprobante_detalles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comprobante_id  UUID REFERENCES public.comprobantes(id) ON DELETE CASCADE,
    producto_id     UUID,
    nombre_producto TEXT,
    cantidad        DECIMAL(12,2),
    precio_unitario DECIMAL(12,2),
    descuento       DECIMAL(5,2) DEFAULT 0,
    subtotal        DECIMAL(12,2),
    iva_porcentaje  DECIMAL(5,2),
    iva_valor       DECIMAL(12,2),
    total           DECIMAL(12,2)
);

-- Comprobante (Pagos) — Métodos adaptados a ferretería
CREATE TABLE IF NOT EXISTS public.comprobante_pagos (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comprobante_id UUID REFERENCES public.comprobantes(id) ON DELETE CASCADE,
    metodo_pago    TEXT NOT NULL CHECK (metodo_pago IN ('efectivo','transferencia','credito','cheque','otros')),
    valor          DECIMAL(12,2) NOT NULL,
    referencia     TEXT
);

-- Proveedores
CREATE TABLE IF NOT EXISTS public.proveedores (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id       UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    ruc              TEXT NOT NULL,
    nombre_empresa   TEXT NOT NULL,
    nombre_encargado TEXT,
    direccion        TEXT,
    correo           TEXT,
    telefono         TEXT,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Ingresos de Stock (Compras)
CREATE TABLE IF NOT EXISTS public.ingresos_stock (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id     UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    proveedor_id   UUID REFERENCES public.proveedores(id) ON DELETE SET NULL,
    numero_factura TEXT,
    fecha_ingreso  DATE DEFAULT CURRENT_DATE,
    observaciones  TEXT,
    total          DECIMAL(12,2) DEFAULT 0,
    created_by     UUID REFERENCES auth.users,
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Detalles Ingreso Stock
CREATE TABLE IF NOT EXISTS public.detalle_ingresos_stock (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ingreso_id     UUID REFERENCES public.ingresos_stock(id) ON DELETE CASCADE,
    producto_id    UUID REFERENCES public.productos(id) ON DELETE SET NULL,
    cantidad       DECIMAL(12,2) NOT NULL,
    costo_unitario DECIMAL(12,2) NOT NULL,
    subtotal       DECIMAL(12,2)
);

-- Kardex (Movimientos de Inventario)
CREATE TABLE IF NOT EXISTS public.kardex (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id            UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    producto_id           UUID REFERENCES public.productos(id) ON DELETE CASCADE,
    fecha                 TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    tipo_movimiento       TEXT NOT NULL CHECK (tipo_movimiento IN ('ENTRADA', 'SALIDA')),
    motivo                TEXT NOT NULL,
    documento_referencia  TEXT,
    cantidad              DECIMAL(12,2) NOT NULL,
    costo_unitario        DECIMAL(12,2),
    saldo_cantidad        DECIMAL(12,2),
    saldo_costo_promedio  DECIMAL(12,2),
    created_at            TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Sesiones de Caja
CREATE TABLE IF NOT EXISTS public.caja_sesiones (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    usuario_id      UUID REFERENCES auth.users(id),
    base_inicial    DECIMAL(12,2) DEFAULT 0,
    total_efectivo  DECIMAL(12,2),
    total_otros     DECIMAL(12,2),
    estado          TEXT DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
    fecha_apertura  TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    fecha_cierre    TIMESTAMP WITH TIME ZONE,
    observaciones   TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Tablas de Mesas y Pedidos (mantenidas por compatibilidad, no se usan en QuickInvoice)
CREATE TABLE IF NOT EXISTS public.mesas (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    numero     TEXT NOT NULL,
    capacidad  INTEGER DEFAULT 4,
    estado     TEXT DEFAULT 'libre' CHECK (estado IN ('libre', 'ocupada', 'reservada', 'atendida')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.pedidos (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    mesa_id    UUID REFERENCES public.mesas(id) ON DELETE SET NULL,
    mesero_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    estado     TEXT DEFAULT 'pendiente',
    total      DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.pedido_detalles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pedido_id       UUID REFERENCES public.pedidos(id) ON DELETE CASCADE,
    producto_id     UUID REFERENCES public.productos(id) ON DELETE SET NULL,
    cantidad        DECIMAL(12,2) NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    subtotal        DECIMAL(12,2) NOT NULL,
    notas           TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ───────────────────────────────────────────────────
-- 3. FUNCIONES DE SEGURIDAD (SECURITY DEFINER)
-- ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rol = 'admin_plataforma');
END; $$;

CREATE OR REPLACE FUNCTION public.is_oficina()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rol = 'oficina');
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_empresa_id()
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid());
END; $$;

-- ───────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY (RLS)
-- ───────────────────────────────────────────────────

-- Activar RLS en todas las tablas
DO $$
DECLARE tbl TEXT;
BEGIN
    FOR tbl IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    END LOOP;
END $$;

-- Limpiar políticas existentes (evitar duplicados)
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- Políticas para profiles
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_platform_admin() OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina()));

CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid() OR public.is_platform_admin() OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina()));

CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.is_platform_admin() OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina()));

CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated
USING (public.is_platform_admin() OR (empresa_id = public.get_my_empresa_id() AND public.is_oficina()));

-- Políticas para empresas
CREATE POLICY "empresas_select" ON public.empresas FOR SELECT TO authenticated
USING (public.is_platform_admin() OR id = public.get_my_empresa_id());

CREATE POLICY "empresas_insert" ON public.empresas FOR INSERT TO authenticated
WITH CHECK (public.is_platform_admin());

CREATE POLICY "empresas_update" ON public.empresas FOR UPDATE TO authenticated
USING (public.is_platform_admin() OR (id = public.get_my_empresa_id() AND public.is_oficina()));

CREATE POLICY "empresas_delete" ON public.empresas FOR DELETE TO authenticated
USING (public.is_platform_admin());

-- Políticas genéricas para tablas CON columna empresa_id
DO $$
DECLARE tbl TEXT;
BEGIN
    FOR tbl IN (
        -- Solo tablas que realmente tienen la columna empresa_id
        SELECT c.table_name
        FROM information_schema.columns c
        JOIN pg_tables t ON t.tablename = c.table_name AND t.schemaname = 'public'
        WHERE c.table_schema = 'public'
          AND c.column_name = 'empresa_id'
          AND c.table_name NOT IN ('profiles', 'empresas')
    )
    LOOP
        EXECUTE format(
            'CREATE POLICY "%I_all_policy" ON public.%I FOR ALL TO authenticated
             USING (public.is_platform_admin() OR empresa_id = public.get_my_empresa_id())
             WITH CHECK (public.is_platform_admin() OR empresa_id = public.get_my_empresa_id());',
            tbl, tbl
        );
    END LOOP;
END $$;

-- Políticas para tablas HIJAS (sin empresa_id, seguridad heredada por FK)
-- comprobante_detalles: acceso si el comprobante padre pertenece a la empresa
CREATE POLICY "comprobante_detalles_all_policy" ON public.comprobante_detalles
    FOR ALL TO authenticated
    USING (
        public.is_platform_admin()
        OR EXISTS (
            SELECT 1 FROM public.comprobantes c
            WHERE c.id = comprobante_id
              AND c.empresa_id = public.get_my_empresa_id()
        )
    )
    WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
            SELECT 1 FROM public.comprobantes c
            WHERE c.id = comprobante_id
              AND c.empresa_id = public.get_my_empresa_id()
        )
    );

-- comprobante_pagos: ídem
CREATE POLICY "comprobante_pagos_all_policy" ON public.comprobante_pagos
    FOR ALL TO authenticated
    USING (
        public.is_platform_admin()
        OR EXISTS (
            SELECT 1 FROM public.comprobantes c
            WHERE c.id = comprobante_id
              AND c.empresa_id = public.get_my_empresa_id()
        )
    )
    WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
            SELECT 1 FROM public.comprobantes c
            WHERE c.id = comprobante_id
              AND c.empresa_id = public.get_my_empresa_id()
        )
    );

-- pedido_detalles: acceso si el pedido padre pertenece a la empresa
CREATE POLICY "pedido_detalles_all_policy" ON public.pedido_detalles
    FOR ALL TO authenticated
    USING (
        public.is_platform_admin()
        OR EXISTS (
            SELECT 1 FROM public.pedidos p
            WHERE p.id = pedido_id
              AND p.empresa_id = public.get_my_empresa_id()
        )
    )
    WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
            SELECT 1 FROM public.pedidos p
            WHERE p.id = pedido_id
              AND p.empresa_id = public.get_my_empresa_id()
        )
    );

-- detalle_ingresos_stock: acceso si el ingreso padre pertenece a la empresa
CREATE POLICY "detalle_ingresos_stock_all_policy" ON public.detalle_ingresos_stock
    FOR ALL TO authenticated
    USING (
        public.is_platform_admin()
        OR EXISTS (
            SELECT 1 FROM public.ingresos_stock i
            WHERE i.id = ingreso_id
              AND i.empresa_id = public.get_my_empresa_id()
        )
    )
    WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
            SELECT 1 FROM public.ingresos_stock i
            WHERE i.id = ingreso_id
              AND i.empresa_id = public.get_my_empresa_id()
        )
    );

-- ───────────────────────────────────────────────────
-- 5. GRANTS
-- ───────────────────────────────────────────────────
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ───────────────────────────────────────────────────
-- 6. DATOS INICIALES (SEED)
-- ───────────────────────────────────────────────────
DO $$
DECLARE
    empresa_uuid UUID := '00000000-0000-0000-0000-000000000001';
    cat_electricos     UUID;
    cat_pinturas       UUID;
    cat_fontaneria     UUID;
    cat_herramientas   UUID;
    cat_ferreteria     UUID;
    cat_seguridad      UUID;
    cat_construccion   UUID;
    cat_madera         UUID;
BEGIN
    -- ── 6.1 Empresa Principal ────────────────────────
    INSERT INTO public.empresas (id, ruc, nombre, direccion, telefono)
    VALUES (empresa_uuid, '1790000000001', 'Ferretería QuickInvoice', 'Quito, Ecuador', '0999999999')
    ON CONFLICT (ruc) DO UPDATE SET nombre = EXCLUDED.nombre;

    -- ── 6.2 Categorías de Ferretería ─────────────────
    INSERT INTO public.categorias (empresa_id, nombre, tipo) VALUES
        (empresa_uuid, 'Eléctricos',         'ferreteria'),
        (empresa_uuid, 'Pinturas y Acabados', 'ferreteria'),
        (empresa_uuid, 'Fontanería',          'ferreteria'),
        (empresa_uuid, 'Herramientas',        'ferreteria'),
        (empresa_uuid, 'Ferretería General',  'ferreteria'),
        (empresa_uuid, 'Seguridad',           'ferreteria'),
        (empresa_uuid, 'Construcción',        'ferreteria'),
        (empresa_uuid, 'Madera y Tableros',   'ferreteria')
    ON CONFLICT DO NOTHING;

    -- Recuperar IDs de categorías
    SELECT id INTO cat_electricos   FROM public.categorias WHERE nombre = 'Eléctricos'          AND empresa_id = empresa_uuid LIMIT 1;
    SELECT id INTO cat_pinturas     FROM public.categorias WHERE nombre = 'Pinturas y Acabados'  AND empresa_id = empresa_uuid LIMIT 1;
    SELECT id INTO cat_fontaneria   FROM public.categorias WHERE nombre = 'Fontanería'           AND empresa_id = empresa_uuid LIMIT 1;
    SELECT id INTO cat_herramientas FROM public.categorias WHERE nombre = 'Herramientas'         AND empresa_id = empresa_uuid LIMIT 1;
    SELECT id INTO cat_ferreteria   FROM public.categorias WHERE nombre = 'Ferretería General'   AND empresa_id = empresa_uuid LIMIT 1;
    SELECT id INTO cat_seguridad    FROM public.categorias WHERE nombre = 'Seguridad'            AND empresa_id = empresa_uuid LIMIT 1;
    SELECT id INTO cat_construccion FROM public.categorias WHERE nombre = 'Construcción'         AND empresa_id = empresa_uuid LIMIT 1;
    SELECT id INTO cat_madera       FROM public.categorias WHERE nombre = 'Madera y Tableros'    AND empresa_id = empresa_uuid LIMIT 1;

    -- ── 6.3 Productos de Ferretería ─────────────────
    -- ELÉCTRICOS
    IF cat_electricos IS NOT NULL THEN
        INSERT INTO public.productos (empresa_id, categoria_id, codigo, nombre, precio_venta, costo_promedio, stock, stock_minimo, maneja_stock, iva_porcentaje) VALUES
        (empresa_uuid, cat_electricos, 'EL-001', 'Cable Encauchetado 2x12 AWG (metro)',      1.85,  0.95, 500, 50, true, 15),
        (empresa_uuid, cat_electricos, 'EL-002', 'Cable Gemelo 2x14 AWG (metro)',            1.20,  0.60, 400, 50, true, 15),
        (empresa_uuid, cat_electricos, 'EL-003', 'Tomacorriente Doble LEVITON',              4.50,  2.20,  80, 10, true, 15),
        (empresa_uuid, cat_electricos, 'EL-004', 'Interruptor Simple BTICINO',               3.80,  1.90,  60, 10, true, 15),
        (empresa_uuid, cat_electricos, 'EL-005', 'Foco LED 10W Blanco Frío',                 2.50,  1.20, 200, 20, true, 15),
        (empresa_uuid, cat_electricos, 'EL-006', 'Breaker 1P 20A GENERAL ELECTRIC',        12.00,  6.00,  30,  5, true, 15),
        (empresa_uuid, cat_electricos, 'EL-007', 'Caja Térmica 4P 63A SCHNEIDER',          85.00, 42.00,  10,  2, true, 15),
        (empresa_uuid, cat_electricos, 'EL-008', 'Cinta Aislante 3M 20m',                   1.50,  0.70, 150, 20, true, 15),
        (empresa_uuid, cat_electricos, 'EL-009', 'Taipe Plástico Negro 19mm x 10m',         1.00,  0.50, 200, 30, true, 15),
        (empresa_uuid, cat_electricos, 'EL-010', 'Enchufe Redondo 2P+T 16A',                2.20,  1.10,  80, 10, true, 15);
    END IF;

    -- PINTURAS
    IF cat_pinturas IS NOT NULL THEN
        INSERT INTO public.productos (empresa_id, categoria_id, codigo, nombre, precio_venta, costo_promedio, stock, stock_minimo, maneja_stock, iva_porcentaje) VALUES
        (empresa_uuid, cat_pinturas, 'PI-001', 'Pintura de Caucho Interior Blanco 1 galón',   18.50,  9.50,  60,  5, true, 15),
        (empresa_uuid, cat_pinturas, 'PI-002', 'Pintura de Caucho Exterior Blanco 1 galón',   22.00, 11.00,  50,  5, true, 15),
        (empresa_uuid, cat_pinturas, 'PI-003', 'Pintura Esmalte Negro Satinado 1 galón',      28.00, 14.00,  30,  3, true, 15),
        (empresa_uuid, cat_pinturas, 'PI-004', 'Lija en Pliego #80',                           0.45,  0.20, 300, 50, true, 15),
        (empresa_uuid, cat_pinturas, 'PI-005', 'Lija en Pliego #120',                          0.45,  0.20, 300, 50, true, 15),
        (empresa_uuid, cat_pinturas, 'PI-006', 'Rodillo de Pintura 9" con paleta',             5.50,  2.75,  40,  5, true, 15),
        (empresa_uuid, cat_pinturas, 'PI-007', 'Brocha 3" Cerda Natural',                      3.20,  1.60,  60,  8, true, 15),
        (empresa_uuid, cat_pinturas, 'PI-008', 'Sellador Acrílico Interior 1 galón',          15.00,  7.50,  25,  3, true, 15),
        (empresa_uuid, cat_pinturas, 'PI-009', 'Thinner Normal 1 litro',                       2.80,  1.40,  80, 10, true, 15),
        (empresa_uuid, cat_pinturas, 'PI-010', 'Masilla Plástica 1 kg',                        6.00,  3.00,  40,  5, true, 15);
    END IF;

    -- FONTANERÍA
    IF cat_fontaneria IS NOT NULL THEN
        INSERT INTO public.productos (empresa_id, categoria_id, codigo, nombre, precio_venta, costo_promedio, stock, stock_minimo, maneja_stock, iva_porcentaje) VALUES
        (empresa_uuid, cat_fontaneria, 'FO-001', 'Tubo PVC Presión 1/2" x 6m',                4.50,  2.25,  80,  8, true, 15),
        (empresa_uuid, cat_fontaneria, 'FO-002', 'Tubo PVC Presión 3/4" x 6m',                6.20,  3.10,  60,  6, true, 15),
        (empresa_uuid, cat_fontaneria, 'FO-003', 'Codo PVC 1/2" 90°',                         0.35,  0.15, 500, 50, true, 15),
        (empresa_uuid, cat_fontaneria, 'FO-004', 'Tee PVC 1/2"',                              0.40,  0.18, 400, 40, true, 15),
        (empresa_uuid, cat_fontaneria, 'FO-005', 'Llave de Paso 1/2" Cromada',                6.50,  3.25,  50,  5, true, 15),
        (empresa_uuid, cat_fontaneria, 'FO-006', 'Pegamento Tangit 120cc',                    5.80,  2.90,  40,  5, true, 15),
        (empresa_uuid, cat_fontaneria, 'FO-007', 'Cinta Teflón 1/2" x 10m',                   0.45,  0.20, 300, 30, true, 15),
        (empresa_uuid, cat_fontaneria, 'FO-008', 'Llave de Chorro Jardín 1/2"',               8.50,  4.25,  30,  3, true, 15),
        (empresa_uuid, cat_fontaneria, 'FO-009', 'Fluxómetro Empotrable para Inodoro',       35.00, 17.50,  15,  2, true, 15),
        (empresa_uuid, cat_fontaneria, 'FO-010', 'Empaque Plano 1/2" (paquete 10u)',          0.80,  0.35, 200, 20, true, 15);
    END IF;

    -- HERRAMIENTAS
    IF cat_herramientas IS NOT NULL THEN
        INSERT INTO public.productos (empresa_id, categoria_id, codigo, nombre, precio_venta, costo_promedio, stock, stock_minimo, maneja_stock, iva_porcentaje) VALUES
        (empresa_uuid, cat_herramientas, 'HE-001', 'Martillo Carpintero 16oz STANLEY',        18.50,  9.25, 20, 2, true, 15),
        (empresa_uuid, cat_herramientas, 'HE-002', 'Destornillador Plano 6" STANLEY',          5.50,  2.75, 30, 3, true, 15),
        (empresa_uuid, cat_herramientas, 'HE-003', 'Destornillador Estrella #2 STANLEY',       5.50,  2.75, 30, 3, true, 15),
        (empresa_uuid, cat_herramientas, 'HE-004', 'Llave Ajustable Inglesa 10" BAHCO',       25.00, 12.50, 15, 2, true, 15),
        (empresa_uuid, cat_herramientas, 'HE-005', 'Juego Llaves Corona 8-32mm 12p STANLEY',  65.00, 32.50, 10, 1, true, 15),
        (empresa_uuid, cat_herramientas, 'HE-006', 'Nivel Burbuja Aluminio 60cm',             12.00,  6.00, 20, 2, true, 15),
        (empresa_uuid, cat_herramientas, 'HE-007', 'Flexómetro 5m STANLEY',                   9.50,  4.75, 25, 3, true, 15),
        (empresa_uuid, cat_herramientas, 'HE-008', 'Serrucho 22" STANLEY',                   18.00,  9.00, 12, 2, true, 15),
        (empresa_uuid, cat_herramientas, 'HE-009', 'Alicate Universal 8" KNIPEX',            22.00, 11.00, 15, 2, true, 15),
        (empresa_uuid, cat_herramientas, 'HE-010', 'Taladro Percutor 1/2" 750W DEWALT',     120.00, 60.00,  8, 1, true, 15);
    END IF;

    -- FERRETERÍA GENERAL
    IF cat_ferreteria IS NOT NULL THEN
        INSERT INTO public.productos (empresa_id, categoria_id, codigo, nombre, precio_venta, costo_promedio, stock, stock_minimo, maneja_stock, iva_porcentaje) VALUES
        (empresa_uuid, cat_ferreteria, 'FG-001', 'Clavo A/C 1" (libra)',                      0.60,  0.28, 200, 20, true, 15),
        (empresa_uuid, cat_ferreteria, 'FG-002', 'Clavo A/C 2" (libra)',                      0.55,  0.25, 200, 20, true, 15),
        (empresa_uuid, cat_ferreteria, 'FG-003', 'Clavo A/C 3" (libra)',                      0.50,  0.22, 200, 20, true, 15),
        (empresa_uuid, cat_ferreteria, 'FG-004', 'Tornillo Autoperforante 3.5x25 (caja 100u)',3.80,  1.80, 100, 10, true, 15),
        (empresa_uuid, cat_ferreteria, 'FG-005', 'Perno Grado 8 1/2"x2" con Tuerca',          0.35,  0.15, 500, 50, true, 15),
        (empresa_uuid, cat_ferreteria, 'FG-006', 'Cerradura Dormitorio YALE Plateada',        28.00, 14.00,  25,  3, true, 15),
        (empresa_uuid, cat_ferreteria, 'FG-007', 'Bisagra Acero 3" (par)',                    2.20,  1.00,  80,  8, true, 15),
        (empresa_uuid, cat_ferreteria, 'FG-008', 'Silicón Transparente 280ml',                4.50,  2.20,  40,  5, true, 15),
        (empresa_uuid, cat_ferreteria, 'FG-009', 'Soldadura Punto Azul 1/8" (libra)',          4.80,  2.30,  60,  8, true, 15),
        (empresa_uuid, cat_ferreteria, 'FG-010', 'Candado YALE 50mm',                        18.00,  9.00,  20,  2, true, 15);
    END IF;

    -- CONSTRUCCIÓN
    IF cat_construccion IS NOT NULL THEN
        INSERT INTO public.productos (empresa_id, categoria_id, codigo, nombre, precio_venta, costo_promedio, stock, stock_minimo, maneja_stock, iva_porcentaje) VALUES
        (empresa_uuid, cat_construccion, 'CO-001', 'Cemento Rocafuerte 50kg',               8.50,  4.50,  50,  5, true,  0),
        (empresa_uuid, cat_construccion, 'CO-002', 'Varilla Corrugada 10mm x 12m',         12.00,  6.50,  40,  4, true,  0),
        (empresa_uuid, cat_construccion, 'CO-003', 'Arena de Río (m³)',                    22.00, 12.00,  20,  2, true,  0),
        (empresa_uuid, cat_construccion, 'CO-004', 'Bloque Alivianado 15x20x40cm',          0.55,  0.28, 500, 50, true,  0),
        (empresa_uuid, cat_construccion, 'CO-005', 'Malla Electrosoldada 15x15 6mm',       18.50,  9.50,  25,  3, true,  0),
        (empresa_uuid, cat_construccion, 'CO-006', 'Impermeabilizante Sika 1 litro',        12.00,  6.00,  30,  3, true, 15),
        (empresa_uuid, cat_construccion, 'CO-007', 'Empaste Interior 20kg SIKA',            18.00,  9.00,  25,  3, true, 15),
        (empresa_uuid, cat_construccion, 'CO-008', 'Porcelana Graiman 45x45 c/m²',         14.00,  7.50,  80,  8, true, 15);
    END IF;

    -- MADERA
    IF cat_madera IS NOT NULL THEN
        INSERT INTO public.productos (empresa_id, categoria_id, codigo, nombre, precio_venta, costo_promedio, stock, stock_minimo, maneja_stock, iva_porcentaje) VALUES
        (empresa_uuid, cat_madera, 'MA-001', 'Tablón Laurel 2x10x250cm',                 18.00,  9.50,  30,  3, true,  0),
        (empresa_uuid, cat_madera, 'MA-002', 'Pingüe 2x4x330cm',                          5.50,  2.80,  80,  8, true,  0),
        (empresa_uuid, cat_madera, 'MA-003', 'Triplex Europino 9mm 1.22x2.44m',          28.00, 15.00,  20,  2, true,  0),
        (empresa_uuid, cat_madera, 'MA-004', 'Tablero MDF 9mm 1.22x2.44m',               32.00, 17.00,  15,  2, true, 15),
        (empresa_uuid, cat_madera, 'MA-005', 'Barniz Marino 1 litro CONDOR',             12.50,  6.50,  25,  3, true, 15);
    END IF;

    -- ── 6.4 Cliente Consumidor Final ─────────────────
    INSERT INTO public.clientes (empresa_id, identificacion, nombre, direccion, telefono, email)
    VALUES (empresa_uuid, '9999999999999', 'CONSUMIDOR FINAL', 'S/D', '9999999999', 'cf@quickinvoice.com')
    ON CONFLICT (empresa_id, identificacion) DO NOTHING;

    -- ── 6.5 Proveedor de ejemplo ─────────────────────
    INSERT INTO public.proveedores (empresa_id, ruc, nombre_empresa, nombre_encargado, telefono, correo)
    VALUES (empresa_uuid, '1790123456001', 'DISTRIBUIDORA FERRETERA S.A.', 'Carlos Morales', '022345678', 'ventas@distribuidora.com')
    ON CONFLICT DO NOTHING;

END $$;

-- =====================================================
-- ✅ BASE DE DATOS QuickInvoice (Ferretería) LISTA
-- =====================================================
-- Categorías creadas: Eléctricos, Pinturas y Acabados, Fontanería,
--   Herramientas, Ferretería General, Seguridad, Construcción, Madera y Tableros
-- Productos: 63 artículos de ferretería con código, stock, IVA configurado
-- Clientes: Consumidor Final preinstalado
-- Formas de pago: efectivo, transferencia, credito, cheque, otros
-- =====================================================

-- ───────────────────────────────────────────────────
-- 7. USUARIOS DE PRUEBA
-- ───────────────────────────────────────────────────
-- IMPORTANTE: Ejecutar con el rol "postgres" o "service_role"
-- Los UUIDs son fijos para facilitar referencias futuras.
-- ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
    empresa_uuid UUID := '00000000-0000-0000-0000-000000000001';
    uid_admin    UUID := '00000000-0000-0000-0000-000000000010';
    uid_user     UUID := '00000000-0000-0000-0000-000000000011';
BEGIN

    -- ── 7.1 SuperAdmin: admin@billenniumsystem.com / Admin@2024 ──
    INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    )
    VALUES (
        uid_admin,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'admin@billenniumsystem.com',
        crypt('Admin@2024', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"nombre":"Super Admin QuickInvoice"}'::jsonb,
        now(),
        now()
    )
    ON CONFLICT (id) DO UPDATE
        SET encrypted_password = crypt('Admin@2024', gen_salt('bf')),
            email_confirmed_at = now(),
            updated_at = now();

    -- Perfil del SuperAdmin
    INSERT INTO public.profiles (id, empresa_id, nombre, email, rol, estado)
    VALUES (uid_admin, empresa_uuid, 'Super Admin QuickInvoice', 'admin@billenniumsystem.com', 'admin_plataforma', 'activo')
    ON CONFLICT (id) DO UPDATE
        SET rol = 'admin_plataforma',
            nombre = 'Super Admin QuickInvoice',
            estado = 'activo';

    -- ── 7.2 Usuario Oficina: user@billenniumsystem.com / user123456 ──
    INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    )
    VALUES (
        uid_user,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'user@billenniumsystem.com',
        crypt('user123456', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"nombre":"Usuario Oficina"}'::jsonb,
        now(),
        now()
    )
    ON CONFLICT (id) DO UPDATE
        SET encrypted_password = crypt('user123456', gen_salt('bf')),
            email_confirmed_at = now(),
            updated_at = now();

    -- Perfil del Usuario Oficina
    INSERT INTO public.profiles (id, empresa_id, nombre, email, rol, estado)
    VALUES (uid_user, empresa_uuid, 'Usuario Oficina', 'user@billenniumsystem.com', 'oficina', 'activo')
    ON CONFLICT (id) DO UPDATE
        SET rol = 'oficina',
            nombre = 'Usuario Oficina',
            estado = 'activo';

    RAISE NOTICE '✅ Usuarios creados:';
    RAISE NOTICE '   admin@billenniumsystem.com / Admin@2024  → admin_plataforma';
    RAISE NOTICE '   user@billenniumsystem.com  / user123456  → oficina';

END $$;

