-- ============================================================
-- UNIDADES DE MEDIDA — 2026-08-09
-- Esquema: facturacion
-- Punto 2C del plan de desarrollo: catálogo de unidades editable por
-- empresa (mismo patrón que facturacion.lineas / facturacion.subcategorias,
-- ver 20260708_mejoras_generales.sql), vinculado a productos.
-- ============================================================

CREATE TABLE IF NOT EXISTS facturacion.unidades (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id  UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    codigo      TEXT NOT NULL,
    nombre      TEXT NOT NULL,
    activo      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc', now()),
    UNIQUE (empresa_id, codigo)
);
ALTER TABLE facturacion.unidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "unidades_empresa" ON facturacion.unidades
    USING (empresa_id = (SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()));
GRANT ALL ON facturacion.unidades TO authenticated, service_role;

ALTER TABLE facturacion.productos
    ADD COLUMN IF NOT EXISTS unidad_id UUID REFERENCES facturacion.unidades(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_productos_unidad ON facturacion.productos(unidad_id);
CREATE INDEX IF NOT EXISTS idx_unidades_empresa  ON facturacion.unidades(empresa_id);

-- Sembrar unidades más usuales para cada empresa ya existente
INSERT INTO facturacion.unidades (empresa_id, codigo, nombre)
SELECT e.id, u.codigo, u.nombre
FROM facturacion.empresas e
CROSS JOIN (VALUES
    ('UND',  'Unidad'),
    ('CJ',   'Caja'),
    ('PAR',  'Par'),
    ('DOC',  'Docena'),
    ('KG',   'Kilogramo'),
    ('GR',   'Gramo'),
    ('LT',   'Litro'),
    ('ML',   'Mililitro'),
    ('MT',   'Metro'),
    ('CM',   'Centímetro'),
    ('GL',   'Galón'),
    ('SAC',  'Saco'),
    ('ROL',  'Rollo'),
    ('JGO',  'Juego'),
    ('SERV', 'Servicio')
) AS u(codigo, nombre)
ON CONFLICT (empresa_id, codigo) DO NOTHING;
