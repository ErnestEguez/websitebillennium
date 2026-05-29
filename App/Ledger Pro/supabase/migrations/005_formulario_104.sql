-- ============================================================
-- LEDGER PRO — Formulario 104 IVA
-- Schema: conta  |  Prefijo: lp_iva_104_
-- Todas las tablas son NUEVAS — no modifica nada existente
-- ============================================================

-- ── 1. CABECERA DE DECLARACIÓN ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conta.lp_iva_104 (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID        NOT NULL REFERENCES conta.lp_empresas(id),
    año                 INT         NOT NULL,
    mes                 INT         NOT NULL CHECK (mes BETWEEN 1 AND 12),
    version_form        TEXT        NOT NULL DEFAULT 'v2024',
    estado              TEXT        NOT NULL DEFAULT 'borrador'
                                    CHECK (estado IN ('borrador','revisado','enviado','sustitutiva','anulado')),
    fecha_generacion    TIMESTAMPTZ,
    fecha_envio         TIMESTAMPTZ,
    numero_formulario   TEXT,
    es_sustitutiva      BOOLEAN     NOT NULL DEFAULT false,
    formulario_orig_id  UUID        REFERENCES conta.lp_iva_104(id),
    created_by          UUID        REFERENCES auth.users(id),
    updated_by          UUID        REFERENCES auth.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- UNIQUE parcial: una declaración original por empresa/período
CREATE UNIQUE INDEX IF NOT EXISTS uq_iva104_original
    ON conta.lp_iva_104 (empresa_id, año, mes)
    WHERE es_sustitutiva = false;

-- UNIQUE parcial: una sustitutiva por declaración original
CREATE UNIQUE INDEX IF NOT EXISTS uq_iva104_sustitutiva
    ON conta.lp_iva_104 (empresa_id, año, mes, formulario_orig_id)
    WHERE es_sustitutiva = true;

-- ── 2. DETALLE DE CASILLEROS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conta.lp_iva_104_detalle (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    declaracion_id      UUID        NOT NULL REFERENCES conta.lp_iva_104(id) ON DELETE CASCADE,
    empresa_id          UUID        NOT NULL REFERENCES conta.lp_empresas(id),
    casillero           TEXT        NOT NULL,
    valor_calculado     NUMERIC(18,2) NOT NULL DEFAULT 0,
    ajuste_manual       NUMERIC(18,2) NOT NULL DEFAULT 0,
    -- valor_final es columna generada: calculado + ajuste; NUNCA se sobreescribe al recalcular
    valor_final         NUMERIC(18,2) GENERATED ALWAYS AS (valor_calculado + ajuste_manual) STORED,
    nota_ajuste         TEXT,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (declaracion_id, casillero)
);

-- ── 3. MAPA CASILLERO ↔ ETIQUETA XML ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS conta.lp_iva_104_mapeo_xml (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    version_form    TEXT    NOT NULL DEFAULT 'v2024',
    casillero       TEXT    NOT NULL,
    descripcion     TEXT    NOT NULL,
    etiqueta_xml    TEXT    NOT NULL,
    seccion         TEXT    NOT NULL
                            CHECK (seccion IN ('ventas','compras','retenciones','liquidacion','saldo')),
    tipo_dato       TEXT    NOT NULL DEFAULT 'decimal'
                            CHECK (tipo_dato IN ('decimal','entero','texto','fecha')),
    obligatorio     BOOLEAN NOT NULL DEFAULT false,
    orden           INT     NOT NULL DEFAULT 0,
    activo          BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (version_form, casillero)
);

-- ── 4. LOG DE AUDITORÍA ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conta.lp_iva_104_log (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    declaracion_id  UUID        NOT NULL REFERENCES conta.lp_iva_104(id),
    empresa_id      UUID        NOT NULL REFERENCES conta.lp_empresas(id),
    user_id         UUID        REFERENCES auth.users(id),
    accion          TEXT        NOT NULL
                                CHECK (accion IN ('calcular','ajustar','generar_xml','marcar_enviado','anular')),
    resultado       TEXT        NOT NULL CHECK (resultado IN ('ok','error')),
    mensaje         TEXT,
    archivo_nombre  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 5. VISTA DE COMPRAS CONSOLIDADA (solo lectura sobre tabla existente) ───
CREATE OR REPLACE VIEW conta.lp_vw_iva_compras_104 AS
SELECT
    empresa_id,
    año,
    mes,
    SUM(CASE WHEN tipo IN ('factura','nota_credito','nota_debito')
             THEN base_iva  ELSE 0 END)                             AS base_gravada,
    SUM(CASE WHEN tipo IN ('factura','nota_credito','nota_debito')
             THEN base_cero ELSE 0 END)                             AS base_cero,
    SUM(CASE WHEN tipo IN ('factura','nota_credito','nota_debito')
             THEN iva       ELSE 0 END)                             AS iva_pagado,
    SUM(CASE WHEN tipo = 'retencion'
             THEN COALESCE(valor_retenido, 0) ELSE 0 END)           AS ret_recibidas,
    SUM(CASE WHEN tipo IN ('factura','nota_credito','nota_debito')
              AND codigo_retencion IS NOT NULL
             THEN COALESCE(valor_retenido, 0) ELSE 0 END)           AS ret_efectuadas
FROM  conta.lp_sri_comprobantes
GROUP BY empresa_id, año, mes;

-- ── 6. ÍNDICES ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_iva104_empresa_periodo
    ON conta.lp_iva_104(empresa_id, año, mes);

CREATE INDEX IF NOT EXISTS idx_iva104_estado
    ON conta.lp_iva_104(empresa_id, estado);

CREATE INDEX IF NOT EXISTS idx_iva104_det_decl
    ON conta.lp_iva_104_detalle(declaracion_id);

CREATE INDEX IF NOT EXISTS idx_iva104_det_empresa
    ON conta.lp_iva_104_detalle(empresa_id);

CREATE INDEX IF NOT EXISTS idx_iva104_mapeo_ver
    ON conta.lp_iva_104_mapeo_xml(version_form, seccion, orden);

CREATE INDEX IF NOT EXISTS idx_iva104_log_decl
    ON conta.lp_iva_104_log(declaracion_id);

CREATE INDEX IF NOT EXISTS idx_iva104_log_empresa
    ON conta.lp_iva_104_log(empresa_id, created_at DESC);

-- ── 7. ROW LEVEL SECURITY ──────────────────────────────────────────────────
ALTER TABLE conta.lp_iva_104           ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta.lp_iva_104_detalle   ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta.lp_iva_104_mapeo_xml ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta.lp_iva_104_log       ENABLE ROW LEVEL SECURITY;

-- lp_iva_104: solo la empresa dueña
CREATE POLICY iva104_all ON conta.lp_iva_104
    FOR ALL USING (empresa_id IN (SELECT conta.lp_user_empresas()));

-- lp_iva_104_detalle: solo la empresa dueña
CREATE POLICY iva104_det_all ON conta.lp_iva_104_detalle
    FOR ALL USING (empresa_id IN (SELECT conta.lp_user_empresas()));

-- lp_iva_104_mapeo_xml: lectura pública (es un catálogo global)
CREATE POLICY iva104_mapeo_read ON conta.lp_iva_104_mapeo_xml
    FOR SELECT USING (true);

-- lp_iva_104_log: solo la empresa dueña
CREATE POLICY iva104_log_all ON conta.lp_iva_104_log
    FOR ALL USING (empresa_id IN (SELECT conta.lp_user_empresas()));

-- ── 8. PERMISOS ────────────────────────────────────────────────────────────
GRANT ALL    ON conta.lp_iva_104           TO authenticated;
GRANT ALL    ON conta.lp_iva_104_detalle   TO authenticated;
GRANT SELECT ON conta.lp_iva_104_mapeo_xml TO authenticated;
GRANT ALL    ON conta.lp_iva_104_log       TO authenticated;
GRANT SELECT ON conta.lp_vw_iva_compras_104 TO authenticated;

-- ── 9. FUNCIÓN RPC: CALCULAR CASILLEROS 104 ───────────────────────────────
-- Llamada desde el frontend: supabase.rpc('lp_calcular_104', {...})
-- Devuelve JSONB con { "401": 5000.00, "411": 600.00, ... }
-- No modifica ninguna tabla — solo calcula y devuelve valores
CREATE OR REPLACE FUNCTION conta.lp_calcular_104(
    p_empresa_id  UUID,
    p_año         INT,
    p_mes         INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_fecha_desde   DATE    := make_date(p_año, p_mes, 1);
    v_fecha_hasta   DATE    := (make_date(p_año, p_mes, 1) + INTERVAL '1 month - 1 day')::DATE;

    -- Ventas (QuickInvoice)
    v_base_gravada_ventas   NUMERIC := 0;
    v_base_cero_ventas      NUMERIC := 0;
    v_iva_cobrado           NUMERIC := 0;

    -- Compras (lp_sri_comprobantes)
    v_base_gravada_compras  NUMERIC := 0;
    v_base_cero_compras     NUMERIC := 0;
    v_iva_pagado            NUMERIC := 0;

    -- Retenciones
    v_ret_sufridas          NUMERIC := 0;  -- clientes retuvieron IVA en tus ventas
    v_ret_efectuadas        NUMERIC := 0;  -- tú retuviste IVA en compras (AIR)

    -- Saldo período anterior
    v_saldo_anterior        NUMERIC := 0;

    -- Calculados
    v_credito_tributario    NUMERIC := 0;
    v_iva_pagar             NUMERIC := 0;
    v_credito_sig_periodo   NUMERIC := 0;
BEGIN
    -- Verificar que el usuario tiene acceso a esta empresa
    IF NOT EXISTS (
        SELECT 1 FROM conta.lp_usuarios_empresa
        WHERE  user_id    = auth.uid()
          AND  empresa_id = p_empresa_id
          AND  activo     = true
    ) THEN
        RAISE EXCEPTION 'Acceso denegado para empresa_id=%', p_empresa_id;
    END IF;

    -- ── VENTAS desde QuickInvoice ────────────────────────────────────────
    -- lp_get_facturas_qi ya verifica acceso y cruza por RUC
    BEGIN
        SELECT
            COALESCE(SUM(f.base_iva),   0),
            COALESCE(SUM(f.base_cero),  0),
            COALESCE(SUM(f.total_iva),  0)
        INTO v_base_gravada_ventas, v_base_cero_ventas, v_iva_cobrado
        FROM conta.lp_get_facturas_qi(p_empresa_id, v_fecha_desde, v_fecha_hasta) f;
    EXCEPTION WHEN OTHERS THEN
        -- Si QI no está integrado aún, ventas quedan en 0 (no bloquea el cálculo)
        v_base_gravada_ventas := 0;
        v_base_cero_ventas    := 0;
        v_iva_cobrado         := 0;
    END;

    -- ── RETENCIONES SUFRIDAS (clientes te retuvieron IVA) ───────────────
    -- tipo='retencion' en lp_sri_comprobantes = comprobantes de retención recibidos
    SELECT COALESCE(SUM(valor_retenido), 0)
    INTO   v_ret_sufridas
    FROM   conta.lp_sri_comprobantes
    WHERE  empresa_id = p_empresa_id
      AND  año        = p_año
      AND  mes        = p_mes
      AND  tipo       = 'retencion';

    -- ── COMPRAS desde SRI ────────────────────────────────────────────────
    SELECT
        COALESCE(SUM(base_iva),  0),
        COALESCE(SUM(base_cero), 0),
        COALESCE(SUM(iva),       0)
    INTO v_base_gravada_compras, v_base_cero_compras, v_iva_pagado
    FROM  conta.lp_sri_comprobantes
    WHERE empresa_id = p_empresa_id
      AND año        = p_año
      AND mes        = p_mes
      AND tipo       IN ('factura', 'nota_credito', 'nota_debito');

    -- ── RETENCIONES EFECTUADAS (tú retuviste IVA a proveedores — bloque AIR) ─
    SELECT COALESCE(SUM(COALESCE(valor_retenido, 0)), 0)
    INTO   v_ret_efectuadas
    FROM   conta.lp_sri_comprobantes
    WHERE  empresa_id        = p_empresa_id
      AND  año               = p_año
      AND  mes               = p_mes
      AND  tipo              IN ('factura', 'nota_credito', 'nota_debito')
      AND  codigo_retencion  IS NOT NULL;

    -- ── SALDO PERÍODO ANTERIOR (casillero 700 de la última declaración) ──
    SELECT COALESCE(d.valor_final, 0)
    INTO   v_saldo_anterior
    FROM   conta.lp_iva_104 h
    JOIN   conta.lp_iva_104_detalle d
           ON d.declaracion_id = h.id AND d.casillero = '700'
    WHERE  h.empresa_id = p_empresa_id
      AND  h.estado    != 'anulado'
      AND  (h.año * 100 + h.mes) = (
               SELECT MAX(h2.año * 100 + h2.mes)
               FROM   conta.lp_iva_104 h2
               WHERE  h2.empresa_id = p_empresa_id
                 AND  h2.estado    != 'anulado'
                 AND  (h2.año * 100 + h2.mes) < (p_año * 100 + p_mes)
           )
    LIMIT 1;

    -- ── LIQUIDACIÓN ──────────────────────────────────────────────────────
    -- Crédito tributario = IVA pagado en compras + saldo anterior
    v_credito_tributario  := v_iva_pagado + v_saldo_anterior;

    -- IVA a pagar = IVA cobrado − crédito tributario − retenciones sufridas
    -- Si el resultado es negativo, queda como crédito para el siguiente período
    v_iva_pagar           := GREATEST(0, v_iva_cobrado - v_credito_tributario - v_ret_sufridas);
    v_credito_sig_periodo := GREATEST(0, v_credito_tributario + v_ret_sufridas - v_iva_cobrado);

    -- ── RETORNO ───────────────────────────────────────────────────────────
    RETURN jsonb_build_object(
        -- Ventas
        '401', ROUND(v_base_gravada_ventas,  2),   -- ventas gravadas dif. 0%
        '403', ROUND(v_base_cero_ventas,     2),   -- ventas tarifa 0%
        '411', ROUND(v_iva_cobrado,          2),   -- IVA cobrado en ventas
        -- Compras / crédito
        '500', ROUND(v_base_gravada_compras, 2),   -- compras bienes/serv gravados
        '504', ROUND(v_base_cero_compras,    2),   -- compras tarifa 0%
        '510', ROUND(v_iva_pagado,           2),   -- IVA pagado en compras
        '554', ROUND(v_credito_tributario,   2),   -- crédito tributario aplicable
        -- Retenciones
        '601', ROUND(v_ret_sufridas,         2),   -- ret. IVA que clientes te hicieron
        '605', ROUND(v_ret_efectuadas,       2),   -- ret. IVA que tú efectuaste (AIR)
        -- Liquidación
        '699', ROUND(v_iva_pagar,            2),   -- IVA a pagar
        '700', ROUND(v_credito_sig_periodo,  2),   -- crédito para siguiente período
        -- Saldo
        '799', ROUND(v_saldo_anterior,       2),   -- saldo favorable período anterior
        '902', ROUND(v_iva_pagar,            2)    -- total impuesto a pagar
    );
END;
$$;

GRANT EXECUTE ON FUNCTION conta.lp_calcular_104(UUID, INT, INT) TO authenticated;

-- ── 10. SEED: CASILLEROS v2024 ─────────────────────────────────────────────
INSERT INTO conta.lp_iva_104_mapeo_xml
    (version_form, casillero, descripcion, etiqueta_xml, seccion, tipo_dato, obligatorio, orden)
VALUES
-- VENTAS ──────────────────────────────────────────────────────────────────
('v2024','401','Ventas netas gravadas tarifa diferente 0% (excl. act. financieras)',
    'ventas_grav_dif_cero',    'ventas', 'decimal', true,  10),
('v2024','403','Ventas netas gravadas tarifa 0%',
    'ventas_grav_cero',        'ventas', 'decimal', false, 20),
('v2024','405','Ventas netas no objeto de IVA',
    'ventas_no_objeto',        'ventas', 'decimal', false, 30),
('v2024','407','Exportaciones netas de bienes',
    'exportaciones_bienes',    'ventas', 'decimal', false, 40),
('v2024','409','Exportaciones netas de servicios',
    'exportaciones_servicios', 'ventas', 'decimal', false, 50),
('v2024','411','IVA cobrado (casillero liquidación ventas)',
    'iva_cobrado',             'ventas', 'decimal', true,  60),

-- COMPRAS / CRÉDITO TRIBUTARIO ────────────────────────────────────────────
('v2024','500','Adquisiciones y pagos netos gravados tarifa dif. 0% (bienes)',
    'compras_bienes_grav',     'compras', 'decimal', false, 100),
('v2024','502','Adquisiciones y pagos netos gravados tarifa dif. 0% (servicios)',
    'compras_serv_grav',       'compras', 'decimal', false, 110),
('v2024','504','Adquisiciones y pagos netos tarifa 0% (bienes)',
    'compras_bienes_cero',     'compras', 'decimal', false, 120),
('v2024','506','Adquisiciones y pagos netos tarifa 0% (servicios)',
    'compras_serv_cero',       'compras', 'decimal', false, 130),
('v2024','510','IVA pagado en compras (crédito tributario del período)',
    'iva_compras',             'compras', 'decimal', false, 140),
('v2024','554','Crédito tributario aplicable en este período',
    'credito_tributario',      'compras', 'decimal', false, 150),

-- RETENCIONES ─────────────────────────────────────────────────────────────
('v2024','601','Retenciones de IVA que le efectuaron (en ventas — sufridas)',
    'ret_iva_ventas',          'retenciones', 'decimal', false, 200),
('v2024','605','Retenciones de IVA que usted efectuó (en compras — AIR)',
    'ret_iva_compras_air',     'retenciones', 'decimal', false, 210),

-- LIQUIDACIÓN ─────────────────────────────────────────────────────────────
('v2024','699','IVA causado (cobrado − crédito tributario − retenciones sufridas)',
    'iva_causado',             'liquidacion', 'decimal', true,  300),
('v2024','700','Crédito tributario para el período siguiente',
    'credito_sig_periodo',     'liquidacion', 'decimal', false, 310),

-- SALDO / TOTAL ───────────────────────────────────────────────────────────
('v2024','799','Saldo a favor del contribuyente del período anterior',
    'saldo_anterior',          'saldo', 'decimal', false, 400),
('v2024','859','Multas e intereses por mora',
    'multas_intereses',        'saldo', 'decimal', false, 410),
('v2024','902','Total impuesto a pagar',
    'total_impuesto_pagar',    'saldo', 'decimal', true,  420)

ON CONFLICT (version_form, casillero) DO NOTHING;

-- ── 11. SEED: CASILLEROS v2025 (copia de v2024, lista para ajustar) ────────
INSERT INTO conta.lp_iva_104_mapeo_xml
    (version_form, casillero, descripcion, etiqueta_xml, seccion, tipo_dato, obligatorio, orden)
SELECT
    'v2025', casillero, descripcion, etiqueta_xml, seccion, tipo_dato, obligatorio, orden
FROM  conta.lp_iva_104_mapeo_xml
WHERE version_form = 'v2024'
ON CONFLICT (version_form, casillero) DO NOTHING;
