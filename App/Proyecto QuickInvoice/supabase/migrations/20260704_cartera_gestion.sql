-- ============================================================
-- Módulo: Gestión de Cartera y Cobros
-- 2026-07-04
-- ============================================================
SET search_path TO facturacion, public;

-- ─── 1. Historial de gestiones por cartera_cxc ───────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.cartera_gestiones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    cartera_id      UUID NOT NULL REFERENCES facturacion.cartera_cxc(id) ON DELETE CASCADE,
    usuario_id      UUID REFERENCES auth.users(id),
    usuario_nombre  TEXT,
    fecha_gestion   DATE NOT NULL DEFAULT CURRENT_DATE,
    canal           TEXT NOT NULL DEFAULT 'otro'
        CHECK (canal IN ('llamada','email','whatsapp','visita','carta','otro')),
    observacion     TEXT,
    estado_gestion  TEXT NOT NULL DEFAULT 'sin_gestionar'
        CHECK (estado_gestion IN ('sin_gestionar','en_negociacion','promesa_pago','acuerdo_pago','incobrable','pagada')),
    proxima_gestion DATE,
    promesa_fecha   DATE,
    promesa_monto   NUMERIC(12,2),
    promesa_cumplida BOOLEAN,
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cg_cartera  ON facturacion.cartera_gestiones(cartera_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cg_empresa  ON facturacion.cartera_gestiones(empresa_id, fecha_gestion);
CREATE INDEX IF NOT EXISTS idx_cg_proxima  ON facturacion.cartera_gestiones(empresa_id, proxima_gestion)
    WHERE proxima_gestion IS NOT NULL;

-- ─── 2. Acuerdos de pago en cuotas ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.cartera_acuerdos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    cartera_id      UUID NOT NULL REFERENCES facturacion.cartera_cxc(id) ON DELETE CASCADE,
    cliente_id      UUID NOT NULL,
    total_acuerdo   NUMERIC(12,2) NOT NULL,
    n_cuotas        INTEGER NOT NULL,
    estado          TEXT NOT NULL DEFAULT 'activo'
        CHECK (estado IN ('activo','cumplido','incumplido')),
    fecha_inicio    DATE NOT NULL DEFAULT CURRENT_DATE,
    observaciones   TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facturacion.cartera_acuerdo_cuotas (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    acuerdo_id         UUID NOT NULL REFERENCES facturacion.cartera_acuerdos(id) ON DELETE CASCADE,
    empresa_id         UUID NOT NULL,
    numero_cuota       INTEGER NOT NULL,
    fecha_vencimiento  DATE NOT NULL,
    monto              NUMERIC(12,2) NOT NULL,
    fecha_pago         DATE,
    estado             TEXT NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente','pagada','vencida'))
);
CREATE INDEX IF NOT EXISTS idx_cac_acuerdo ON facturacion.cartera_acuerdo_cuotas(acuerdo_id);
CREATE INDEX IF NOT EXISTS idx_cac_vence   ON facturacion.cartera_acuerdo_cuotas(empresa_id, fecha_vencimiento)
    WHERE estado = 'pendiente';

-- ─── 3. Score de crédito por cliente ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.cartera_score_clientes (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id              UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    cliente_id              UUID NOT NULL,
    score                   INTEGER NOT NULL DEFAULT 100 CHECK (score BETWEEN 0 AND 100),
    avg_dias_retraso        NUMERIC(6,1) DEFAULT 0,
    pct_promesas_cumplidas  NUMERIC(5,1) DEFAULT 100,
    frecuencia_mora         INTEGER DEFAULT 0,
    clasificacion           TEXT NOT NULL DEFAULT 'buen_pagador'
        CHECK (clasificacion IN ('buen_pagador','irregular','alto_riesgo','incobrable')),
    updated_at              TIMESTAMPTZ DEFAULT now(),
    UNIQUE(empresa_id, cliente_id)
);

-- ─── 4. Configuración por empresa ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.cartera_config (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id                  UUID NOT NULL UNIQUE REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    dias_alerta_mora            INTEGER NOT NULL DEFAULT 30,
    dias_bloqueo_credito        INTEGER NOT NULL DEFAULT 90,
    plantilla_wa_1              TEXT DEFAULT 'Estimado/a {{nombre}}, le recordamos que la Factura {{factura}} por {{monto}} venció el {{vencimiento}}. Por favor contáctenos para regularizar su cuenta.',
    plantilla_wa_2              TEXT DEFAULT 'Estimado/a {{nombre}}, esta es la segunda notificación sobre la Factura {{factura}} por {{monto}} vencida hace {{dias}} días. Su cuenta puede ser bloqueada.',
    plantilla_wa_judicial       TEXT DEFAULT 'Estimado/a {{nombre}}, la Factura {{factura}} por {{monto}} está en gestión prejudicial. Solicite regularización urgente al {{telefono_empresa}}.',
    plantilla_carta_firma       TEXT DEFAULT 'Gerente de Cobros',
    created_at                  TIMESTAMPTZ DEFAULT now(),
    updated_at                  TIMESTAMPTZ DEFAULT now()
);

-- ─── 5. Centro de notificaciones ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.cartera_notificaciones (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id  UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES auth.users(id),
    tipo        TEXT NOT NULL
        CHECK (tipo IN ('promesa_vencida','nueva_mora','gestion_pendiente','cuota_vencida')),
    titulo      TEXT NOT NULL,
    mensaje     TEXT NOT NULL,
    cartera_id  UUID REFERENCES facturacion.cartera_cxc(id),
    leida       BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cn_user    ON facturacion.cartera_notificaciones(user_id, leida, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cn_empresa ON facturacion.cartera_notificaciones(empresa_id, created_at DESC);

-- ─── 6. Campos adicionales en cartera_cxc (estado de gestión desnormalizado) ─
ALTER TABLE facturacion.cartera_cxc
    ADD COLUMN IF NOT EXISTS estado_gestion  TEXT DEFAULT 'sin_gestionar',
    ADD COLUMN IF NOT EXISTS proxima_gestion DATE,
    ADD COLUMN IF NOT EXISTS ultimo_contacto DATE;

-- ─── 7. Límite de crédito y bloqueo en clientes ──────────────────────────────
ALTER TABLE facturacion.clientes
    ADD COLUMN IF NOT EXISTS limite_credito   NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS bloqueo_credito  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS score_credito    INTEGER;

-- ─── RLS en todas las tablas ─────────────────────────────────────────────────
ALTER TABLE facturacion.cartera_gestiones       ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.cartera_acuerdos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.cartera_acuerdo_cuotas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.cartera_score_clientes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.cartera_config          ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.cartera_notificaciones  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "p_cg"  ON facturacion.cartera_gestiones;
DROP POLICY IF EXISTS "p_ca"  ON facturacion.cartera_acuerdos;
DROP POLICY IF EXISTS "p_cac" ON facturacion.cartera_acuerdo_cuotas;
DROP POLICY IF EXISTS "p_csc" ON facturacion.cartera_score_clientes;
DROP POLICY IF EXISTS "p_cc"  ON facturacion.cartera_config;
DROP POLICY IF EXISTS "p_cn"  ON facturacion.cartera_notificaciones;

CREATE POLICY "p_cg"  ON facturacion.cartera_gestiones
    FOR ALL USING (empresa_id IN (SELECT facturacion.mis_empresas_ids()));
CREATE POLICY "p_ca"  ON facturacion.cartera_acuerdos
    FOR ALL USING (empresa_id IN (SELECT facturacion.mis_empresas_ids()));
CREATE POLICY "p_cac" ON facturacion.cartera_acuerdo_cuotas
    FOR ALL USING (empresa_id IN (SELECT facturacion.mis_empresas_ids()));
CREATE POLICY "p_csc" ON facturacion.cartera_score_clientes
    FOR ALL USING (empresa_id IN (SELECT facturacion.mis_empresas_ids()));
CREATE POLICY "p_cc"  ON facturacion.cartera_config
    FOR ALL USING (empresa_id IN (SELECT facturacion.mis_empresas_ids()));
CREATE POLICY "p_cn"  ON facturacion.cartera_notificaciones
    FOR ALL USING (empresa_id IN (SELECT facturacion.mis_empresas_ids()));

GRANT ALL ON facturacion.cartera_gestiones      TO authenticated, service_role;
GRANT ALL ON facturacion.cartera_acuerdos       TO authenticated, service_role;
GRANT ALL ON facturacion.cartera_acuerdo_cuotas TO authenticated, service_role;
GRANT ALL ON facturacion.cartera_score_clientes TO authenticated, service_role;
GRANT ALL ON facturacion.cartera_config         TO authenticated, service_role;
GRANT ALL ON facturacion.cartera_notificaciones TO authenticated, service_role;
