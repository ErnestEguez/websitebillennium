-- ============================================================
-- LEDGER PRO — Fase 1
-- Schema: conta (pre-existing)
-- Prefijo tablas: lp_
-- IMPORTANTE: No alterar estructuras existentes de QuickInvoice
-- ============================================================

-- ============================================================
-- CATÁLOGO: MONEDAS (global)
-- ============================================================
CREATE TABLE IF NOT EXISTS conta.lp_monedas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    simbolo     TEXT NOT NULL,
    decimales   INT  NOT NULL DEFAULT 2,
    activa      BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================
-- EMPRESAS / TENANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS conta.lp_empresas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre          TEXT NOT NULL,
    razon_social    TEXT NOT NULL,
    ruc             TEXT,
    direccion       TEXT,
    telefono        TEXT,
    email           TEXT,
    representante   TEXT,
    moneda_id       UUID NOT NULL REFERENCES conta.lp_monedas(id),
    logo_url        TEXT,
    activa          BOOLEAN NOT NULL DEFAULT true,
    qi_empresa_id   UUID,   -- enlace futuro con QuickInvoice (Fase 4)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- USUARIOS POR EMPRESA (un usuario puede manejar N empresas)
-- ============================================================
CREATE TABLE IF NOT EXISTS conta.lp_usuarios_empresa (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    empresa_id  UUID NOT NULL REFERENCES conta.lp_empresas(id) ON DELETE CASCADE,
    rol         TEXT NOT NULL CHECK (rol IN ('admin_conta', 'contador', 'auxiliar')),
    activo      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, empresa_id)
);

-- ============================================================
-- PERIODOS CONTABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS conta.lp_periodos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES conta.lp_empresas(id),
    año             INT  NOT NULL,
    mes             INT  CHECK (mes BETWEEN 1 AND 12),   -- NULL = periodo anual
    estado          TEXT NOT NULL DEFAULT 'abierto'
                         CHECK (estado IN ('abierto', 'cerrado', 'bloqueado')),
    fecha_apertura  DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_cierre    DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(empresa_id, año, mes)
);

-- ============================================================
-- TIPOS DE COMPROBANTE (tabla global, se seed-ea)
-- ============================================================
CREATE TABLE IF NOT EXISTS conta.lp_tipos_comprobante (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo      TEXT NOT NULL UNIQUE,
    nombre      TEXT NOT NULL,
    naturaleza  TEXT NOT NULL CHECK (naturaleza IN ('ingreso', 'egreso', 'diario')),
    activo      BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================
-- PLANTILLAS DE PLAN DE CUENTAS
-- ============================================================
CREATE TABLE IF NOT EXISTS conta.lp_plantillas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre      TEXT NOT NULL,
    pais        TEXT NOT NULL DEFAULT 'EC',
    descripcion TEXT,
    activa      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conta.lp_plantilla_cuentas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plantilla_id        UUID NOT NULL REFERENCES conta.lp_plantillas(id) ON DELETE CASCADE,
    codigo              TEXT NOT NULL,
    nombre              TEXT NOT NULL,
    nivel               INT  NOT NULL,
    tipo                TEXT NOT NULL CHECK (tipo IN ('activo','pasivo','patrimonio','ingreso','gasto')),
    naturaleza          TEXT NOT NULL CHECK (naturaleza IN ('deudora','acreedora')),
    codigo_padre        TEXT,
    acepta_movimientos  BOOLEAN NOT NULL DEFAULT false,
    codigo_sri          TEXT,
    codigo_supe         TEXT,
    UNIQUE(plantilla_id, codigo)
);

-- ============================================================
-- PLAN DE CUENTAS (por empresa)
-- ============================================================
CREATE TABLE IF NOT EXISTS conta.lp_cuentas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES conta.lp_empresas(id),
    codigo              TEXT NOT NULL,
    nombre              TEXT NOT NULL,
    nivel               INT  NOT NULL,
    tipo                TEXT NOT NULL CHECK (tipo IN ('activo','pasivo','patrimonio','ingreso','gasto')),
    naturaleza          TEXT NOT NULL CHECK (naturaleza IN ('deudora','acreedora')),
    cuenta_padre_id     UUID REFERENCES conta.lp_cuentas(id),
    acepta_movimientos  BOOLEAN NOT NULL DEFAULT false,
    codigo_sri          TEXT,
    codigo_supe         TEXT,
    plantilla_origen_id UUID REFERENCES conta.lp_plantillas(id),
    activa              BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(empresa_id, codigo)
);

-- ============================================================
-- COMPROBANTES (cabecera de asientos)
-- ============================================================
CREATE TABLE IF NOT EXISTS conta.lp_comprobantes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES conta.lp_empresas(id),
    periodo_id          UUID NOT NULL REFERENCES conta.lp_periodos(id),
    tipo_comprobante_id UUID NOT NULL REFERENCES conta.lp_tipos_comprobante(id),
    numero              TEXT NOT NULL,           -- CI-2025-01-000001
    secuencial          INT  NOT NULL,
    fecha               DATE NOT NULL,
    glosa               TEXT NOT NULL,
    estado              TEXT NOT NULL DEFAULT 'borrador'
                             CHECK (estado IN ('borrador','confirmado','anulado')),
    total_debe          NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_haber         NUMERIC(18,2) NOT NULL DEFAULT 0,
    moneda_id           UUID REFERENCES conta.lp_monedas(id),
    tipo_cambio         NUMERIC(18,6) NOT NULL DEFAULT 1,
    origen              TEXT NOT NULL DEFAULT 'manual'
                             CHECK (origen IN ('manual','quickinvoice','sri','cierre','apertura')),
    referencia_externa  TEXT,
    created_by          UUID REFERENCES auth.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(empresa_id, numero)
);

