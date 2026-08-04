-- ============================================================
-- Calculadora de precios (Portal) — tablas nuevas
--
-- Correr manualmente en el SQL Editor del proyecto Supabase
-- ietsocfibsoclienqafq (el mismo que usa frontend/api/index.py,
-- esquema public — no confundir con el esquema "facturacion" de
-- QuickInvoice, que vive en el mismo proyecto pero es otro esquema).
--
-- Reemplaza los precios hardcodeados que hoy viven en el archivo
-- HTML de la calculadora (calculadora-topaz-six.vercel.app) por
-- tablas editables desde el panel admin del Portal.
-- ============================================================

-- Módulos y su precio mensual (antes hardcodeado en el array MODS del HTML)
CREATE TABLE IF NOT EXISTS calculadora_modulos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre      TEXT NOT NULL,
    precio      NUMERIC(10,2) NOT NULL DEFAULT 0,
    orden       INTEGER NOT NULL DEFAULT 0,
    activo      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tramos de recargo por volumen de datos (clientes/artículos/facturas/
-- compras/empleados). El último tramo de cada parámetro tiene
-- es_contactar=true: no se autocalcula precio, se le pide al visitante
-- que contacte a ventas (protege de subestimar clientes de alto volumen).
CREATE TABLE IF NOT EXISTS calculadora_tramos (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parametro     TEXT NOT NULL CHECK (parametro IN ('clientes','articulos','facturas','compras','empleados')),
    orden         INTEGER NOT NULL,
    desde         INTEGER NOT NULL,
    hasta         INTEGER,          -- NULL = sin tope (siempre es el tramo es_contactar)
    recargo       NUMERIC(10,2) NOT NULL DEFAULT 0,
    es_contactar  BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Parámetros globales de la fórmula: recargo % por usuario adicional y
-- descuento automático por empresa (2da, 3ra, 4ta+ empresa en la misma
-- cotización). Fila única (id=1).
CREATE TABLE IF NOT EXISTS calculadora_config (
    id                   INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    recargo_usuario_pct  NUMERIC(5,4) NOT NULL DEFAULT 0.20,
    dtos_multiempresa    NUMERIC(5,4)[] NOT NULL DEFAULT ARRAY[0, 0.15, 0.20, 0.25]::NUMERIC(5,4)[]
);
INSERT INTO calculadora_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Cotizaciones generadas desde la calculadora pública ("Arme usted mismo
-- su plan"). Quedan en estado 'nueva' hasta que un admin las revisa desde
-- el panel; monto_mensual_acordado lo fija el admin al cerrar el contrato
-- (nunca lo calcula ni lo pone el cliente).
CREATE TABLE IF NOT EXISTS cotizaciones (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_nombre          TEXT NOT NULL,
    telefono                TEXT,
    email                   TEXT,
    observaciones           TEXT,
    empresas                JSONB NOT NULL,
    subtotal                NUMERIC(12,2) NOT NULL,
    total                   NUMERIC(12,2) NOT NULL,
    estado                  TEXT NOT NULL DEFAULT 'nueva' CHECK (estado IN ('nueva','contactado','cerrado','descartado')),
    monto_mensual_acordado  NUMERIC(12,2),
    acordado_por            TEXT,
    acordado_en             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Seed inicial — mismos precios que ya usaba el HTML (editables
-- después desde el panel admin, sin tocar código).
-- ============================================================
INSERT INTO calculadora_modulos (nombre, precio, orden) VALUES
    ('Gerencia',       10, 1),
    ('Facturación',    20, 2),
    ('Inventario',     10, 3),
    ('Clientes',       15, 4),
    ('Proveedores',    15, 5),
    ('Financiero',     10, 6),
    ('Contabilidad',   20, 7),
    ('Talento Humano', 30, 8),
    ('Nóminas',        20, 9),
    ('Tributario',     15, 10)
ON CONFLICT DO NOTHING;

-- Tramos propuestos (punto de partida — ajustables luego desde el panel).
INSERT INTO calculadora_tramos (parametro, orden, desde, hasta, recargo, es_contactar) VALUES
    ('clientes', 1,     0,   300,  0, false),
    ('clientes', 2,   301,  1000,  8, false),
    ('clientes', 3,  1001,  3000, 18, false),
    ('clientes', 4,  3001,  8000, 35, false),
    ('clientes', 5,  8001,  NULL,  0, true),

    ('articulos', 1,     0,   500,  0, false),
    ('articulos', 2,   501,  2000,  8, false),
    ('articulos', 3,  2001,  5000, 18, false),
    ('articulos', 4,  5001, 15000, 35, false),
    ('articulos', 5, 15001,  NULL,  0, true),

    ('facturas', 1,     0,   300,  0, false),
    ('facturas', 2,   301,  1000, 15, false),
    ('facturas', 3,  1001,  3000, 35, false),
    ('facturas', 4,  3001,  8000, 70, false),
    ('facturas', 5,  8001,  NULL,  0, true),

    ('compras', 1,     0,   150,  0, false),
    ('compras', 2,   151,   500,  8, false),
    ('compras', 3,   501,  1500, 18, false),
    ('compras', 4,  1501,  4000, 35, false),
    ('compras', 5,  4001,  NULL,  0, true),

    ('empleados', 1,    0,    15,  0, false),
    ('empleados', 2,   16,    50, 10, false),
    ('empleados', 3,   51,   150, 25, false),
    ('empleados', 4,  151,   400, 50, false),
    ('empleados', 5,  401,  NULL,  0, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Rollback (comentado)
-- ============================================================
-- DROP TABLE IF EXISTS cotizaciones;
-- DROP TABLE IF EXISTS calculadora_config;
-- DROP TABLE IF EXISTS calculadora_tramos;
-- DROP TABLE IF EXISTS calculadora_modulos;
