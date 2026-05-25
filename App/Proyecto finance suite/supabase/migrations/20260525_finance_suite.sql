-- ============================================================
-- FINANCE SUITE — Migración completa
-- Schema: finance (ya creado en el proyecto Supabase del portal)
-- Ejecutar en el SQL Editor de Supabase
-- Seguro para re-ejecutar (IF NOT EXISTS / OR REPLACE)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. CATÁLOGO DE BANCOS DEL ECUADOR (maestro global, sin empresa_id)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.bancos (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo      TEXT UNIQUE NOT NULL,
    nombre      TEXT NOT NULL,
    abreviatura TEXT,
    ruc         TEXT,
    pais        TEXT NOT NULL DEFAULT 'EC',
    activo      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- ────────────────────────────────────────────────────────────
-- 2. CUENTAS BANCARIAS (por empresa/tenant)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.cuentas_bancarias (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id              UUID NOT NULL,
    banco_id                UUID NOT NULL REFERENCES finance.bancos(id),
    numero_cuenta           TEXT NOT NULL,
    tipo                    TEXT NOT NULL DEFAULT 'corriente'
                            CHECK (tipo IN ('corriente', 'ahorros')),
    moneda                  TEXT NOT NULL DEFAULT 'USD',
    descripcion             TEXT,
    estado                  TEXT NOT NULL DEFAULT 'activa'
                            CHECK (estado IN ('activa', 'bloqueada', 'cerrada')),
    saldo_inicial           DECIMAL(15,2) NOT NULL DEFAULT 0,
    fecha_apertura          DATE,
    cuenta_contable_id      UUID,   -- FK lógica a conta.lp_cuentas (cross-schema)
    participa_conciliacion  BOOLEAN NOT NULL DEFAULT true,
    created_at              TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at              TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- ────────────────────────────────────────────────────────────
-- 3. CONFIGURACIÓN POR EMPRESA
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.configuracion_empresa (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id                  UUID UNIQUE NOT NULL,
    enlace_contable             BOOLEAN NOT NULL DEFAULT false,
    cuenta_banco_defecto_id     UUID,   -- ID en conta.lp_cuentas
    cuenta_cxp_defecto_id       UUID,   -- ID en conta.lp_cuentas
    cuenta_ret_fuente_id        UUID,   -- ID en conta.lp_cuentas
    cuenta_ret_iva_id           UUID,   -- ID en conta.lp_cuentas
    prefijo_egreso              TEXT NOT NULL DEFAULT 'EGR',
    siguiente_numero_egreso     INTEGER NOT NULL DEFAULT 1,
    created_at                  TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at                  TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- ────────────────────────────────────────────────────────────
-- 4. COMPROBANTES DE EGRESO (pagos a proveedores)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.comprobantes_egreso (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id              UUID NOT NULL,
    numero                  TEXT NOT NULL,
    fecha                   DATE NOT NULL DEFAULT CURRENT_DATE,
    proveedor_id            UUID NOT NULL,   -- FK lógica a facturacion.proveedores
    forma_pago              TEXT NOT NULL
                            CHECK (forma_pago IN (
                                'transferencia', 'cheque', 'cheque_postfechado',
                                'tarjeta_credito', 'nota_credito', 'cruce_contable'
                            )),
    cuenta_bancaria_id      UUID REFERENCES finance.cuentas_bancarias(id),
    monto_total             DECIMAL(15,2) NOT NULL,
    referencia              TEXT,
    concepto                TEXT,
    estado                  TEXT NOT NULL DEFAULT 'emitido'
                            CHECK (estado IN ('emitido', 'anulado')),
    tiene_asiento           BOOLEAN NOT NULL DEFAULT false,
    comprobante_contable_id UUID,   -- FK lógica a conta.lp_comprobantes
    anulado_por             UUID,   -- FK lógica a auth.users
    motivo_anulacion        TEXT,
    created_by              UUID,
    created_at              TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at              TIMESTAMPTZ DEFAULT timezone('utc', now()),
    UNIQUE(empresa_id, numero)
);

-- ────────────────────────────────────────────────────────────
-- 5. DETALLE: EGRESO ↔ CUENTAS POR PAGAR
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.egreso_pagos_cxp (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id     UUID NOT NULL,
    egreso_id      UUID NOT NULL REFERENCES finance.comprobantes_egreso(id) ON DELETE CASCADE,
    cxp_id         UUID NOT NULL,   -- FK lógica a facturacion.cuentas_por_pagar
    monto_aplicado DECIMAL(15,2) NOT NULL,
    created_at     TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- ────────────────────────────────────────────────────────────
-- 6. CHEQUES EMITIDOS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.cheques (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL,
    cuenta_bancaria_id  UUID NOT NULL REFERENCES finance.cuentas_bancarias(id),
    egreso_id           UUID REFERENCES finance.comprobantes_egreso(id),
    numero_cheque       TEXT NOT NULL,
    beneficiario        TEXT NOT NULL,
    monto               DECIMAL(15,2) NOT NULL,
    fecha_emision       DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_cobro         DATE,   -- fecha pactada para post-fechados
    es_postfechado      BOOLEAN NOT NULL DEFAULT false,
    estado              TEXT NOT NULL DEFAULT 'emitido'
                        CHECK (estado IN ('emitido', 'cobrado', 'anulado', 'en_transito')),
    fecha_cobro_real    DATE,
    movimiento_cobro_id UUID,   -- FK lógica a finance.movimientos_bancarios
    notas               TEXT,
    created_by          UUID,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- ────────────────────────────────────────────────────────────
-- 7. ANTICIPOS A PROVEEDORES
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.anticipos_proveedores (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id              UUID NOT NULL,
    proveedor_id            UUID NOT NULL,   -- FK lógica a facturacion.proveedores
    cuenta_bancaria_id      UUID REFERENCES finance.cuentas_bancarias(id),
    forma_pago              TEXT NOT NULL DEFAULT 'transferencia'
                            CHECK (forma_pago IN ('transferencia', 'cheque')),
    monto                   DECIMAL(15,2) NOT NULL,
    monto_aplicado          DECIMAL(15,2) NOT NULL DEFAULT 0,
    fecha                   DATE NOT NULL DEFAULT CURRENT_DATE,
    referencia              TEXT,
    concepto                TEXT,
    estado                  TEXT NOT NULL DEFAULT 'disponible'
                            CHECK (estado IN ('disponible', 'aplicado_parcial', 'aplicado_total', 'anulado')),
    tiene_asiento           BOOLEAN NOT NULL DEFAULT false,
    comprobante_contable_id UUID,
    created_by              UUID,
    created_at              TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at              TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- ────────────────────────────────────────────────────────────
-- 8. MOVIMIENTOS BANCARIOS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.movimientos_bancarios (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id              UUID NOT NULL,
    cuenta_bancaria_id      UUID NOT NULL REFERENCES finance.cuentas_bancarias(id),
    tipo                    TEXT NOT NULL
                            CHECK (tipo IN (
                                'deposito', 'nota_debito', 'nota_credito',
                                'comision', 'interes', 'cargo_automatico', 'otro'
                            )),
    fecha                   DATE NOT NULL DEFAULT CURRENT_DATE,
    monto                   DECIMAL(15,2) NOT NULL,
    sentido                 TEXT NOT NULL CHECK (sentido IN ('debito', 'credito')),
    referencia              TEXT,
    descripcion             TEXT,
    estado                  TEXT NOT NULL DEFAULT 'activo'
                            CHECK (estado IN ('activo', 'anulado')),
    conciliado              BOOLEAN NOT NULL DEFAULT false,
    conciliacion_id         UUID,   -- FK lógica a finance.conciliaciones
    tiene_asiento           BOOLEAN NOT NULL DEFAULT false,
    comprobante_contable_id UUID,
    origen                  TEXT NOT NULL DEFAULT 'manual'
                            CHECK (origen IN ('manual', 'egreso', 'anticipo', 'importacion')),
    origen_id               UUID,
    created_by              UUID,
    created_at              TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at              TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- ────────────────────────────────────────────────────────────
-- 9. CONCILIACIONES BANCARIAS (cabecera)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.conciliaciones (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL,
    cuenta_bancaria_id  UUID NOT NULL REFERENCES finance.cuentas_bancarias(id),
    periodo_año         INTEGER NOT NULL,
    periodo_mes         INTEGER NOT NULL,
    fecha_inicio        DATE NOT NULL,
    fecha_fin           DATE NOT NULL,
    saldo_segun_banco   DECIMAL(15,2) NOT NULL DEFAULT 0,
    saldo_segun_libros  DECIMAL(15,2) NOT NULL DEFAULT 0,
    estado              TEXT NOT NULL DEFAULT 'borrador'
                        CHECK (estado IN ('borrador', 'confirmada')),
    notas               TEXT,
    created_by          UUID,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc', now()),
    updated_at          TIMESTAMPTZ DEFAULT timezone('utc', now()),
    UNIQUE(empresa_id, cuenta_bancaria_id, periodo_año, periodo_mes)
);

-- ────────────────────────────────────────────────────────────
-- 10. LÍNEAS DE CONCILIACIÓN
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.conciliacion_lineas (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id      UUID NOT NULL,
    conciliacion_id UUID NOT NULL REFERENCES finance.conciliaciones(id) ON DELETE CASCADE,
    movimiento_id   UUID,   -- FK lógica a finance.movimientos_bancarios
    cheque_id       UUID,   -- FK lógica a finance.cheques
    tipo_linea      TEXT NOT NULL CHECK (tipo_linea IN ('sistema', 'extracto')),
    descripcion     TEXT,
    monto           DECIMAL(15,2) NOT NULL,
    fecha           DATE,
    conciliado      BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- ────────────────────────────────────────────────────────────
-- 11. ÍNDICES PARA RENDIMIENTO
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fs_cb_empresa        ON finance.cuentas_bancarias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fs_ce_empresa_fecha  ON finance.comprobantes_egreso(empresa_id, fecha);
CREATE INDEX IF NOT EXISTS idx_fs_ce_proveedor      ON finance.comprobantes_egreso(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_fs_ce_estado         ON finance.comprobantes_egreso(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_fs_cheques_empresa   ON finance.cheques(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fs_cheques_postfech  ON finance.cheques(empresa_id, es_postfechado) WHERE es_postfechado = true;
CREATE INDEX IF NOT EXISTS idx_fs_cheques_estado    ON finance.cheques(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_fs_mov_empresa       ON finance.movimientos_bancarios(empresa_id, cuenta_bancaria_id);
CREATE INDEX IF NOT EXISTS idx_fs_mov_fecha         ON finance.movimientos_bancarios(empresa_id, fecha);
CREATE INDEX IF NOT EXISTS idx_fs_mov_conciliado    ON finance.movimientos_bancarios(empresa_id, conciliado);
CREATE INDEX IF NOT EXISTS idx_fs_anticipo_prov     ON finance.anticipos_proveedores(empresa_id, proveedor_id);
CREATE INDEX IF NOT EXISTS idx_fs_anticipo_estado   ON finance.anticipos_proveedores(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_fs_concil_empresa    ON finance.conciliaciones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fs_epc_egreso        ON finance.egreso_pagos_cxp(egreso_id);
CREATE INDEX IF NOT EXISTS idx_fs_epc_cxp           ON finance.egreso_pagos_cxp(cxp_id);

-- ────────────────────────────────────────────────────────────
-- 12. ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────
ALTER TABLE finance.cuentas_bancarias       ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.configuracion_empresa   ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.comprobantes_egreso     ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.egreso_pagos_cxp        ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.cheques                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.anticipos_proveedores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.movimientos_bancarios   ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.conciliaciones          ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.conciliacion_lineas     ENABLE ROW LEVEL SECURITY;

-- Política base: usuario solo ve registros de su empresa
CREATE POLICY "fs_cb_empresa" ON finance.cuentas_bancarias
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
    ));

CREATE POLICY "fs_config_empresa" ON finance.configuracion_empresa
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
    ));

CREATE POLICY "fs_ce_empresa" ON finance.comprobantes_egreso
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
    ));

CREATE POLICY "fs_epc_empresa" ON finance.egreso_pagos_cxp
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
    ));

CREATE POLICY "fs_cheques_empresa" ON finance.cheques
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
    ));

CREATE POLICY "fs_anticipos_empresa" ON finance.anticipos_proveedores
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
    ));

CREATE POLICY "fs_mov_empresa" ON finance.movimientos_bancarios
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
    ));