-- ============================================================
-- LÍNEAS DE COMPROBANTE
-- ============================================================
CREATE TABLE IF NOT EXISTS conta.lp_comprobante_lineas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comprobante_id  UUID NOT NULL REFERENCES conta.lp_comprobantes(id) ON DELETE CASCADE,
    empresa_id      UUID NOT NULL REFERENCES conta.lp_empresas(id),
    cuenta_id       UUID NOT NULL REFERENCES conta.lp_cuentas(id),
    descripcion     TEXT,
    debe            NUMERIC(18,2) NOT NULL DEFAULT 0,
    haber           NUMERIC(18,2) NOT NULL DEFAULT 0,
    orden           INT  NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_linea_positivos     CHECK (debe >= 0 AND haber >= 0),
    CONSTRAINT chk_linea_un_lado       CHECK (NOT (debe > 0 AND haber > 0)),
    CONSTRAINT chk_linea_valor         CHECK (debe > 0 OR haber > 0)
);

-- ============================================================
-- SALDOS POR CUENTA (tabla de rendimiento para reportes)
-- Se actualiza vía función al confirmar/anular comprobantes.
-- ============================================================
CREATE TABLE IF NOT EXISTS conta.lp_saldos_cuenta (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES conta.lp_empresas(id),
    cuenta_id           UUID NOT NULL REFERENCES conta.lp_cuentas(id),
    periodo_id          UUID NOT NULL REFERENCES conta.lp_periodos(id),
    saldo_inicial_debe  NUMERIC(18,2) NOT NULL DEFAULT 0,
    saldo_inicial_haber NUMERIC(18,2) NOT NULL DEFAULT 0,
    movimientos_debe    NUMERIC(18,2) NOT NULL DEFAULT 0,
    movimientos_haber   NUMERIC(18,2) NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(empresa_id, cuenta_id, periodo_id)
);

-- ============================================================
-- PRESUPUESTO (Fase 3 — tablas listas desde ahora)
-- ============================================================
CREATE TABLE IF NOT EXISTS conta.lp_presupuestos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id  UUID NOT NULL REFERENCES conta.lp_empresas(id),
    año         INT  NOT NULL,
    nombre      TEXT NOT NULL,
    estado      TEXT NOT NULL DEFAULT 'borrador'
                     CHECK (estado IN ('borrador','aprobado')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(empresa_id, año, nombre)
);

CREATE TABLE IF NOT EXISTS conta.lp_presupuesto_detalle (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    presupuesto_id       UUID NOT NULL REFERENCES conta.lp_presupuestos(id) ON DELETE CASCADE,
    empresa_id           UUID NOT NULL REFERENCES conta.lp_empresas(id),
    cuenta_id            UUID NOT NULL REFERENCES conta.lp_cuentas(id),
    periodo_id           UUID NOT NULL REFERENCES conta.lp_periodos(id),
    valor_presupuestado  NUMERIC(18,2) NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(presupuesto_id, cuenta_id, periodo_id)
);

-- ============================================================
-- INTEGRACIÓN QUICKINVOICE (Fase 4 — estructura lista)
-- ============================================================
CREATE TABLE IF NOT EXISTS conta.lp_config_integracion (
    empresa_id            UUID PRIMARY KEY REFERENCES conta.lp_empresas(id),
    qi_empresa_id         UUID,
    modo_asiento_ventas   TEXT NOT NULL DEFAULT 'resumen'
                               CHECK (modo_asiento_ventas IN ('resumen','detalle')),
    activa                BOOLEAN NOT NULL DEFAULT false,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conta.lp_mapeo_cuentas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES conta.lp_empresas(id),
    tipo_movimiento     TEXT NOT NULL,
    categoria_externa   TEXT,
    cuenta_id           UUID NOT NULL REFERENCES conta.lp_cuentas(id),
    UNIQUE(empresa_id, tipo_movimiento, categoria_externa)
);

