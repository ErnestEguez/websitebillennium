-- ============================================================
-- Ventas a Crédito de Electrodomésticos — Fase 2 (persistencia)
-- ============================================================
-- Tabla paralela a cartera_cxc (NO se toca cartera_cxc en absoluto) —
-- misma decisión ya usada en este proyecto para ventas_pa (Plan
-- Acumulativo), porque cartera_cxc tiene UNIQUE(comprobante_id): una
-- factura = un solo vencimiento, no puede alojar cuotas.
--
-- El trigger de saldo replica exactamente fn_actualizar_saldo_cxc
-- (20260611_fix_triggers_saldo_cxc_cxp.sql), en cascada de dos niveles:
-- pagos → cuota (saldo/estado) → crédito (rollup de todas sus cuotas).
--
-- 100% aditivo. Requiere Fase 0 aplicada (empresas.habilita_ventas_
-- electrodomesticos_credito, config_credito_electrodomesticos, cobradores).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Cabecera del crédito
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.creditos_electrodomesticos (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id                UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    factura_id                UUID NOT NULL REFERENCES facturacion.comprobantes(id) ON DELETE RESTRICT,
    cliente_id                UUID NOT NULL REFERENCES facturacion.clientes(id) ON DELETE RESTRICT,
    -- Garante = una fila más de clientes (misma tabla, sin tabla de roles
    -- en v1 — ver diagnóstico de Fase 0/decisión 3).
    garante_cliente_id        UUID REFERENCES facturacion.clientes(id) ON DELETE SET NULL,
    cobrador_id                UUID NOT NULL REFERENCES facturacion.cobradores(id) ON DELETE RESTRICT,

    fecha_venta                DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_primer_vencimiento   DATE NOT NULL,
    fecha_ultimo_vencimiento   DATE NOT NULL,

    total_factura               NUMERIC(12,2) NOT NULL,
    valor_entrada                NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor_entrada >= 0),
    saldo_a_diferir              NUMERIC(12,2) NOT NULL CHECK (saldo_a_diferir > 0),
    -- Snapshot de la config usada en el momento del cálculo — si la empresa
    -- cambia su config_credito_electrodomesticos después, los créditos ya
    -- calculados no deben cambiar de significado retroactivamente.
    base_calculo_interes         TEXT NOT NULL CHECK (base_calculo_interes IN ('SALDO_DESPUES_ENTRADA','TOTAL_VENTA')),
    tipo_tasa                    TEXT NOT NULL CHECK (tipo_tasa IN ('TASA_PERIODICA','TASA_ANUAL_NOMINAL','TASA_EFECTIVA_ANUAL','FACTOR_ACUMULADO_PLAZO')),
    tasa_valor                   NUMERIC(8,4) NOT NULL,
    periodicidad                 TEXT NOT NULL CHECK (periodicidad IN ('DIARIA','SEMANAL','MENSUAL')),
    numero_cuotas                 INTEGER NOT NULL CHECK (numero_cuotas > 0),

    valor_cuota_referencial       NUMERIC(12,2) NOT NULL,
    total_intereses               NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_financiado              NUMERIC(12,2) NOT NULL,
    total_pagado                  NUMERIC(12,2) NOT NULL DEFAULT 0,
    saldo_pendiente                NUMERIC(12,2) NOT NULL,

    -- Ver Decisión 5 (Fase 0): nunca se guarda el PDF ni lleva secuencial
    -- propio — solo referencia visual/trazabilidad de cuándo se emitió.
    contrato_numero                TEXT,
    pagare_numero                  TEXT,
    contrato_emitido_en            TIMESTAMPTZ,
    pagare_emitido_en              TIMESTAMPTZ,

    -- Subconjunto pragmático de los estados del requerimiento — sin
    -- workflow de aprobación (BORRADOR/PENDIENTE_APROBACION/APROBADO/
    -- REESTRUCTURADO) hasta que exista una pantalla real que lo pida.
    estado                          TEXT NOT NULL DEFAULT 'CALCULADO'
        CHECK (estado IN ('CALCULADO','VIGENTE','EN_MORA','LIQUIDADO','ANULADO')),
    observaciones                   TEXT,

    created_by                       UUID REFERENCES auth.users,
    created_at                       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at                       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    -- Una factura no puede tener más de una operación de crédito.
    UNIQUE (factura_id)
);

CREATE INDEX IF NOT EXISTS idx_credito_electro_empresa   ON facturacion.creditos_electrodomesticos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_credito_electro_cliente   ON facturacion.creditos_electrodomesticos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_credito_electro_garante   ON facturacion.creditos_electrodomesticos(garante_cliente_id) WHERE garante_cliente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credito_electro_cobrador  ON facturacion.creditos_electrodomesticos(cobrador_id);
CREATE INDEX IF NOT EXISTS idx_credito_electro_estado    ON facturacion.creditos_electrodomesticos(empresa_id, estado);

