-- ============================================================
-- RETENCIONES DE CLIENTES — registro, distribución de pago y
-- cobro posterior desde Cartera CxC
--
-- Replica el patrón ya existente de retenciones_compras (proveedores),
-- reutilizando el mismo catálogo facturacion.codigos_retencion (FUENTE/IVA)
-- sin tocarlo. No modifica xmlGenerator.ts ni el flujo de firma/envío al
-- SRI — confirmado que formasPagoSri ya tiene fallback seguro a "01" para
-- cualquier metodo_pago no mapeado (mismo comportamiento que ya usan hoy
-- 'nota_credito'/'cheque_fecha'/'otros' en producción).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Campo de observación libre del usuario en el comprobante
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturacion.comprobantes
    ADD COLUMN IF NOT EXISTS observacion TEXT;

-- ────────────────────────────────────────────────────────────
-- 2. Tabla de retenciones de ventas (espejo de retenciones_compras)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.retenciones_ventas (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id       UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    comprobante_id   UUID NOT NULL REFERENCES facturacion.comprobantes(id) ON DELETE CASCADE,
    cliente_id       UUID NOT NULL REFERENCES facturacion.clientes(id),

    numero_retencion TEXT,                  -- N° del comprobante que emite el cliente (si lo trae)
    fecha_emision    DATE,

    tipo             TEXT NOT NULL CHECK (tipo IN ('FUENTE','IVA')),
    codigo_retencion TEXT NOT NULL,         -- referencia lógica a codigos_retencion.codigo (mismo catálogo de compras)
    descripcion      TEXT,
    base_imponible   DECIMAL(12,2) NOT NULL,
    porcentaje       DECIMAL(6,2)  NOT NULL,
    valor            DECIMAL(12,2) NOT NULL,

    estado           TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','ANULADO')),
    -- FACTURA: se capturó al emitir la factura (el cliente ya traía la retención)
    -- CARTERA: se capturó después, al recibir el comprobante físico y bajar el saldo pendiente
    origen           TEXT NOT NULL DEFAULT 'FACTURA' CHECK (origen IN ('FACTURA','CARTERA')),

    created_by       UUID REFERENCES facturacion.profiles(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_retenciones_ventas_comprobante ON facturacion.retenciones_ventas(comprobante_id);
CREATE INDEX IF NOT EXISTS idx_retenciones_ventas_empresa     ON facturacion.retenciones_ventas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_retenciones_ventas_cliente     ON facturacion.retenciones_ventas(cliente_id);

ALTER TABLE facturacion.retenciones_ventas ENABLE ROW LEVEL SECURITY;

-- Mismo patrón YA CORREGIDO de multiempresa que usa retenciones_compras
-- (20260612_fix_rls_multiempresa_compras.sql), no la versión original que
-- solo validaba profiles.empresa_id.
DROP POLICY IF EXISTS "retenciones_ventas_empresa" ON facturacion.retenciones_ventas;
CREATE POLICY "retenciones_ventas_empresa" ON facturacion.retenciones_ventas
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

GRANT ALL ON facturacion.retenciones_ventas TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 3. Permitir retención como forma de pago en Cartera CxC
--
-- cartera_cxc_pagos.metodo_pago y .tipo_pago tienen CHECK constraints
-- independientes, creados SIN NOMBRE explícito en crear_schema_facturacion.sql
-- (ninguna migración posterior los tocó ni renombró). En vez de asumir el
-- nombre por defecto que Postgres les puso, este bloque los busca en
-- pg_constraint por su definición real y los elimina por su nombre
-- verdadero, sea cual sea — igual que pediste verificar con:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'facturacion.cartera_cxc_pagos'::regclass AND contype = 'c';
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_constraint_metodo TEXT;
    v_constraint_tipo   TEXT;
BEGIN
    -- Constraint que define los valores válidos de metodo_pago
    SELECT conname INTO v_constraint_metodo
    FROM pg_constraint
    WHERE conrelid = 'facturacion.cartera_cxc_pagos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%metodo_pago%';

    IF v_constraint_metodo IS NOT NULL THEN
        EXECUTE format('ALTER TABLE facturacion.cartera_cxc_pagos DROP CONSTRAINT %I', v_constraint_metodo);
        RAISE NOTICE 'Eliminado constraint de metodo_pago: %', v_constraint_metodo;
    ELSE
        RAISE NOTICE 'No se encontró un CHECK constraint existente sobre metodo_pago — se creará uno nuevo.';
    END IF;

    -- Constraint que define los valores válidos de tipo_pago (independiente del anterior)
    SELECT conname INTO v_constraint_tipo
    FROM pg_constraint
    WHERE conrelid = 'facturacion.cartera_cxc_pagos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tipo_pago%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%metodo_pago%';

    IF v_constraint_tipo IS NOT NULL THEN
        EXECUTE format('ALTER TABLE facturacion.cartera_cxc_pagos DROP CONSTRAINT %I', v_constraint_tipo);
        RAISE NOTICE 'Eliminado constraint de tipo_pago: %', v_constraint_tipo;
    ELSE
        RAISE NOTICE 'No se encontró un CHECK constraint existente sobre tipo_pago — se creará uno nuevo.';
    END IF;
END $$;

-- Se recrean con nombre explícito (evita esta misma ambigüedad en el futuro)
ALTER TABLE facturacion.cartera_cxc_pagos
    ADD CONSTRAINT cartera_cxc_pagos_metodo_pago_check
        CHECK (metodo_pago IN ('efectivo','transferencia','cheque','tarjeta','nota_credito','otros','retencion_fuente','retencion_iva'));

ALTER TABLE facturacion.cartera_cxc_pagos
    ADD CONSTRAINT cartera_cxc_pagos_tipo_pago_check
        CHECK (tipo_pago IN ('efectivo','transferencia','cheque','tarjeta','nota_credito','retencion_fuente','retencion_iva'));

-- ────────────────────────────────────────────────────────────
-- Verificación sugerida después de correr esta migración:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'facturacion.cartera_cxc_pagos'::regclass AND contype = 'c';
-- Debe mostrar los 2 constraints con los nombres de arriba y ambos
-- valores de retención incluidos.
-- ────────────────────────────────────────────────────────────