CREATE TABLE IF NOT EXISTS conta.lp_log_importaciones (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id           UUID NOT NULL REFERENCES conta.lp_empresas(id),
    tipo                 TEXT NOT NULL CHECK (tipo IN ('ventas_qi','compras_sri')),
    periodo_id           UUID REFERENCES conta.lp_periodos(id),
    estado               TEXT NOT NULL DEFAULT 'pendiente'
                              CHECK (estado IN ('pendiente','en_revision','procesado','error')),
    registros_total      INT  NOT NULL DEFAULT 0,
    registros_procesados INT  NOT NULL DEFAULT 0,
    datos_json           JSONB,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_lp_cuentas_empresa        ON conta.lp_cuentas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_lp_cuentas_padre          ON conta.lp_cuentas(cuenta_padre_id);
CREATE INDEX IF NOT EXISTS idx_lp_cuentas_codigo         ON conta.lp_cuentas(empresa_id, codigo);
CREATE INDEX IF NOT EXISTS idx_lp_periodos_empresa       ON conta.lp_periodos(empresa_id, año);
CREATE INDEX IF NOT EXISTS idx_lp_comp_empresa_periodo   ON conta.lp_comprobantes(empresa_id, periodo_id);
CREATE INDEX IF NOT EXISTS idx_lp_comp_fecha             ON conta.lp_comprobantes(empresa_id, fecha);
CREATE INDEX IF NOT EXISTS idx_lp_comp_estado            ON conta.lp_comprobantes(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_lp_lineas_comprobante     ON conta.lp_comprobante_lineas(comprobante_id);
CREATE INDEX IF NOT EXISTS idx_lp_lineas_cuenta          ON conta.lp_comprobante_lineas(cuenta_id);
CREATE INDEX IF NOT EXISTS idx_lp_saldos_lookup          ON conta.lp_saldos_cuenta(empresa_id, cuenta_id, periodo_id);
CREATE INDEX IF NOT EXISTS idx_lp_ue_user                ON conta.lp_usuarios_empresa(user_id);
CREATE INDEX IF NOT EXISTS idx_lp_ue_empresa             ON conta.lp_usuarios_empresa(empresa_id);

-- ============================================================
-- FUNCIÓN: Generar número de comprobante
-- Formato: {TIPO}-{AÑO}-{MES}-{SECUENCIAL 6 dígitos}
-- ============================================================
CREATE OR REPLACE FUNCTION conta.lp_generar_numero_comprobante(
    p_empresa_id  UUID,
    p_tipo_codigo TEXT,
    p_año         INT,
    p_mes         INT
) RETURNS TEXT AS $$
DECLARE
    v_secuencial INT;
BEGIN
    SELECT COALESCE(MAX(c.secuencial), 0) + 1
    INTO   v_secuencial
    FROM   conta.lp_comprobantes c
    JOIN   conta.lp_tipos_comprobante t ON t.id = c.tipo_comprobante_id
    JOIN   conta.lp_periodos p          ON p.id = c.periodo_id
    WHERE  c.empresa_id = p_empresa_id
      AND  t.codigo     = p_tipo_codigo
      AND  p.año        = p_año
      AND  p.mes        = p_mes
      AND  c.estado    != 'anulado';

    RETURN p_tipo_codigo
        || '-' || p_año
        || '-' || LPAD(p_mes::TEXT, 2, '0')
        || '-' || LPAD(v_secuencial::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCIÓN: Actualizar saldos al confirmar / anular un comprobante
-- p_operacion: 'sumar' al confirmar, 'restar' al anular
-- ============================================================
CREATE OR REPLACE FUNCTION conta.lp_actualizar_saldos(
    p_comprobante_id UUID,
    p_operacion      TEXT   -- 'sumar' | 'restar'
) RETURNS VOID AS $$
DECLARE
    v_rec  RECORD;
    v_mult INT := CASE WHEN p_operacion = 'sumar' THEN 1 ELSE -1 END;
BEGIN
    FOR v_rec IN
        SELECT l.cuenta_id,
               l.debe,
               l.haber,
               c.empresa_id,
               c.periodo_id
        FROM   conta.lp_comprobante_lineas l
        JOIN   conta.lp_comprobantes       c ON c.id = l.comprobante_id
        WHERE  l.comprobante_id = p_comprobante_id
    LOOP
        INSERT INTO conta.lp_saldos_cuenta
               (empresa_id, cuenta_id, periodo_id, movimientos_debe, movimientos_haber, updated_at)
        VALUES (v_rec.empresa_id, v_rec.cuenta_id, v_rec.periodo_id,
                v_rec.debe * v_mult, v_rec.haber * v_mult, now())
        ON CONFLICT (empresa_id, cuenta_id, periodo_id) DO UPDATE
            SET movimientos_debe  = lp_saldos_cuenta.movimientos_debe  + (v_rec.debe  * v_mult),
                movimientos_haber = lp_saldos_cuenta.movimientos_haber + (v_rec.haber * v_mult),
                updated_at        = now();
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCIÓN AUXILIAR RLS: empresas del usuario autenticado
-- ============================================================
CREATE OR REPLACE FUNCTION conta.lp_user_empresas()
RETURNS SETOF UUID AS $$
    SELECT empresa_id
    FROM   conta.lp_usuarios_empresa
    WHERE  user_id = auth.uid() AND activo = true;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Tablas globales (solo lectura pública)
ALTER TABLE conta.lp_monedas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta.lp_tipos_comprobante   ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta.lp_plantillas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta.lp_plantilla_cuentas   ENABLE ROW LEVEL SECURITY;

CREATE POLICY lp_monedas_read           ON conta.lp_monedas           FOR SELECT USING (true);
CREATE POLICY lp_tipos_comp_read        ON conta.lp_tipos_comprobante FOR SELECT USING (true);
CREATE POLICY lp_plantillas_read        ON conta.lp_plantillas        FOR SELECT USING (true);
CREATE POLICY lp_plantilla_cuentas_read ON conta.lp_plantilla_cuentas FOR SELECT USING (true);

-- Tablas por empresa
ALTER TABLE conta.lp_empresas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta.lp_usuarios_empresa      ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta.lp_periodos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta.lp_cuentas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta.lp_comprobantes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta.lp_comprobante_lineas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta.lp_saldos_cuenta         ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta.lp_presupuestos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta.lp_presupuesto_detalle   ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta.lp_config_integracion    ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta.lp_mapeo_cuentas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta.lp_log_importaciones     ENABLE ROW LEVEL SECURITY;

-- lp_empresas
CREATE POLICY lp_emp_select ON conta.lp_empresas FOR SELECT
    USING (id IN (SELECT conta.lp_user_empresas()));
CREATE POLICY lp_emp_insert ON conta.lp_empresas FOR INSERT
    WITH CHECK (true);
CREATE POLICY lp_emp_update ON conta.lp_empresas FOR UPDATE
    USING (id IN (SELECT conta.lp_user_empresas()));

-- lp_usuarios_empresa
CREATE POLICY lp_ue_select ON conta.lp_usuarios_empresa FOR SELECT
    USING (user_id = auth.uid() OR empresa_id IN (SELECT conta.lp_user_empresas()));
CREATE POLICY lp_ue_insert ON conta.lp_usuarios_empresa FOR INSERT
    WITH CHECK (true);
CREATE POLICY lp_ue_update ON conta.lp_usuarios_empresa FOR UPDATE
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));

-- lp_periodos
CREATE POLICY lp_per_select ON conta.lp_periodos FOR SELECT
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));
CREATE POLICY lp_per_insert ON conta.lp_periodos FOR INSERT
    WITH CHECK (empresa_id IN (SELECT conta.lp_user_empresas()));