GRANT ALL ON facturacion.creditos_electrodomesticos TO authenticated, service_role;
ALTER TABLE facturacion.creditos_electrodomesticos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "credito_electro_empresa" ON facturacion.creditos_electrodomesticos;
CREATE POLICY "credito_electro_empresa" ON facturacion.creditos_electrodomesticos
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

-- ────────────────────────────────────────────────────────────
-- 2. Cronograma de cuotas (1 fila por cuota)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.creditos_electrodomesticos_cuotas (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id                 UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    credito_id                 UUID NOT NULL REFERENCES facturacion.creditos_electrodomesticos(id) ON DELETE CASCADE,
    numero_cuota                INTEGER NOT NULL CHECK (numero_cuota > 0),
    fecha_vencimiento            DATE NOT NULL,

    saldo_inicial                 NUMERIC(12,2) NOT NULL,
    capital_programado            NUMERIC(12,2) NOT NULL,
    interes_programado            NUMERIC(12,2) NOT NULL,
    otros_cargos_programados      NUMERIC(12,2) NOT NULL DEFAULT 0,
    cuota_programada              NUMERIC(12,2) NOT NULL,
    saldo_final_programado        NUMERIC(12,2) NOT NULL,

    -- Desglose de lo efectivamente cobrado — lo llena el servicio de
    -- cobros (Fase 5) al aplicar cada pago con su política de orden
    -- (mora → interés → capital); el trigger de este archivo solo
    -- mantiene total_pagado/saldo_pendiente/estado desde la SUMA de
    -- pagos activos, no decide cómo se reparte cada pago.
    capital_pagado                 NUMERIC(12,2) NOT NULL DEFAULT 0,
    interes_pagado                 NUMERIC(12,2) NOT NULL DEFAULT 0,
    mora_pagada                    NUMERIC(12,2) NOT NULL DEFAULT 0,
    otros_cargos_pagados           NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_pagado                   NUMERIC(12,2) NOT NULL DEFAULT 0,
    saldo_pendiente                 NUMERIC(12,2) NOT NULL,
    fecha_ultimo_pago               TIMESTAMPTZ,

    -- REFINANCIADA (del requerimiento) se deja fuera hasta que exista esa
    -- funcionalidad — evita un estado alcanzable por ningún flujo real.
    estado                           TEXT NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado IN ('PENDIENTE','PARCIAL','PAGADA','VENCIDA','ANULADA')),

    created_at                       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at                       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

    UNIQUE (credito_id, numero_cuota)
);

CREATE INDEX IF NOT EXISTS idx_credito_electro_cuotas_credito ON facturacion.creditos_electrodomesticos_cuotas(credito_id);
CREATE INDEX IF NOT EXISTS idx_credito_electro_cuotas_venc    ON facturacion.creditos_electrodomesticos_cuotas(empresa_id, fecha_vencimiento) WHERE estado IN ('PENDIENTE','PARCIAL');

GRANT ALL ON facturacion.creditos_electrodomesticos_cuotas TO authenticated, service_role;
ALTER TABLE facturacion.creditos_electrodomesticos_cuotas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "credito_electro_cuotas_empresa" ON facturacion.creditos_electrodomesticos_cuotas;
CREATE POLICY "credito_electro_cuotas_empresa" ON facturacion.creditos_electrodomesticos_cuotas
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

