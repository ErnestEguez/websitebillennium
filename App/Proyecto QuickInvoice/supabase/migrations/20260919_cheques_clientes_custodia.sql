-- ============================================================
-- CHEQUES A FECHA DE CLIENTES ("Cheques en Custodia")
--
-- El cliente entrega un cheque post-fechado como garantía de la deuda.
-- Mientras está "en custodia" el cheque NO paga la factura (el saldo de
-- cartera_cxc sigue pendiente) — solo el día que se deposita físicamente
-- en el banco se aplica el pago y se actualiza el saldo bancario.
--
-- Se modela reutilizando el trigger fn_actualizar_saldo_cxc ya existente
-- (20260611_fix_triggers_saldo_cxc_cxp.sql), que solo suma pagos con
-- estado = 'activo': un pago insertado con estado = 'en_custodia' NO
-- afecta el saldo de la factura. Al depositar el cheque, el pago pasa a
-- estado = 'activo' (UPDATE OF estado dispara el mismo trigger) y recién
-- ahí se rebaja el saldo — sin tocar la función del trigger.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Tabla de cheques recibidos de clientes
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.cheques_clientes (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id                  UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    cliente_id                  UUID NOT NULL REFERENCES facturacion.clientes(id),

    numero_cheque               TEXT NOT NULL,
    banco_emisor                TEXT,
    monto                       DECIMAL(12,2) NOT NULL CHECK (monto > 0),
    fecha_emision                DATE NOT NULL,  -- fecha en que el cliente entrega el cheque
    fecha_cobro                 DATE NOT NULL,   -- fecha escrita en el cheque (cuándo se debe depositar)

    estado                      TEXT NOT NULL DEFAULT 'en_custodia'
                                     CHECK (estado IN ('en_custodia','depositado','rechazado','anulado')),

    -- Se completan solo al depositar (o anular/rechazar)
    cuenta_bancaria_destino_id  UUID,   -- finance.cuentas_bancarias(id)
    movimiento_bancario_id      UUID,   -- finance.movimientos_bancarios(id)
    numero_comprobante_deposito TEXT,
    fecha_deposito               DATE,
    lp_comprobante_id           UUID,   -- asiento contable generado al depositar

    observaciones                TEXT,
    motivo_rechazo               TEXT,

    created_by                   UUID REFERENCES facturacion.profiles(id),
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_cheques_clientes_empresa ON facturacion.cheques_clientes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cheques_clientes_cliente ON facturacion.cheques_clientes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cheques_clientes_estado  ON facturacion.cheques_clientes(estado);

ALTER TABLE facturacion.cheques_clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cheques_clientes_empresa" ON facturacion.cheques_clientes;
CREATE POLICY "cheques_clientes_empresa" ON facturacion.cheques_clientes
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

GRANT ALL ON facturacion.cheques_clientes TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 2. cartera_cxc_pagos — vínculo al cheque + nuevos valores válidos
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturacion.cartera_cxc_pagos
    ADD COLUMN IF NOT EXISTS cheque_cliente_id UUID REFERENCES facturacion.cheques_clientes(id);

CREATE INDEX IF NOT EXISTS idx_cartera_cxc_pagos_cheque_cliente
    ON facturacion.cartera_cxc_pagos(cheque_cliente_id);

-- metodo_pago / tipo_pago ya tienen nombre explícito desde
-- 20260731_retenciones_clientes.sql — se agregan 'cheque_fecha'.
ALTER TABLE facturacion.cartera_cxc_pagos DROP CONSTRAINT IF EXISTS cartera_cxc_pagos_metodo_pago_check;
ALTER TABLE facturacion.cartera_cxc_pagos
    ADD CONSTRAINT cartera_cxc_pagos_metodo_pago_check
        CHECK (metodo_pago IN ('efectivo','transferencia','cheque','cheque_fecha','tarjeta','nota_credito','otros','retencion_fuente','retencion_iva'));

ALTER TABLE facturacion.cartera_cxc_pagos DROP CONSTRAINT IF EXISTS cartera_cxc_pagos_tipo_pago_check;
ALTER TABLE facturacion.cartera_cxc_pagos
    ADD CONSTRAINT cartera_cxc_pagos_tipo_pago_check
        CHECK (tipo_pago IN ('efectivo','transferencia','cheque','cheque_fecha','tarjeta','nota_credito','retencion_fuente','retencion_iva'));

-- estado (activo/reversado, agregado sin nombre explícito en
-- 20260610_reversar_pagos_cartera.sql) — se busca por definición real,
-- igual que hizo 20260731 con metodo_pago/tipo_pago, y se agrega
-- 'en_custodia'.
DO $$
DECLARE
    v_constraint_estado TEXT;
BEGIN
    SELECT conname INTO v_constraint_estado
    FROM pg_constraint
    WHERE conrelid = 'facturacion.cartera_cxc_pagos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%estado%'
      AND pg_get_constraintdef(oid) ILIKE '%activo%'
      AND pg_get_constraintdef(oid) ILIKE '%reversado%';

    IF v_constraint_estado IS NOT NULL THEN
        EXECUTE format('ALTER TABLE facturacion.cartera_cxc_pagos DROP CONSTRAINT %I', v_constraint_estado);
        RAISE NOTICE 'Eliminado constraint de estado: %', v_constraint_estado;
    ELSE
        RAISE NOTICE 'No se encontró el CHECK constraint de estado — se creará uno nuevo.';
    END IF;
END $$;

ALTER TABLE facturacion.cartera_cxc_pagos
    ADD CONSTRAINT cartera_cxc_pagos_estado_check
        CHECK (estado IN ('activo','reversado','en_custodia'));

-- ────────────────────────────────────────────────────────────
-- Verificación sugerida después de correr esta migración:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'facturacion.cartera_cxc_pagos'::regclass AND contype = 'c';
--   -- metodo_pago/tipo_pago deben incluir 'cheque_fecha', estado debe incluir 'en_custodia'
--
--   SELECT * FROM facturacion.cheques_clientes LIMIT 1;
--   -- debe existir vacía, sin error
-- ────────────────────────────────────────────────────────────