CREATE POLICY lp_per_update ON conta.lp_periodos FOR UPDATE
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));

-- lp_cuentas
CREATE POLICY lp_cta_select ON conta.lp_cuentas FOR SELECT
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));
CREATE POLICY lp_cta_insert ON conta.lp_cuentas FOR INSERT
    WITH CHECK (empresa_id IN (SELECT conta.lp_user_empresas()));
CREATE POLICY lp_cta_update ON conta.lp_cuentas FOR UPDATE
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));
CREATE POLICY lp_cta_delete ON conta.lp_cuentas FOR DELETE
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));

-- lp_comprobantes
CREATE POLICY lp_comp_select ON conta.lp_comprobantes FOR SELECT
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));
CREATE POLICY lp_comp_insert ON conta.lp_comprobantes FOR INSERT
    WITH CHECK (empresa_id IN (SELECT conta.lp_user_empresas()));
CREATE POLICY lp_comp_update ON conta.lp_comprobantes FOR UPDATE
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));

-- lp_comprobante_lineas
CREATE POLICY lp_lin_select ON conta.lp_comprobante_lineas FOR SELECT
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));
CREATE POLICY lp_lin_insert ON conta.lp_comprobante_lineas FOR INSERT
    WITH CHECK (empresa_id IN (SELECT conta.lp_user_empresas()));
CREATE POLICY lp_lin_update ON conta.lp_comprobante_lineas FOR UPDATE
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));
CREATE POLICY lp_lin_delete ON conta.lp_comprobante_lineas FOR DELETE
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));

-- lp_saldos_cuenta
CREATE POLICY lp_sal_all ON conta.lp_saldos_cuenta FOR ALL
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));

-- lp_presupuestos / detalle
CREATE POLICY lp_pres_all ON conta.lp_presupuestos FOR ALL
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));
CREATE POLICY lp_presd_all ON conta.lp_presupuesto_detalle FOR ALL
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));

-- Integración
CREATE POLICY lp_ci_all ON conta.lp_config_integracion FOR ALL
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));
CREATE POLICY lp_mc_all ON conta.lp_mapeo_cuentas FOR ALL
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));
CREATE POLICY lp_log_all ON conta.lp_log_importaciones FOR ALL
    USING (empresa_id IN (SELECT conta.lp_user_empresas()));

-- ============================================================
-- SEED: Monedas
-- ============================================================
INSERT INTO conta.lp_monedas (codigo, nombre, simbolo, decimales) VALUES
    ('USD', 'Dólar Estadounidense', '$',  2),
    ('EUR', 'Euro',                 '€',  2),
    ('COP', 'Peso Colombiano',      '$',  0),
    ('PEN', 'Sol Peruano',          'S/', 2)
ON CONFLICT (codigo) DO NOTHING;

-- ============================================================
-- SEED: Tipos de Comprobante
-- ============================================================
INSERT INTO conta.lp_tipos_comprobante (codigo, nombre, naturaleza) VALUES
    ('CI', 'Comprobante de Ingreso',   'ingreso'),
    ('CE', 'Comprobante de Egreso',    'egreso'),
    ('CD', 'Comprobante Diario',       'diario'),
    ('ND', 'Nota de Débito',           'diario'),
    ('NC', 'Nota de Crédito',          'diario'),
    ('CA', 'Cierre Anual',             'diario'),
    ('AP', 'Asiento de Apertura',      'diario'),
    ('TR', 'Transferencia',            'diario')
ON CONFLICT (codigo) DO NOTHING;

-- ============================================================
-- SEED: Plantilla Ecuador NIIF PYMES
-- ============================================================
INSERT INTO conta.lp_plantillas (id, nombre, pais, descripcion)
VALUES ('00000000-0000-0000-0000-000000000001',
        'Ecuador — NIIF para PYMES', 'EC',
        'Plan de cuentas basado en NIIF para PYMES, alineado con formulario SRI 101')
ON CONFLICT DO NOTHING;

INSERT INTO conta.lp_plantilla_cuentas
    (plantilla_id, codigo, nombre, nivel, tipo, naturaleza, codigo_padre, acepta_movimientos)