-- ────────────────────────────────────────────────────────────
-- 3. Pagos de cuota — mismo shape que cartera_cxc_pagos (columnas de
--    reversa incluidas desde ya, no como parche posterior)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.creditos_electrodomesticos_pagos (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id            UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    credito_id            UUID NOT NULL REFERENCES facturacion.creditos_electrodomesticos(id) ON DELETE CASCADE,
    cuota_id              UUID NOT NULL REFERENCES facturacion.creditos_electrodomesticos_cuotas(id) ON DELETE CASCADE,
    fecha_pago            DATE NOT NULL DEFAULT CURRENT_DATE,
    valor                 NUMERIC(12,2) NOT NULL CHECK (valor > 0),
    metodo_pago           TEXT NOT NULL CHECK (metodo_pago IN ('efectivo','transferencia','cheque','tarjeta','nota_credito','otros')),
    referencia            TEXT,
    nota_credito_id       UUID,
    usuario_id            UUID REFERENCES auth.users,
    -- Reversa / trazabilidad — mismas columnas que cartera_cxc_pagos.
    estado                TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','reversado')),
    reversado_at          TIMESTAMPTZ,
    reversado_por         UUID REFERENCES auth.users,
    motivo_reversa        TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_credito_electro_pagos_cuota   ON facturacion.creditos_electrodomesticos_pagos(cuota_id);
CREATE INDEX IF NOT EXISTS idx_credito_electro_pagos_credito ON facturacion.creditos_electrodomesticos_pagos(credito_id);

GRANT ALL ON facturacion.creditos_electrodomesticos_pagos TO authenticated, service_role;
ALTER TABLE facturacion.creditos_electrodomesticos_pagos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "credito_electro_pagos_empresa" ON facturacion.creditos_electrodomesticos_pagos;
CREATE POLICY "credito_electro_pagos_empresa" ON facturacion.creditos_electrodomesticos_pagos
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

-- ────────────────────────────────────────────────────────────
-- 4. Trigger nivel 1: pagos → cuota (clon exacto de fn_actualizar_saldo_cxc)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION facturacion.fn_actualizar_saldo_cuota_credito_electro()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = facturacion AS $$
DECLARE
    v_cuota_id      UUID := COALESCE(NEW.cuota_id, OLD.cuota_id);
    v_estado_actual TEXT;
    v_cuota_valor   NUMERIC(12,2);
    v_total_pagado  NUMERIC(12,2);
    v_saldo         NUMERIC(12,2);
BEGIN
    SELECT c.estado, c.cuota_programada
    INTO v_estado_actual, v_cuota_valor
    FROM facturacion.creditos_electrodomesticos_cuotas c
    WHERE c.id = v_cuota_id;

    SELECT COALESCE(SUM(p.valor) FILTER (WHERE p.estado = 'activo'), 0)
    INTO v_total_pagado
    FROM facturacion.creditos_electrodomesticos_pagos p
    WHERE p.cuota_id = v_cuota_id;

    v_saldo := GREATEST(v_cuota_valor - v_total_pagado, 0);

    UPDATE facturacion.creditos_electrodomesticos_cuotas
    SET total_pagado    = v_total_pagado,
        saldo_pendiente = v_saldo,
        fecha_ultimo_pago = CASE WHEN v_total_pagado > 0 THEN timezone('utc', now()) ELSE fecha_ultimo_pago END,
        estado = CASE
            WHEN v_estado_actual = 'ANULADA' THEN 'ANULADA'
            WHEN v_saldo <= 0 THEN 'PAGADA'
            WHEN v_total_pagado > 0 THEN 'PARCIAL'
            WHEN v_estado_actual = 'VENCIDA' THEN 'VENCIDA'
            ELSE 'PENDIENTE'
        END,
        updated_at = timezone('utc', now())
    WHERE id = v_cuota_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_actualizar_saldo_cuota_credito_electro ON facturacion.creditos_electrodomesticos_pagos;
CREATE TRIGGER trg_actualizar_saldo_cuota_credito_electro
    AFTER INSERT OR DELETE OR UPDATE OF estado ON facturacion.creditos_electrodomesticos_pagos
    FOR EACH ROW EXECUTE FUNCTION facturacion.fn_actualizar_saldo_cuota_credito_electro();

-- ────────────────────────────────────────────────────────────
-- 5. Trigger nivel 2: cuota → crédito (rollup de todas sus cuotas)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION facturacion.fn_actualizar_credito_electro_desde_cuotas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = facturacion AS $$
DECLARE
    v_credito_id     UUID := COALESCE(NEW.credito_id, OLD.credito_id);
    v_estado_actual  TEXT;
    v_total_pagado   NUMERIC(12,2);
    v_saldo          NUMERIC(12,2);
BEGIN
    SELECT estado INTO v_estado_actual
    FROM facturacion.creditos_electrodomesticos
    WHERE id = v_credito_id;

    SELECT COALESCE(SUM(total_pagado), 0), COALESCE(SUM(saldo_pendiente), 0)
    INTO v_total_pagado, v_saldo
    FROM facturacion.creditos_electrodomesticos_cuotas
    WHERE credito_id = v_credito_id
      AND estado <> 'ANULADA';

    UPDATE facturacion.creditos_electrodomesticos
    SET total_pagado    = v_total_pagado,
        saldo_pendiente = v_saldo,
        -- Solo decide LIQUIDADO aquí. EN_MORA lo pone el job de mora
        -- (Fase 5, todavía sin diseñar) y ANULADO lo pone la anulación
        -- (Fase 6) — este trigger nunca los pisa.
        estado = CASE
            WHEN v_estado_actual IN ('ANULADO') THEN v_estado_actual
            WHEN v_saldo <= 0 THEN 'LIQUIDADO'
            WHEN v_estado_actual = 'LIQUIDADO' THEN 'VIGENTE' -- se reabrió por reverso de pago
            ELSE v_estado_actual
        END,
        updated_at = timezone('utc', now())
    WHERE id = v_credito_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_actualizar_credito_electro_desde_cuotas ON facturacion.creditos_electrodomesticos_cuotas;
CREATE TRIGGER trg_actualizar_credito_electro_desde_cuotas
    AFTER UPDATE OF saldo_pendiente, total_pagado, estado ON facturacion.creditos_electrodomesticos_cuotas
    FOR EACH ROW EXECUTE FUNCTION facturacion.fn_actualizar_credito_electro_desde_cuotas();

-- ────────────────────────────────────────────────────────────
-- 6. RPC atómica: crear cabecera + cuotas en una sola transacción
--    (evita el escenario "factura autorizada pero cronograma no creado"
--    del requerimiento — cabecera y cuotas nacen juntas o no nace ninguna).
--    p_cuotas: array de objetos con las mismas claves que devuelve
--    calcularCreditoElectrodomesticos() en Fase 1 (camelCase → snake_case
--    lo hace el servicio TS antes de llamar esta función).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION facturacion.fn_crear_credito_electrodomestico(
    p_credito JSONB,
    p_cuotas  JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = facturacion AS $$
DECLARE
    v_credito_id UUID;
    v_cuota      JSONB;
BEGIN
    INSERT INTO facturacion.creditos_electrodomesticos (
        empresa_id, factura_id, cliente_id, garante_cliente_id, cobrador_id,
        fecha_venta, fecha_primer_vencimiento, fecha_ultimo_vencimiento,
        total_factura, valor_entrada, saldo_a_diferir, base_calculo_interes,
        tipo_tasa, tasa_valor, periodicidad, numero_cuotas,
        valor_cuota_referencial, total_intereses, total_financiado,
        saldo_pendiente, observaciones, created_by
    ) VALUES (
        (p_credito->>'empresa_id')::UUID,
        (p_credito->>'factura_id')::UUID,
        (p_credito->>'cliente_id')::UUID,
        NULLIF(p_credito->>'garante_cliente_id', '')::UUID,
        (p_credito->>'cobrador_id')::UUID,
        (p_credito->>'fecha_venta')::DATE,
        (p_credito->>'fecha_primer_vencimiento')::DATE,
        (p_credito->>'fecha_ultimo_vencimiento')::DATE,
        (p_credito->>'total_factura')::NUMERIC,
        (p_credito->>'valor_entrada')::NUMERIC,
        (p_credito->>'saldo_a_diferir')::NUMERIC,
        p_credito->>'base_calculo_interes',
        p_credito->>'tipo_tasa',
        (p_credito->>'tasa_valor')::NUMERIC,
        p_credito->>'periodicidad',
        (p_credito->>'numero_cuotas')::INTEGER,
        (p_credito->>'valor_cuota_referencial')::NUMERIC,
        (p_credito->>'total_intereses')::NUMERIC,
        (p_credito->>'total_financiado')::NUMERIC,
        (p_credito->>'saldo_a_diferir')::NUMERIC, -- saldo_pendiente inicial = saldo_a_diferir + intereses = total_financiado, pero el trigger lo recalcula al insertar cuotas
        NULLIF(p_credito->>'observaciones', ''),
        NULLIF(p_credito->>'created_by', '')::UUID
    )
    RETURNING id INTO v_credito_id;

    FOR v_cuota IN SELECT jsonb_array_elements(p_cuotas)
    LOOP
        INSERT INTO facturacion.creditos_electrodomesticos_cuotas (
            empresa_id, credito_id, numero_cuota, fecha_vencimiento,
            saldo_inicial, capital_programado, interes_programado,
            cuota_programada, saldo_final_programado, saldo_pendiente
        ) VALUES (
            (p_credito->>'empresa_id')::UUID,
            v_credito_id,
            (v_cuota->>'numero_cuota')::INTEGER,
            (v_cuota->>'fecha_vencimiento')::DATE,
            (v_cuota->>'saldo_inicial')::NUMERIC,
            (v_cuota->>'capital_programado')::NUMERIC,
            (v_cuota->>'interes_programado')::NUMERIC,
            (v_cuota->>'cuota_programada')::NUMERIC,
            (v_cuota->>'saldo_final_programado')::NUMERIC,
            (v_cuota->>'cuota_programada')::NUMERIC -- saldo_pendiente = cuota completa, todavía sin pagos
        );
    END LOOP;

    -- saldo_pendiente real de la cabecera = suma de las cuotas recién
    -- creadas (total_financiado), no solo el capital.
    UPDATE facturacion.creditos_electrodomesticos
    SET saldo_pendiente = (p_credito->>'total_financiado')::NUMERIC
    WHERE id = v_credito_id;

    RETURN v_credito_id;
END;
$$;

GRANT EXECUTE ON FUNCTION facturacion.fn_crear_credito_electrodomestico(JSONB, JSONB) TO authenticated;

-- ── Verificación sugerida después de correr esta migración ──
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'facturacion' AND table_name LIKE 'creditos_electrodomesticos%';
