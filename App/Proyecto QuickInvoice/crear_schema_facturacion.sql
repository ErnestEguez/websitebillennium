-- ============================================================
-- CREACIÓN COMPLETA DEL SCHEMA facturacion
-- Portal Billennium — QuickInvoice
-- 21 tablas exactas del proyecto origen (rilwyfwcsjgifftljkab)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- Proyecto destino: ietsocfibsoclienqafq (Portal)
-- ============================================================

-- ── 0. SCHEMA Y PERMISOS BASE ───────────────────────────────

CREATE SCHEMA IF NOT EXISTS facturacion;
GRANT USAGE ON SCHEMA facturacion TO anon, authenticated, service_role;

-- ── 1. EMPRESAS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS facturacion.empresas (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ruc           TEXT UNIQUE NOT NULL,
    nombre        TEXT NOT NULL,
    razon_social  TEXT,
    direccion     TEXT,
    telefono      TEXT,
    config_sri    JSONB DEFAULT '{}'::jsonb,
    logo_url      TEXT,
    habilitar_division_cuenta BOOLEAN DEFAULT false,
    created_at    TIMESTAMPTZ DEFAULT now()
);

-- ── 2. PROFILES (vinculado a auth.users del Portal) ─────────

CREATE TABLE IF NOT EXISTS facturacion.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    empresa_id  UUID REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    nombre      TEXT NOT NULL,
    email       TEXT,
    rol         TEXT CHECK (rol IN ('admin_plataforma', 'oficina', 'mesero', 'cocina')),
    pin         TEXT,
    estado      TEXT DEFAULT 'activo' CHECK (estado IN ('activo', 'baja')),
    fecha_baja  TIMESTAMPTZ,
    motivo_baja TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── 3. CATÁLOGOS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS facturacion.categorias (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    nombre     TEXT NOT NULL,
    tipo       TEXT DEFAULT 'ALIMENTO' CHECK (tipo IN ('ALIMENTO', 'BEBIDA', 'OTROS', 'restaurante')),
    activo     BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facturacion.productos (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id     UUID REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    categoria_id   UUID REFERENCES facturacion.categorias(id) ON DELETE SET NULL,
    nombre         TEXT NOT NULL,
    descripcion    TEXT,
    precio_venta   DECIMAL(12,2) NOT NULL DEFAULT 0,
    costo_promedio DECIMAL(12,2) DEFAULT 0,
    iva_porcentaje DECIMAL(5,2) DEFAULT 15,
    activo         BOOLEAN DEFAULT true,
    maneja_stock   BOOLEAN DEFAULT true,
    stock          DECIMAL(12,2) DEFAULT 0,
    imagen_url     TEXT,
    created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facturacion.subproductos (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id       UUID NOT NULL REFERENCES facturacion.productos(id) ON DELETE CASCADE,
    empresa_id        UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    nombre            VARCHAR(200) NOT NULL,
    precio_sin_iva    NUMERIC(12,4) NOT NULL DEFAULT 0,
    factor_conversion NUMERIC(14,8) NOT NULL DEFAULT 1,
    estado            BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facturacion.clientes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id     UUID REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    identificacion TEXT NOT NULL,
    nombre         TEXT NOT NULL,
    email          TEXT,
    direccion      TEXT,
    telefono       TEXT,
    created_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE(empresa_id, identificacion)
);

CREATE TABLE IF NOT EXISTS facturacion.vendedores (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    nombre     TEXT NOT NULL,
    iniciales  TEXT,
    email      TEXT,
    telefono   TEXT,
    estado     TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'baja')),
    fecha_baja TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facturacion.proveedores (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id       UUID REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    ruc              TEXT NOT NULL,
    nombre_empresa   TEXT NOT NULL,
    nombre_encargado TEXT,
    direccion        TEXT,
    correo           TEXT,
    telefono         TEXT,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facturacion.preciovolumen (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    codigoitem TEXT,
    desde      DECIMAL(12,2),
    hasta      DECIMAL(12,2),
    precio     DECIMAL(12,2),
    status     BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 4. CAJA ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS facturacion.caja_sesiones (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    usuario_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    fecha_apertura      TIMESTAMPTZ DEFAULT now(),
    fecha_cierre        TIMESTAMPTZ,
    base_inicial        DECIMAL(12,2) DEFAULT 0,
    total_efectivo      DECIMAL(12,2) DEFAULT 0,
    total_tarjetas      DECIMAL(12,2) DEFAULT 0,
    total_transferencia DECIMAL(12,2) DEFAULT 0,
    total_otros         DECIMAL(12,2) DEFAULT 0,
    total_propina       DECIMAL(12,2) DEFAULT 0,
    estado              TEXT DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- ── 5. COMPROBANTES (FACTURAS) ───────────────────────────────

CREATE TABLE IF NOT EXISTS facturacion.comprobantes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    cliente_id          UUID REFERENCES facturacion.clientes(id) ON DELETE SET NULL,
    vendedor_id         UUID REFERENCES facturacion.vendedores(id) ON DELETE SET NULL,
    caja_sesion_id      UUID REFERENCES facturacion.caja_sesiones(id) ON DELETE SET NULL,
    tipo_comprobante    TEXT DEFAULT 'FACTURA',
    secuencial          TEXT NOT NULL,
    clave_acceso        TEXT UNIQUE,
    autorizacion_numero TEXT,
    ambiente            TEXT DEFAULT 'PRUEBAS',
    total               DECIMAL(12,2) NOT NULL,
    estado_sri          TEXT DEFAULT 'PENDIENTE',
    estado_sistema      TEXT NOT NULL DEFAULT 'VIGENTE'
                            CHECK (estado_sistema IN ('VIGENTE', 'ANULADA', 'CANCELADA_POR_NC')),
    fecha_autorizacion  TIMESTAMPTZ,
    fecha_anulacion     TIMESTAMPTZ,
    motivo_anulacion    TEXT,
    usuario_anulacion   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    xml_firmado         TEXT,
    observaciones_sri   TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facturacion.comprobante_detalles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comprobante_id  UUID REFERENCES facturacion.comprobantes(id) ON DELETE CASCADE,
    producto_id     UUID,
    subproducto_id  UUID REFERENCES facturacion.subproductos(id),
    nombre_producto TEXT,
    cantidad        DECIMAL(12,2),
    precio_unitario DECIMAL(12,2),
    descuento       DECIMAL(12,2) DEFAULT 0,
    subtotal        DECIMAL(12,2),
    iva_porcentaje  DECIMAL(5,2),
    iva_valor       DECIMAL(12,2),
    total_linea     DECIMAL(12,2)
);

CREATE TABLE IF NOT EXISTS facturacion.comprobante_pagos (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comprobante_id UUID REFERENCES facturacion.comprobantes(id) ON DELETE CASCADE,
    metodo_pago    TEXT NOT NULL,
    valor          DECIMAL(12,2) NOT NULL,
    referencia     TEXT
);

-- ── 6. NOTAS DE CRÉDITO ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS facturacion.notas_credito (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id            UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    comprobante_origen_id UUID NOT NULL REFERENCES facturacion.comprobantes(id),
    cliente_id            UUID NOT NULL REFERENCES facturacion.clientes(id),
    vendedor_id           UUID REFERENCES facturacion.vendedores(id),
    secuencial            TEXT NOT NULL,
    clave_acceso          TEXT UNIQUE,
    tipo_nc               TEXT NOT NULL DEFAULT 'DEVOLUCION'
                              CHECK (tipo_nc IN ('DEVOLUCION', 'DESCUENTO', 'CORRECCION')),
    motivo_sri            TEXT NOT NULL CHECK (motivo_sri IN ('01','02','03','04')),
    motivo_descripcion    TEXT NOT NULL,
    total_sin_impuestos   NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_iva             NUMERIC(14,2) NOT NULL DEFAULT 0,
    total                 NUMERIC(14,2) NOT NULL DEFAULT 0,
    saldo_nc              NUMERIC(14,2) NOT NULL DEFAULT 0,
    estado_sri            TEXT NOT NULL DEFAULT 'PENDIENTE'
                              CHECK (estado_sri IN ('PENDIENTE','ENVIADO','AUTORIZADO','RECHAZADO')),
    autorizacion_numero   TEXT,
    observaciones_sri     TEXT,
    xml_firmado           TEXT,
    usuario_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facturacion.notas_credito_detalle (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nota_credito_id UUID NOT NULL REFERENCES facturacion.notas_credito(id) ON DELETE CASCADE,
    producto_id     UUID,
    nombre_producto TEXT NOT NULL,
    cantidad        NUMERIC(12,4) NOT NULL,
    precio_unitario NUMERIC(14,4) NOT NULL,
    descuento       NUMERIC(14,4) NOT NULL DEFAULT 0,
    subtotal        NUMERIC(14,4) NOT NULL,
    iva_porcentaje  NUMERIC(5,2)  NOT NULL DEFAULT 0,
    iva_valor       NUMERIC(14,4) NOT NULL DEFAULT 0,
    total_linea     NUMERIC(14,4) NOT NULL
);

-- ── 7. CARTERA CxC ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS facturacion.cartera_cxc (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id        UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    comprobante_id    UUID NOT NULL REFERENCES facturacion.comprobantes(id) ON DELETE RESTRICT,
    cliente_id        UUID NOT NULL REFERENCES facturacion.clientes(id) ON DELETE RESTRICT,
    fecha_emision     DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_vencimiento DATE,
    valor_original    DECIMAL(12,2) NOT NULL,
    saldo             DECIMAL(12,2) NOT NULL,
    estado            TEXT NOT NULL DEFAULT 'pendiente'
                          CHECK (estado IN ('pendiente', 'parcial', 'pagada', 'anulada')),
    observaciones     TEXT,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now(),
    UNIQUE (comprobante_id)
);

CREATE TABLE IF NOT EXISTS facturacion.cartera_cxc_pagos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cartera_id      UUID NOT NULL REFERENCES facturacion.cartera_cxc(id) ON DELETE CASCADE,
    empresa_id      UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    fecha_pago      DATE NOT NULL DEFAULT CURRENT_DATE,
    valor           DECIMAL(12,2) NOT NULL CHECK (valor > 0),
    metodo_pago     TEXT NOT NULL DEFAULT 'efectivo'
                        CHECK (metodo_pago IN ('efectivo','transferencia','cheque','tarjeta','nota_credito','otros')),
    tipo_pago       TEXT NOT NULL DEFAULT 'efectivo'
                        CHECK (tipo_pago IN ('efectivo','transferencia','cheque','tarjeta','nota_credito')),
    referencia      TEXT,
    nota_credito_id UUID REFERENCES facturacion.notas_credito(id),
    usuario_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facturacion.aplicaciones_nc_cxc (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nota_credito_id UUID NOT NULL REFERENCES facturacion.notas_credito(id) ON DELETE CASCADE,
    cartera_cxc_id  UUID NOT NULL REFERENCES facturacion.cartera_cxc(id),
    valor_aplicado  NUMERIC(14,2) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 8. INVENTARIO ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS facturacion.ingresos_stock (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id     UUID REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    proveedor_id   UUID REFERENCES facturacion.proveedores(id) ON DELETE SET NULL,
    numero_factura TEXT,
    fecha_ingreso  DATE DEFAULT CURRENT_DATE,
    observaciones  TEXT,
    total          DECIMAL(12,2) DEFAULT 0,
    created_by     UUID REFERENCES auth.users(id),
    created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facturacion.detalle_ingresos_stock (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingreso_id     UUID REFERENCES facturacion.ingresos_stock(id) ON DELETE CASCADE,
    producto_id    UUID REFERENCES facturacion.productos(id) ON DELETE SET NULL,
    cantidad       DECIMAL(12,2) NOT NULL,
    costo_unitario DECIMAL(12,2) NOT NULL,
    subtotal       DECIMAL(12,2)
);

CREATE TABLE IF NOT EXISTS facturacion.kardex (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id           UUID REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    producto_id          UUID REFERENCES facturacion.productos(id) ON DELETE CASCADE,
    fecha                TIMESTAMPTZ DEFAULT now(),
    tipo_movimiento      TEXT NOT NULL CHECK (tipo_movimiento IN ('ENTRADA', 'SALIDA')),
    motivo               TEXT NOT NULL,
    documento_referencia TEXT,
    cantidad             DECIMAL(12,2) NOT NULL,
    costo_unitario       DECIMAL(12,2),
    saldo_cantidad       DECIMAL(12,2),
    saldo_costo_promedio DECIMAL(12,2),
    created_at           TIMESTAMPTZ DEFAULT now()
);

-- ── 9. ÍNDICES ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_fac_comprobantes_empresa  ON facturacion.comprobantes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fac_comprobantes_estado   ON facturacion.comprobantes(empresa_id, estado_sistema);
CREATE INDEX IF NOT EXISTS idx_fac_comprobantes_cliente  ON facturacion.comprobantes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_fac_kardex_producto       ON facturacion.kardex(producto_id);
CREATE INDEX IF NOT EXISTS idx_fac_cartera_cliente       ON facturacion.cartera_cxc(cliente_id);
CREATE INDEX IF NOT EXISTS idx_fac_subproductos_producto ON facturacion.subproductos(producto_id);
CREATE INDEX IF NOT EXISTS idx_fac_subproductos_empresa  ON facturacion.subproductos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fac_nc_empresa            ON facturacion.notas_credito(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fac_nc_origen             ON facturacion.notas_credito(comprobante_origen_id);
CREATE INDEX IF NOT EXISTS idx_fac_aplicaciones_nc       ON facturacion.aplicaciones_nc_cxc(nota_credito_id);
CREATE INDEX IF NOT EXISTS idx_fac_aplicaciones_cx       ON facturacion.aplicaciones_nc_cxc(cartera_cxc_id);

-- ── 10. FUNCIONES DE SEGURIDAD ───────────────────────────────

CREATE OR REPLACE FUNCTION facturacion.get_my_empresa_id()
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = facturacion AS $$
BEGIN
  RETURN (SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid());
END; $$;

CREATE OR REPLACE FUNCTION facturacion.is_platform_admin()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = facturacion AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM facturacion.profiles WHERE id = auth.uid() AND rol = 'admin_plataforma');
END; $$;

CREATE OR REPLACE FUNCTION facturacion.is_oficina()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = facturacion AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM facturacion.profiles WHERE id = auth.uid() AND rol IN ('admin_plataforma','oficina'));
END; $$;

-- ── 11. TRIGGERS ─────────────────────────────────────────────

-- Trigger: actualiza saldo en cartera_cxc cuando entra un pago
CREATE OR REPLACE FUNCTION facturacion.fn_actualizar_saldo_cxc()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = facturacion AS $$
DECLARE v_saldo DECIMAL(12,2);
BEGIN
  SELECT valor_original - COALESCE(SUM(p.valor), 0)
  INTO v_saldo
  FROM facturacion.cartera_cxc c
  LEFT JOIN facturacion.cartera_cxc_pagos p ON p.cartera_id = c.id
  WHERE c.id = NEW.cartera_id
  GROUP BY c.valor_original;

  UPDATE facturacion.cartera_cxc
  SET saldo = GREATEST(v_saldo, 0),
      estado = CASE WHEN v_saldo <= 0 THEN 'pagada'
                    WHEN v_saldo < valor_original THEN 'parcial'
                    ELSE 'pendiente' END,
      updated_at = now()
  WHERE id = NEW.cartera_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_actualizar_saldo_cxc ON facturacion.cartera_cxc_pagos;
CREATE TRIGGER trg_actualizar_saldo_cxc
AFTER INSERT ON facturacion.cartera_cxc_pagos
FOR EACH ROW EXECUTE FUNCTION facturacion.fn_actualizar_saldo_cxc();

-- Trigger: actualiza saldo_nc en notas_credito cuando se aplica a cartera
CREATE OR REPLACE FUNCTION facturacion.fn_actualizar_saldo_nc()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = facturacion AS $$
BEGIN
  UPDATE facturacion.notas_credito
  SET saldo_nc = total - COALESCE((
        SELECT SUM(valor_aplicado)
        FROM facturacion.aplicaciones_nc_cxc
        WHERE nota_credito_id = NEW.nota_credito_id
      ), 0),
      updated_at = now()
  WHERE id = NEW.nota_credito_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_saldo_nc ON facturacion.aplicaciones_nc_cxc;
CREATE TRIGGER trg_saldo_nc
AFTER INSERT ON facturacion.aplicaciones_nc_cxc
FOR EACH ROW EXECUTE FUNCTION facturacion.fn_actualizar_saldo_nc();

-- ── 12. RLS — política permisiva para authenticated ──────────

ALTER TABLE facturacion.empresas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.categorias             ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.productos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.subproductos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.clientes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.vendedores             ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.proveedores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.preciovolumen          ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.caja_sesiones          ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.comprobantes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.comprobante_detalles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.comprobante_pagos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.notas_credito          ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.notas_credito_detalle  ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.aplicaciones_nc_cxc    ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.cartera_cxc            ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.cartera_cxc_pagos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.ingresos_stock         ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.detalle_ingresos_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.kardex                 ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
DECLARE tbls text[] := ARRAY[
  'empresas','profiles','categorias','productos','subproductos','clientes',
  'vendedores','proveedores','preciovolumen','caja_sesiones','comprobantes',
  'comprobante_detalles','comprobante_pagos','notas_credito','notas_credito_detalle',
  'aplicaciones_nc_cxc','cartera_cxc','cartera_cxc_pagos',
  'ingresos_stock','detalle_ingresos_stock','kardex'
];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY "authenticated_full_access" ON facturacion.%I
         FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- ── 13. GRANTS ───────────────────────────────────────────────

GRANT ALL ON ALL TABLES    IN SCHEMA facturacion TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA facturacion TO authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA facturacion TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA facturacion GRANT ALL ON TABLES    TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA facturacion GRANT ALL ON SEQUENCES TO authenticated, service_role;

-- ── 14. STORAGE BUCKETS ──────────────────────────────────────
-- Firmas electrónicas (.p12) — privado
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('firmas_electronicas', 'firmas_electronicas', false, 5242880,
        ARRAY['application/x-pkcs12','application/octet-stream'])
ON CONFLICT (id) DO NOTHING;

-- Logos de empresas — público
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('logos', 'logos', true, 5242880,
        ARRAY['image/png','image/jpeg','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

-- XMLs firmados de comprobantes — privado
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('comprobantes_xml', 'comprobantes_xml', false, 10485760,
        ARRAY['application/xml','text/xml'])
ON CONFLICT (id) DO NOTHING;

-- ── 15. AGREGAR schema al search path de PostgREST ───────────
NOTIFY pgrst, 'reload schema';