VALUES
-- ══════════════════════════════════════════════
-- 1  ACTIVO
-- ══════════════════════════════════════════════
('00000000-0000-0000-0000-000000000001','1','ACTIVO',1,'activo','deudora',NULL,false),

  ('00000000-0000-0000-0000-000000000001','1.01','ACTIVO CORRIENTE',2,'activo','deudora','1',false),

    ('00000000-0000-0000-0000-000000000001','1.01.01','EFECTIVO Y EQUIVALENTES AL EFECTIVO',3,'activo','deudora','1.01',false),
      ('00000000-0000-0000-0000-000000000001','1.01.01.01','CAJA GENERAL',4,'activo','deudora','1.01.01',true),
      ('00000000-0000-0000-0000-000000000001','1.01.01.02','CAJA CHICA',4,'activo','deudora','1.01.01',true),
      ('00000000-0000-0000-0000-000000000001','1.01.01.03','BANCOS — CUENTA CORRIENTE',4,'activo','deudora','1.01.01',true),
      ('00000000-0000-0000-0000-000000000001','1.01.01.04','BANCOS — CUENTA DE AHORROS',4,'activo','deudora','1.01.01',true),

    ('00000000-0000-0000-0000-000000000001','1.01.02','ACTIVOS FINANCIEROS',3,'activo','deudora','1.01',false),
      ('00000000-0000-0000-0000-000000000001','1.01.02.01','CUENTAS Y DOCUMENTOS POR COBRAR CLIENTES — CORRIENTE',4,'activo','deudora','1.01.02',true),
      ('00000000-0000-0000-0000-000000000001','1.01.02.02','OTRAS CUENTAS Y DOCUMENTOS POR COBRAR — CORRIENTE',4,'activo','deudora','1.01.02',true),
      ('00000000-0000-0000-0000-000000000001','1.01.02.03','(-) PROVISIÓN CUENTAS INCOBRABLES',4,'activo','acreedora','1.01.02',true),

    ('00000000-0000-0000-0000-000000000001','1.01.03','INVENTARIOS',3,'activo','deudora','1.01',false),
      ('00000000-0000-0000-0000-000000000001','1.01.03.01','INVENTARIO DE MATERIA PRIMA',4,'activo','deudora','1.01.03',true),
      ('00000000-0000-0000-0000-000000000001','1.01.03.02','INVENTARIO DE PRODUCTOS EN PROCESO',4,'activo','deudora','1.01.03',true),
      ('00000000-0000-0000-0000-000000000001','1.01.03.03','INVENTARIO DE SUMINISTROS O MATERIALES',4,'activo','deudora','1.01.03',true),
      ('00000000-0000-0000-0000-000000000001','1.01.03.04','INVENTARIO DE PROD. TERMINADOS Y MERCADERÍA EN ALMACÉN',4,'activo','deudora','1.01.03',true),

    ('00000000-0000-0000-0000-000000000001','1.01.04','SERVICIOS Y OTROS PAGOS ANTICIPADOS',3,'activo','deudora','1.01',false),
      ('00000000-0000-0000-0000-000000000001','1.01.04.01','SEGUROS PAGADOS POR ANTICIPADO',4,'activo','deudora','1.01.04',true),
      ('00000000-0000-0000-0000-000000000001','1.01.04.02','ARRIENDOS PAGADOS POR ANTICIPADO',4,'activo','deudora','1.01.04',true),
      ('00000000-0000-0000-0000-000000000001','1.01.04.03','ANTICIPOS A PROVEEDORES',4,'activo','deudora','1.01.04',true),
      ('00000000-0000-0000-0000-000000000001','1.01.04.04','OTROS ANTICIPOS ENTREGADOS',4,'activo','deudora','1.01.04',true),

    ('00000000-0000-0000-0000-000000000001','1.01.05','ACTIVOS POR IMPUESTOS CORRIENTES',3,'activo','deudora','1.01',false),
      ('00000000-0000-0000-0000-000000000001','1.01.05.01','CRÉDITO TRIBUTARIO A FAVOR DE LA EMPRESA (IVA)',4,'activo','deudora','1.01.05',true),
      ('00000000-0000-0000-0000-000000000001','1.01.05.02','CRÉDITO TRIBUTARIO A FAVOR DE LA EMPRESA (RENTA)',4,'activo','deudora','1.01.05',true),
      ('00000000-0000-0000-0000-000000000001','1.01.05.03','ANTICIPO DE IMPUESTO A LA RENTA',4,'activo','deudora','1.01.05',true),

  ('00000000-0000-0000-0000-000000000001','1.02','ACTIVO NO CORRIENTE',2,'activo','deudora','1',false),

    ('00000000-0000-0000-0000-000000000001','1.02.01','PROPIEDADES, PLANTA Y EQUIPO',3,'activo','deudora','1.02',false),
      ('00000000-0000-0000-0000-000000000001','1.02.01.01','TERRENOS',4,'activo','deudora','1.02.01',true),
      ('00000000-0000-0000-0000-000000000001','1.02.01.02','EDIFICIOS',4,'activo','deudora','1.02.01',true),
      ('00000000-0000-0000-0000-000000000001','1.02.01.03','CONSTRUCCIONES EN CURSO',4,'activo','deudora','1.02.01',true),
      ('00000000-0000-0000-0000-000000000001','1.02.01.04','INSTALACIONES',4,'activo','deudora','1.02.01',true),
      ('00000000-0000-0000-0000-000000000001','1.02.01.05','MUEBLES Y ENSERES',4,'activo','deudora','1.02.01',true),
      ('00000000-0000-0000-0000-000000000001','1.02.01.06','MAQUINARIA Y EQUIPO',4,'activo','deudora','1.02.01',true),
      ('00000000-0000-0000-0000-000000000001','1.02.01.07','EQUIPO DE COMPUTACIÓN',4,'activo','deudora','1.02.01',true),
      ('00000000-0000-0000-0000-000000000001','1.02.01.08','VEHÍCULOS Y EQUIPOS DE TRANSPORTE',4,'activo','deudora','1.02.01',true),
      ('00000000-0000-0000-0000-000000000001','1.02.01.09','(-) DEPRECIACIÓN ACUMULADA PROPIEDADES, PLANTA Y EQUIPO',4,'activo','acreedora','1.02.01',true),

    ('00000000-0000-0000-0000-000000000001','1.02.05','ACTIVO INTANGIBLE',3,'activo','deudora','1.02',false),
      ('00000000-0000-0000-0000-000000000001','1.02.05.01','PLUSVALÍAS',4,'activo','deudora','1.02.05',true),
      ('00000000-0000-0000-0000-000000000001','1.02.05.02','MARCAS, PATENTES, DERECHOS DE LLAVE Y SIMILARES',4,'activo','deudora','1.02.05',true),
      ('00000000-0000-0000-0000-000000000001','1.02.05.03','(-) AMORTIZACIÓN ACUMULADA DE ACTIVOS INTANGIBLES',4,'activo','acreedora','1.02.05',true),