CREATE POLICY "fs_concil_empresa" ON finance.conciliaciones
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
    ));

CREATE POLICY "fs_concil_lineas_empresa" ON finance.conciliacion_lineas
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
    ));

-- ────────────────────────────────────────────────────────────
-- 13. FUNCIÓN: siguiente número de egreso por empresa
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION finance.fn_siguiente_numero_egreso(p_empresa_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    v_prefijo   TEXT;
    v_siguiente INTEGER;
BEGIN
    SELECT prefijo_egreso, siguiente_numero_egreso
      INTO v_prefijo, v_siguiente
      FROM finance.configuracion_empresa
     WHERE empresa_id = p_empresa_id;

    IF NOT FOUND THEN
        v_prefijo   := 'EGR';
        v_siguiente := 1;
        INSERT INTO finance.configuracion_empresa(empresa_id, prefijo_egreso, siguiente_numero_egreso)
        VALUES (p_empresa_id, v_prefijo, v_siguiente + 1);
    ELSE
        UPDATE finance.configuracion_empresa
           SET siguiente_numero_egreso = v_siguiente + 1,
               updated_at = timezone('utc', now())
         WHERE empresa_id = p_empresa_id;
    END IF;

    RETURN v_prefijo || '-' || LPAD(v_siguiente::TEXT, 6, '0');
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 14. FUNCIÓN: calcular saldo actual de una cuenta bancaria
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION finance.fn_saldo_cuenta(p_cuenta_id UUID)
RETURNS DECIMAL(15,2) LANGUAGE plpgsql AS $$
DECLARE
    v_saldo_inicial DECIMAL(15,2);
    v_movimientos   DECIMAL(15,2);
BEGIN
    SELECT saldo_inicial INTO v_saldo_inicial
      FROM finance.cuentas_bancarias WHERE id = p_cuenta_id;

    SELECT COALESCE(
        SUM(CASE WHEN sentido = 'credito' THEN monto ELSE -monto END),
        0
    ) INTO v_movimientos
    FROM finance.movimientos_bancarios
    WHERE cuenta_bancaria_id = p_cuenta_id
      AND estado = 'activo';

    RETURN COALESCE(v_saldo_inicial, 0) + v_movimientos;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 15. BANCOS DEL ECUADOR — Datos iniciales
-- ────────────────────────────────────────────────────────────
INSERT INTO finance.bancos (codigo, nombre, abreviatura, pais) VALUES
-- Bancos Privados
('001', 'Banco Pichincha C.A.',                    'PICHINCHA',     'EC'),
('002', 'Banco de Guayaquil S.A.',                  'GUAYAQUIL',     'EC'),
('003', 'Produbanco S.A.',                          'PRODUBANCO',    'EC'),
('004', 'Banco del Pacífico S.A.',                  'PACIFICO',      'EC'),
('005', 'Banco Internacional S.A.',                 'INTERNACIONAL', 'EC'),
('006', 'Banco Bolivariano C.A.',                   'BOLIVARIANO',   'EC'),
('007', 'Banco General Rumiñahui S.A.',             'BGR',           'EC'),
('008', 'Banco del Austro S.A.',                    'AUSTRO',        'EC'),
('009', 'Banco Procredit S.A.',                     'PROCREDIT',     'EC'),
('010', 'Banco de Loja S.A.',                       'LOJA',          'EC'),
('011', 'Banco Solidario S.A.',                     'SOLIDARIO',     'EC'),
('012', 'Banco Finca S.A.',                         'FINCA',         'EC'),
('013', 'Banco D-Miro S.A.',                        'D-MIRO',        'EC'),
('014', 'Banco Delbank S.A.',                       'DELBANK',       'EC'),
('015', 'Banco ProAmérica S.A.',                    'PROAMERICA',    'EC'),
('016', 'Banco Coopnacional S.A.',                  'COOPNACIONAL',  'EC'),
('017', 'Banco Capital S.A.',                       'CAPITAL',       'EC'),
('018', 'Banco Comercial de Manabí S.A.',           'BANCOMANDA',    'EC'),
('019', 'Banco de Machala S.A.',                    'MACHALA',       'EC'),
('020', 'Banco Definitivo S.A.',                    'DEFINITIVO',    'EC'),
('021', 'Banco VisionFund Ecuador S.A.',            'VISIONFUND',    'EC'),
('022', 'Citibank N.A. Sucursal Ecuador',           'CITI',          'EC'),
('023', 'Diners Club del Ecuador S.A.',             'DINERS',        'EC'),
('024', 'Banco Amazonas S.A.',                      'AMAZONAS',      'EC'),
-- Bancos Públicos
('025', 'BanEcuador B.P.',                          'BANECUADOR',    'EC'),
('026', 'BIESS',                                    'BIESS',         'EC'),
('027', 'Corporación Financiera Nacional',          'CFN',           'EC'),
('028', 'Banco del Estado (BEDE)',                  'BANESTADO',     'EC'),
('029', 'Banco Central del Ecuador',               'BCE',           'EC')
ON CONFLICT (codigo) DO NOTHING;
