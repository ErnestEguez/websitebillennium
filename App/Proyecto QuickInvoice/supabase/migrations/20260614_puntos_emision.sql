-- Migration: Puntos de Emisión SRI (multi-punto de emisión por empresa)
-- Description: Crea la tabla puntos_emision (establecimiento + punto de emisión + secuenciales
--   por tipo de comprobante), una RPC atómica para obtener el siguiente secuencial, migra los
--   valores actuales de empresas.config_sri a una fila "Principal" por empresa, y agrega
--   columnas opcionales de vínculo en bodegas y caja_sesiones.
--
-- Nota: todas las tablas viven en el schema "facturacion" (el cliente Supabase del frontend
-- usa db.schema = 'facturacion' por defecto).

-- 1. Tabla puntos_emision
CREATE TABLE IF NOT EXISTS facturacion.puntos_emision (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    establecimiento TEXT NOT NULL,
    punto_emision TEXT NOT NULL,
    nombre TEXT NOT NULL,
    direccion TEXT,
    descripcion TEXT,
    secuenciales JSONB NOT NULL DEFAULT '{}'::jsonb,
    bodega_id UUID,
    es_principal BOOLEAN NOT NULL DEFAULT false,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE (empresa_id, establecimiento, punto_emision)
);

-- 2. RLS Policies (mismo patrón multiempresa que las correcciones de
--    20260612_fix_rls_multiempresa_compras.sql / _finance.sql)
ALTER TABLE facturacion.puntos_emision ENABLE ROW LEVEL SECURITY;

CREATE POLICY "puntos_emision_empresa" ON facturacion.puntos_emision
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

-- 3. RPC: siguiente secuencial atómico, por punto de emisión + tipo de comprobante.
--    Usa SELECT ... FOR UPDATE para bloquear la fila mientras se incrementa, evitando
--    que dos facturas simultáneas obtengan el mismo número.
CREATE OR REPLACE FUNCTION facturacion.qi_next_secuencial_punto(
    p_punto_emision_id UUID,
    p_tipo_comprobante TEXT DEFAULT 'FACTURA'
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_siguiente INTEGER;
BEGIN
    SELECT COALESCE((secuenciales ->> p_tipo_comprobante)::int, 0) + 1
      INTO v_siguiente
      FROM facturacion.puntos_emision
     WHERE id = p_punto_emision_id
     FOR UPDATE;

    IF v_siguiente IS NULL THEN
        RAISE EXCEPTION 'Punto de emisión % no encontrado', p_punto_emision_id;
    END IF;

    UPDATE facturacion.puntos_emision
       SET secuenciales = jsonb_set(secuenciales, ARRAY[p_tipo_comprobante], to_jsonb(v_siguiente)),
           updated_at = timezone('utc'::text, now())
     WHERE id = p_punto_emision_id;

    RETURN v_siguiente;
END;
$$;

-- 4. Migración de datos: 1 fila "Principal" por empresa, a partir de config_sri.
--    El secuencial de FACTURA se inicializa con el MAX(secuencial) ya emitido (o
--    secuencial_inicio - 1 si todavía no hay facturas), para no retroceder numeración.
INSERT INTO facturacion.puntos_emision (empresa_id, establecimiento, punto_emision, nombre, secuenciales, es_principal, activo)
SELECT
    e.id,
    COALESCE(e.config_sri ->> 'establecimiento', '001'),
    COALESCE(e.config_sri ->> 'punto_emision', '001'),
    'Principal',
    jsonb_build_object(
        'FACTURA',
        COALESCE(
            (SELECT MAX(split_part(c.secuencial, '-', 3)::int)
               FROM facturacion.comprobantes c
              WHERE c.empresa_id = e.id
                AND c.tipo_comprobante = 'FACTURA'
                AND c.secuencial LIKE (COALESCE(e.config_sri ->> 'establecimiento', '001') || '-' || COALESCE(e.config_sri ->> 'punto_emision', '001') || '-%')
            ),
            COALESCE((e.config_sri ->> 'secuencial_inicio')::int, 1) - 1,
            0
        )
    ),
    true,
    true
FROM facturacion.empresas e
WHERE NOT EXISTS (
    SELECT 1 FROM facturacion.puntos_emision pe
     WHERE pe.empresa_id = e.id
       AND pe.establecimiento = COALESCE(e.config_sri ->> 'establecimiento', '001')
       AND pe.punto_emision  = COALESCE(e.config_sri ->> 'punto_emision', '001')
);

-- 5. Vínculos opcionales (Fase 2): bodega = local físico con su propio punto de emisión,
--    y sesión de caja que eligió un punto de emisión específico.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'facturacion' AND table_name = 'bodegas' AND column_name = 'punto_emision_id') THEN
        ALTER TABLE facturacion.bodegas ADD COLUMN punto_emision_id UUID REFERENCES facturacion.puntos_emision(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'facturacion' AND table_name = 'caja_sesiones' AND column_name = 'punto_emision_id') THEN
        ALTER TABLE facturacion.caja_sesiones ADD COLUMN punto_emision_id UUID REFERENCES facturacion.puntos_emision(id) ON DELETE SET NULL;
    END IF;
END $$;