-- ══════════════════════════════════════════════
-- 2  PASIVO
-- ══════════════════════════════════════════════
('00000000-0000-0000-0000-000000000001','2','PASIVO',1,'pasivo','acreedora',NULL,false),

  ('00000000-0000-0000-0000-000000000001','2.01','PASIVO CORRIENTE',2,'pasivo','acreedora','2',false),

    ('00000000-0000-0000-0000-000000000001','2.01.01','CUENTAS Y DOCUMENTOS POR PAGAR',3,'pasivo','acreedora','2.01',false),
      ('00000000-0000-0000-0000-000000000001','2.01.01.01','PROVEEDORES — CORRIENTE',4,'pasivo','acreedora','2.01.01',true),
      ('00000000-0000-0000-0000-000000000001','2.01.01.02','OTRAS CUENTAS Y DOCUMENTOS POR PAGAR — CORRIENTE',4,'pasivo','acreedora','2.01.01',true),

    ('00000000-0000-0000-0000-000000000001','2.01.02','OBLIGACIONES CON INSTITUCIONES FINANCIERAS — CORRIENTE',3,'pasivo','acreedora','2.01',false),
      ('00000000-0000-0000-0000-000000000001','2.01.02.01','PRÉSTAMOS BANCARIOS — CORRIENTE',4,'pasivo','acreedora','2.01.02',true),

    ('00000000-0000-0000-0000-000000000001','2.01.04','OTRAS OBLIGACIONES CORRIENTES',3,'pasivo','acreedora','2.01',false),
      ('00000000-0000-0000-0000-000000000001','2.01.04.01','CON LA ADMINISTRACIÓN TRIBUTARIA',4,'pasivo','acreedora','2.01.04',true),
      ('00000000-0000-0000-0000-000000000001','2.01.04.02','IMPUESTO A LA RENTA POR PAGAR DEL EJERCICIO',4,'pasivo','acreedora','2.01.04',true),
      ('00000000-0000-0000-0000-000000000001','2.01.04.03','CON EL IESS',4,'pasivo','acreedora','2.01.04',true),
      ('00000000-0000-0000-0000-000000000001','2.01.04.04','POR BENEFICIOS DE LEY A EMPLEADOS',4,'pasivo','acreedora','2.01.04',true),
      ('00000000-0000-0000-0000-000000000001','2.01.04.05','PARTICIPACIÓN TRABAJADORES POR PAGAR DEL EJERCICIO',4,'pasivo','acreedora','2.01.04',true),
      ('00000000-0000-0000-0000-000000000001','2.01.04.06','DIVIDENDOS POR PAGAR',4,'pasivo','acreedora','2.01.04',true),

    ('00000000-0000-0000-0000-000000000001','2.01.05','ANTICIPOS DE CLIENTES — CORRIENTE',3,'pasivo','acreedora','2.01',false),
      ('00000000-0000-0000-0000-000000000001','2.01.05.01','ANTICIPOS DE CLIENTES',4,'pasivo','acreedora','2.01.05',true),

  ('00000000-0000-0000-0000-000000000001','2.02','PASIVO NO CORRIENTE',2,'pasivo','acreedora','2',false),

    ('00000000-0000-0000-0000-000000000001','2.02.01','OBLIGACIONES CON INSTITUCIONES FINANCIERAS — NO CORRIENTE',3,'pasivo','acreedora','2.02',false),
      ('00000000-0000-0000-0000-000000000001','2.02.01.01','PRÉSTAMOS BANCARIOS — NO CORRIENTE',4,'pasivo','acreedora','2.02.01',true),

    ('00000000-0000-0000-0000-000000000001','2.02.05','PROVISIONES POR BENEFICIOS A EMPLEADOS',3,'pasivo','acreedora','2.02',false),
      ('00000000-0000-0000-0000-000000000001','2.02.05.01','JUBILACIÓN PATRONAL',4,'pasivo','acreedora','2.02.05',true),
      ('00000000-0000-0000-0000-000000000001','2.02.05.02','DESAHUCIO',4,'pasivo','acreedora','2.02.05',true),

-- ══════════════════════════════════════════════
-- 3  PATRIMONIO NETO
-- ══════════════════════════════════════════════
('00000000-0000-0000-0000-000000000001','3','PATRIMONIO NETO',1,'patrimonio','acreedora',NULL,false),

  ('00000000-0000-0000-0000-000000000001','3.01','CAPITAL',2,'patrimonio','acreedora','3',false),
    ('00000000-0000-0000-0000-000000000001','3.01.01','CAPITAL SUSCRITO O ASIGNADO',3,'patrimonio','acreedora','3.01',true),
    ('00000000-0000-0000-0000-000000000001','3.01.02','(-) CAPITAL SUSCRITO NO PAGADO / ACCIONES EN TESORERÍA',3,'patrimonio','deudora','3.01',true),

  ('00000000-0000-0000-0000-000000000001','3.04','RESERVAS',2,'patrimonio','acreedora','3',false),
    ('00000000-0000-0000-0000-000000000001','3.04.01','RESERVA LEGAL',3,'patrimonio','acreedora','3.04',true),
    ('00000000-0000-0000-0000-000000000001','3.04.02','RESERVAS FACULTATIVA Y ESTATUTARIA',3,'patrimonio','acreedora','3.04',true),

  ('00000000-0000-0000-0000-000000000001','3.06','RESULTADOS ACUMULADOS',2,'patrimonio','acreedora','3',false),
    ('00000000-0000-0000-0000-000000000001','3.06.01','GANANCIAS ACUMULADAS',3,'patrimonio','acreedora','3.06',true),
    ('00000000-0000-0000-0000-000000000001','3.06.02','(-) PÉRDIDAS ACUMULADAS',3,'patrimonio','deudora','3.06',true),

  ('00000000-0000-0000-0000-000000000001','3.07','RESULTADOS DEL EJERCICIO',2,'patrimonio','acreedora','3',false),
    ('00000000-0000-0000-0000-000000000001','3.07.01','GANANCIA NETA DEL PERÍODO',3,'patrimonio','acreedora','3.07',true),
    ('00000000-0000-0000-0000-000000000001','3.07.02','(-) PÉRDIDA NETA DEL PERÍODO',3,'patrimonio','deudora','3.07',true),

-- ══════════════════════════════════════════════
-- 4  INGRESOS
-- ══════════════════════════════════════════════
('00000000-0000-0000-0000-000000000001','4','INGRESOS',1,'ingreso','acreedora',NULL,false),

  ('00000000-0000-0000-0000-000000000001','4.01','INGRESOS DE ACTIVIDADES ORDINARIAS',2,'ingreso','acreedora','4',false),
    ('00000000-0000-0000-0000-000000000001','4.01.01','VENTA DE BIENES',3,'ingreso','acreedora','4.01',true),
    ('00000000-0000-0000-0000-000000000001','4.01.02','PRESTACIÓN DE SERVICIOS',3,'ingreso','acreedora','4.01',true),
    ('00000000-0000-0000-0000-000000000001','4.01.03','CONTRATOS DE CONSTRUCCIÓN',3,'ingreso','acreedora','4.01',true),
    ('00000000-0000-0000-0000-000000000001','4.01.09','(-) DESCUENTO EN VENTAS',3,'ingreso','deudora','4.01',true),
    ('00000000-0000-0000-0000-000000000001','4.01.10','(-) DEVOLUCIONES EN VENTAS',3,'ingreso','deudora','4.01',true),

  ('00000000-0000-0000-0000-000000000001','4.03','OTROS INGRESOS',2,'ingreso','acreedora','4',false),
    ('00000000-0000-0000-0000-000000000001','4.03.01','INTERESES FINANCIEROS GANADOS',3,'ingreso','acreedora','4.03',true),
    ('00000000-0000-0000-0000-000000000001','4.03.02','DIVIDENDOS',3,'ingreso','acreedora','4.03',true),
    ('00000000-0000-0000-0000-000000000001','4.03.03','GANANCIA EN VENTA DE ACTIVOS',3,'ingreso','acreedora','4.03',true),
    ('00000000-0000-0000-0000-000000000001','4.03.04','OTRAS RENTAS',3,'ingreso','acreedora','4.03',true),

-- ══════════════════════════════════════════════
-- 5  COSTOS Y GASTOS
-- ══════════════════════════════════════════════
('00000000-0000-0000-0000-000000000001','5','COSTOS Y GASTOS',1,'gasto','deudora',NULL,false),

  ('00000000-0000-0000-0000-000000000001','5.01','COSTO DE VENTAS Y PRODUCCIÓN',2,'gasto','deudora','5',false),
    ('00000000-0000-0000-0000-000000000001','5.01.01','COSTO DE VENTAS',3,'gasto','deudora','5.01',true),
    ('00000000-0000-0000-0000-000000000001','5.01.02','COSTO DE PRODUCCIÓN',3,'gasto','deudora','5.01',true),

  ('00000000-0000-0000-0000-000000000001','5.02','GASTOS',2,'gasto','deudora','5',false),

    ('00000000-0000-0000-0000-000000000001','5.02.01','GASTOS DE VENTA',3,'gasto','deudora','5.02',false),
      ('00000000-0000-0000-0000-000000000001','5.02.01.01','SUELDOS, SALARIOS Y REMUNERACIONES (VENTAS)',4,'gasto','deudora','5.02.01',true),
      ('00000000-0000-0000-0000-000000000001','5.02.01.02','APORTES A LA SEGURIDAD SOCIAL (VENTAS)',4,'gasto','deudora','5.02.01',true),
      ('00000000-0000-0000-0000-000000000001','5.02.01.03','BENEFICIOS SOCIALES E INDEMNIZACIONES (VENTAS)',4,'gasto','deudora','5.02.01',true),
      ('00000000-0000-0000-0000-000000000001','5.02.01.04','HONORARIOS, COMISIONES Y DIETAS (VENTAS)',4,'gasto','deudora','5.02.01',true),
      ('00000000-0000-0000-0000-000000000001','5.02.01.05','ARRENDAMIENTO OPERATIVO (VENTAS)',4,'gasto','deudora','5.02.01',true),
      ('00000000-0000-0000-0000-000000000001','5.02.01.06','COMISIONES EN VENTAS',4,'gasto','deudora','5.02.01',true),
      ('00000000-0000-0000-0000-000000000001','5.02.01.07','PROMOCIÓN Y PUBLICIDAD',4,'gasto','deudora','5.02.01',true),
      ('00000000-0000-0000-0000-000000000001','5.02.01.08','TRANSPORTE (VENTAS)',4,'gasto','deudora','5.02.01',true),
      ('00000000-0000-0000-0000-000000000001','5.02.01.09','DEPRECIACIÓN PP&E (VENTAS)',4,'gasto','deudora','5.02.01',true),
      ('00000000-0000-0000-0000-000000000001','5.02.01.10','OTROS GASTOS DE VENTA',4,'gasto','deudora','5.02.01',true),

    ('00000000-0000-0000-0000-000000000001','5.02.02','GASTOS ADMINISTRATIVOS',3,'gasto','deudora','5.02',false),
      ('00000000-0000-0000-0000-000000000001','5.02.02.01','SUELDOS, SALARIOS Y REMUNERACIONES (ADMN)',4,'gasto','deudora','5.02.02',true),
      ('00000000-0000-0000-0000-000000000001','5.02.02.02','APORTES A LA SEGURIDAD SOCIAL (ADMN)',4,'gasto','deudora','5.02.02',true),
      ('00000000-0000-0000-0000-000000000001','5.02.02.03','BENEFICIOS SOCIALES E INDEMNIZACIONES (ADMN)',4,'gasto','deudora','5.02.02',true),
      ('00000000-0000-0000-0000-000000000001','5.02.02.04','HONORARIOS PROFESIONALES (ADMN)',4,'gasto','deudora','5.02.02',true),
      ('00000000-0000-0000-0000-000000000001','5.02.02.05','ARRENDAMIENTO OPERATIVO (ADMN)',4,'gasto','deudora','5.02.02',true),
      ('00000000-0000-0000-0000-000000000001','5.02.02.06','MANTENIMIENTO Y REPARACIONES (ADMN)',4,'gasto','deudora','5.02.02',true),
      ('00000000-0000-0000-0000-000000000001','5.02.02.07','SUMINISTROS Y MATERIALES DE OFICINA',4,'gasto','deudora','5.02.02',true),
      ('00000000-0000-0000-0000-000000000001','5.02.02.08','AGUA, ENERGÍA, LUZ Y TELECOMUNICACIONES',4,'gasto','deudora','5.02.02',true),
      ('00000000-0000-0000-0000-000000000001','5.02.02.09','SEGUROS Y REASEGUROS (ADMN)',4,'gasto','deudora','5.02.02',true),
      ('00000000-0000-0000-0000-000000000001','5.02.02.10','GASTOS DE VIAJE (ADMN)',4,'gasto','deudora','5.02.02',true),
      ('00000000-0000-0000-0000-000000000001','5.02.02.11','IMPUESTOS, CONTRIBUCIONES Y OTROS (ADMN)',4,'gasto','deudora','5.02.02',true),
      ('00000000-0000-0000-0000-000000000001','5.02.02.12','DEPRECIACIÓN PP&E (ADMN)',4,'gasto','deudora','5.02.02',true),
      ('00000000-0000-0000-0000-000000000001','5.02.02.13','AMORTIZACIONES (ADMN)',4,'gasto','deudora','5.02.02',true),
      ('00000000-0000-0000-0000-000000000001','5.02.02.14','CUENTAS INCOBRABLES Y PROVISIONES',4,'gasto','deudora','5.02.02',true),
      ('00000000-0000-0000-0000-000000000001','5.02.02.15','OTROS GASTOS ADMINISTRATIVOS',4,'gasto','deudora','5.02.02',true),

    ('00000000-0000-0000-0000-000000000001','5.02.03','GASTOS FINANCIEROS',3,'gasto','deudora','5.02',false),
      ('00000000-0000-0000-0000-000000000001','5.02.03.01','INTERESES BANCARIOS Y FINANCIEROS',4,'gasto','deudora','5.02.03',true),
      ('00000000-0000-0000-0000-000000000001','5.02.03.02','COMISIONES BANCARIAS',4,'gasto','deudora','5.02.03',true),
      ('00000000-0000-0000-0000-000000000001','5.02.03.03','DIFERENCIA EN CAMBIO',4,'gasto','deudora','5.02.03',true),
      ('00000000-0000-0000-0000-000000000001','5.02.03.04','OTROS GASTOS FINANCIEROS',4,'gasto','deudora','5.02.03',true),

    ('00000000-0000-0000-0000-000000000001','5.02.04','OTROS GASTOS',3,'gasto','deudora','5.02',false),
      ('00000000-0000-0000-0000-000000000001','5.02.04.01','PÉRDIDA EN VENTA DE ACTIVOS',4,'gasto','deudora','5.02.04',true),
      ('00000000-0000-0000-0000-000000000001','5.02.04.02','OTROS GASTOS NO OPERACIONALES',4,'gasto','deudora','5.02.04',true),

  ('00000000-0000-0000-0000-000000000001','5.03','GASTO IMPUESTO A LA RENTA',2,'gasto','deudora','5',false),
    ('00000000-0000-0000-0000-000000000001','5.03.01','GASTO IMPUESTO A LA RENTA CORRIENTE',3,'gasto','deudora','5.03',true),
    ('00000000-0000-0000-0000-000000000001','5.03.02','GASTO IMPUESTO A LA RENTA DIFERIDO',3,'gasto','deudora','5.03',true)

ON CONFLICT DO NOTHING;
