-- Formulario 103 — Retención en la Fuente del Impuesto a la Renta.
--
-- Mismo patrón que contabilidad.lp_iva_104*: tablas dentro del schema
-- `contabilidad` (LedgerPro/Corina ERP), que consultan en vivo el schema
-- `facturacion` (QuickInvoice) por RUC — misma base de datos, sin tabla
-- sincronizada intermedia.
--
-- Alcance: SOLO retenciones tipo 'FUENTE' (impuesto a la renta) originadas
-- en compras a proveedores locales — los 24 códigos activos en
-- facturacion.codigos_retencion hoy. Fuera de alcance (igual que ya está
-- anotado en esa tabla): pagos al exterior (721-724), dividendos, loterías,
-- banano, artesanos (601, 0% exento). La retención de IVA que se efectúa en
-- compras NO va en este formulario, se reporta en el 104 (casillero 605).
--
-- Mapeo código→casillero verificado línea por línea contra la plantilla
-- oficial del SRI "FORMULARIO RETENCIONES EN LA FUENTE" vigente desde
-- jun-2026 (columnas BASE IMPONIBLE / VALOR RETENIDO por concepto).
-- Varios códigos de comprobante se agrupan en un mismo casillero de
-- declaración porque así los agrupa el propio SRI (ej. 304A-304E -> 304/354;
-- 343A/343C/344A/344B -> 344/394).

-- ────────────────────────────────────────────────────────────────
-- 1. Cabecera de declaración
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contabilidad.lp_rf_103 (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES contabilidad.lp_empresas(id) ON DELETE CASCADE,
    año                 INT  NOT NULL,
    mes                 INT  NOT NULL CHECK (mes BETWEEN 1 AND 12),
    version_form        TEXT NOT NULL DEFAULT 'v2026',
    estado              TEXT NOT NULL DEFAULT 'borrador'
        CHECK (estado IN ('borrador','revisado','enviado','sustitutiva','anulado')),
    es_sustitutiva      BOOLEAN NOT NULL DEFAULT false,
    numero_formulario   TEXT,
    fecha_generacion    TIMESTAMPTZ,
    fecha_envio         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (empresa_id, año, mes, es_sustitutiva)
);

CREATE INDEX IF NOT EXISTS idx_lp_rf_103_empresa ON contabilidad.lp_rf_103(empresa_id, año, mes);

-- ────────────────────────────────────────────────────────────────
-- 2. Catálogo de casilleros (mismo patrón que lp_iva_104_mapeo_xml)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contabilidad.lp_rf_103_mapeo_xml (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_form    TEXT NOT NULL,
    casillero       TEXT NOT NULL,
    descripcion     TEXT NOT NULL,
    seccion         TEXT NOT NULL,
    tipo_dato       TEXT NOT NULL DEFAULT 'DECIMAL',
    obligatorio     BOOLEAN NOT NULL DEFAULT false,
    orden           INT  NOT NULL,
    activo          BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (version_form, casillero)
);

-- ────────────────────────────────────────────────────────────────
-- 3. Detalle por declaración (valor_final = calculado + ajuste, igual que 104)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contabilidad.lp_rf_103_detalle (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    declaracion_id      UUID NOT NULL REFERENCES contabilidad.lp_rf_103(id) ON DELETE CASCADE,
    empresa_id          UUID NOT NULL REFERENCES contabilidad.lp_empresas(id) ON DELETE CASCADE,
    casillero           TEXT NOT NULL,
    valor_calculado     DECIMAL(14,2) NOT NULL DEFAULT 0,
    ajuste_manual       DECIMAL(14,2) NOT NULL DEFAULT 0,
    valor_final         DECIMAL(14,2) GENERATED ALWAYS AS (valor_calculado + ajuste_manual) STORED,
    nota_ajuste         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (declaracion_id, casillero)
);

CREATE INDEX IF NOT EXISTS idx_lp_rf_103_detalle_decl ON contabilidad.lp_rf_103_detalle(declaracion_id);

-- ────────────────────────────────────────────────────────────────
-- 4. Mapeo código de retención (comprobante) → casillero (declaración)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contabilidad.lp_rf_103_codigo_map (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_retencion    TEXT NOT NULL UNIQUE,
    casillero_base      TEXT NOT NULL,
    casillero_valor     TEXT,  -- NULL cuando el código es 0% (no genera valor retenido, ej. 332/332G)
    descripcion         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ────────────────────────────────────────────────────────────────
-- 5. Log de auditoría (mismo patrón que lp_iva_104_log)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contabilidad.lp_rf_103_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    declaracion_id      UUID NOT NULL REFERENCES contabilidad.lp_rf_103(id) ON DELETE CASCADE,
    empresa_id          UUID NOT NULL REFERENCES contabilidad.lp_empresas(id) ON DELETE CASCADE,
    accion              TEXT NOT NULL,
    resultado           TEXT NOT NULL,
    mensaje             TEXT,
    archivo_nombre      TEXT,
    created_by          UUID REFERENCES auth.users,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ────────────────────────────────────────────────────────────────
-- 6. RLS — mismo criterio: membresía activa en lp_usuarios_empresa
-- ────────────────────────────────────────────────────────────────
ALTER TABLE contabilidad.lp_rf_103          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contabilidad.lp_rf_103_detalle  ENABLE ROW LEVEL SECURITY;
ALTER TABLE contabilidad.lp_rf_103_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE contabilidad.lp_rf_103_mapeo_xml ENABLE ROW LEVEL SECURITY;
ALTER TABLE contabilidad.lp_rf_103_codigo_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY lp_rf_103_miembros ON contabilidad.lp_rf_103
    FOR ALL USING (
        EXISTS (SELECT 1 FROM contabilidad.lp_usuarios_empresa ue
                WHERE ue.empresa_id = lp_rf_103.empresa_id AND ue.user_id = auth.uid() AND ue.activo = true)
    ) WITH CHECK (
        EXISTS (SELECT 1 FROM contabilidad.lp_usuarios_empresa ue
                WHERE ue.empresa_id = lp_rf_103.empresa_id AND ue.user_id = auth.uid() AND ue.activo = true)
    );

CREATE POLICY lp_rf_103_detalle_miembros ON contabilidad.lp_rf_103_detalle
    FOR ALL USING (
        EXISTS (SELECT 1 FROM contabilidad.lp_usuarios_empresa ue
                WHERE ue.empresa_id = lp_rf_103_detalle.empresa_id AND ue.user_id = auth.uid() AND ue.activo = true)
    ) WITH CHECK (
        EXISTS (SELECT 1 FROM contabilidad.lp_usuarios_empresa ue
                WHERE ue.empresa_id = lp_rf_103_detalle.empresa_id AND ue.user_id = auth.uid() AND ue.activo = true)
    );

CREATE POLICY lp_rf_103_log_miembros ON contabilidad.lp_rf_103_log
    FOR ALL USING (
        EXISTS (SELECT 1 FROM contabilidad.lp_usuarios_empresa ue
                WHERE ue.empresa_id = lp_rf_103_log.empresa_id AND ue.user_id = auth.uid() AND ue.activo = true)
    ) WITH CHECK (
        EXISTS (SELECT 1 FROM contabilidad.lp_usuarios_empresa ue
                WHERE ue.empresa_id = lp_rf_103_log.empresa_id AND ue.user_id = auth.uid() AND ue.activo = true)
    );

-- Catálogos: lectura para cualquier usuario autenticado, sin escritura vía API
CREATE POLICY lp_rf_103_mapeo_lectura ON contabilidad.lp_rf_103_mapeo_xml
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY lp_rf_103_codigo_map_lectura ON contabilidad.lp_rf_103_codigo_map
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- ────────────────────────────────────────────────────────────────
-- 7. Seed — catálogo de casilleros v2026 (solo grupo "Residentes", según alcance)
-- ────────────────────────────────────────────────────────────────
INSERT INTO contabilidad.lp_rf_103_mapeo_xml (version_form, casillero, descripcion, seccion, tipo_dato, obligatorio, orden) VALUES
('v2026','303','Honorarios profesionales — base imponible','trabajo_servicios','DECIMAL',false,10),
('v2026','353','Honorarios profesionales — valor retenido','trabajo_servicios','DECIMAL',false,11),
('v2026','3030','Servicios profesionales prestados por sociedades — base imponible','trabajo_servicios','DECIMAL',false,12),
('v2026','3530','Servicios profesionales prestados por sociedades — valor retenido','trabajo_servicios','DECIMAL',false,13),
('v2026','304','Predomina el intelecto (no relac. título profesional) — base imponible','trabajo_servicios','DECIMAL',false,14),
('v2026','354','Predomina el intelecto — valor retenido','trabajo_servicios','DECIMAL',false,15),
('v2026','307','Predomina la mano de obra — base imponible','trabajo_servicios','DECIMAL',false,16),
('v2026','357','Predomina la mano de obra — valor retenido','trabajo_servicios','DECIMAL',false,17),
('v2026','308','Imagen o renombre — base imponible','trabajo_servicios','DECIMAL',false,18),
('v2026','358','Imagen o renombre — valor retenido','trabajo_servicios','DECIMAL',false,19),
('v2026','309','Publicidad y comunicación — base imponible','trabajo_servicios','DECIMAL',false,20),
('v2026','359','Publicidad y comunicación — valor retenido','trabajo_servicios','DECIMAL',false,21),
('v2026','310','Transporte privado de pasajeros o público/privado de carga — base imponible','trabajo_servicios','DECIMAL',false,22),
('v2026','360','Transporte — valor retenido','trabajo_servicios','DECIMAL',false,23),
('v2026','311','Liquidación de compra (nivel cultural o rusticidad) — base imponible','trabajo_servicios','DECIMAL',false,24),
('v2026','361','Liquidación de compra — valor retenido','trabajo_servicios','DECIMAL',false,25),

('v2026','312','Transferencia de bienes muebles de naturaleza corporal — base imponible','bienes_servicios','DECIMAL',false,30),
('v2026','362','Transferencia de bienes muebles — valor retenido','bienes_servicios','DECIMAL',false,31),
('v2026','3120','Compras al productor (agrícola/bioacuático/forestal) — base imponible','bienes_servicios','DECIMAL',false,32),
('v2026','3620','Compras al productor — valor retenido','bienes_servicios','DECIMAL',false,33),
('v2026','3121','Compras al comercializador (agrícola/bioacuático/forestal) — base imponible','bienes_servicios','DECIMAL',false,34),
('v2026','3621','Compras al comercializador — valor retenido','bienes_servicios','DECIMAL',false,35),
('v2026','322','Seguros y reaseguros (primas y cesiones) — base imponible','bienes_servicios','DECIMAL',false,36),
('v2026','372','Seguros y reaseguros — valor retenido','bienes_servicios','DECIMAL',false,37),
('v2026','332','Pagos de bienes y servicios no sujetos a retención o 0% — base imponible','bienes_servicios','DECIMAL',false,38),
('v2026','343','Aplicables el 1% (RIMPE Emprendedores) — base imponible','bienes_servicios','DECIMAL',false,40),
('v2026','393','Aplicables el 1% — valor retenido','bienes_servicios','DECIMAL',false,41),
('v2026','344','Aplicables el 2% (energía eléctrica / tarjeta crédito-débito / minerales / botellas PET) — base imponible','bienes_servicios','DECIMAL',false,42),
('v2026','394','Aplicables el 2% — valor retenido','bienes_servicios','DECIMAL',false,43),
('v2026','3430','Construcción de obra material inmueble, urbanización, lotización — base imponible','bienes_servicios','DECIMAL',false,44),
('v2026','3450','Construcción de obra material inmueble — valor retenido','bienes_servicios','DECIMAL',false,45),

('v2026','314','Regalías, derechos de autor, marcas, patentes y similares — base imponible','regalias_comisiones','DECIMAL',false,50),
('v2026','364','Regalías, derechos de autor, marcas y patentes — valor retenido','regalias_comisiones','DECIMAL',false,51),
('v2026','3140','Comisiones a sociedades residentes y establecimientos permanentes — base imponible','regalias_comisiones','DECIMAL',false,52),
('v2026','3640','Comisiones a sociedades — valor retenido','regalias_comisiones','DECIMAL',false,53),
('v2026','319','Arrendamiento mercantil — base imponible','regalias_comisiones','DECIMAL',false,54),
('v2026','369','Arrendamiento mercantil — valor retenido','regalias_comisiones','DECIMAL',false,55),
('v2026','320','Arrendamiento de bienes inmuebles — base imponible','regalias_comisiones','DECIMAL',false,56),
('v2026','370','Arrendamiento de bienes inmuebles — valor retenido','regalias_comisiones','DECIMAL',false,57),

('v2026','323','Rendimientos financieros pagados a naturales y sociedades — base imponible','capital','DECIMAL',false,60),
('v2026','373','Rendimientos financieros — valor retenido','capital','DECIMAL',false,61),
('v2026','333','Enajenación derechos representativos de capital (cotizados en bolsa) — base imponible','capital','DECIMAL',false,62),
('v2026','383','Enajenación derechos representativos de capital (bolsa) — valor retenido','capital','DECIMAL',false,63),
('v2026','334','Contraprestación enajenación derechos representativos de capital (no cotizados) — base imponible','capital','DECIMAL',false,64),
('v2026','384','Contraprestación enajenación derechos de capital — valor retenido','capital','DECIMAL',false,65),

('v2026','399','SUBTOTAL OPERACIONES EFECTUADAS EN EL PAÍS','totales','DECIMAL',true,90),
('v2026','499','TOTAL DE RETENCIÓN DE IMPUESTO A LA RENTA','totales','DECIMAL',true,91)
ON CONFLICT (version_form, casillero) DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- 8. Seed — mapeo código de retención (facturacion.codigos_retencion, tipo FUENTE) → casillero
-- ────────────────────────────────────────────────────────────────
INSERT INTO contabilidad.lp_rf_103_codigo_map (codigo_retencion, casillero_base, casillero_valor, descripcion) VALUES
('303',  '303',  '353',  'Honorarios profesionales'),
('303A', '3030', '3530', 'Servicios profesionales prestados por sociedades residentes'),
('304',  '304',  '354',  'Predomina el intelecto'),
('304A', '304',  '354',  'Comisiones — predomina el intelecto'),
('304B', '304',  '354',  'Notarios y registradores'),
('304C', '304',  '354',  'Deportistas, entrenadores, árbitros'),
('304D', '304',  '354',  'Artistas'),
('304E', '304',  '354',  'Docencia'),
('307',  '307',  '357',  'Predomina la mano de obra'),
('308',  '308',  '358',  'Imagen o renombre'),
('309',  '309',  '359',  'Publicidad y comunicación'),
('310',  '310',  '360',  'Transporte'),
('311',  '311',  '361',  'Liquidación de compra'),
('312',  '312',  '362',  'Transferencia de bienes muebles de naturaleza corporal'),
('312A', '3120', '3620', 'Compras al productor (bioacuático/forestal/agrícola)'),
('312C', '3121', '3621', 'Compras al comercializador (bioacuático/forestal/agrícola)'),
('322',  '322',  '372',  'Seguros y reaseguros'),
('332',  '332',  NULL,   'No sujeto a retención / 0% (incluye RIMPE Negocios Populares)'),
('332G', '332',  NULL,   'Pagos con tarjeta de crédito (0%)'),
('343',  '343',  '393',  'RIMPE Emprendedores 1%'),
('343A', '344',  '394',  'Energía eléctrica'),
('343B', '3430', '3450', 'Construcción de obra material inmueble'),
('343C', '344',  '394',  'Botellas plásticas PET no retornables'),
('344A', '344',  '394',  'Tarjeta de crédito/débito reportada por la Emisora'),
('344B', '344',  '394',  'Sustancias minerales'),
('314A', '314',  '364',  'Regalías/franquicias — personas naturales'),
('314B', '314',  '364',  'Cánones/derechos de autor — personas naturales'),
('314C', '314',  '364',  'Regalías/franquicias — sociedades'),
('314D', '314',  '364',  'Cánones/derechos de autor — sociedades'),
('319',  '319',  '369',  'Arrendamiento mercantil'),
('320',  '320',  '370',  'Arrendamiento de bienes inmuebles'),
('3482', '3140', '3640', 'Comisiones a sociedades'),
('323',  '323',  '373',  'Rendimientos financieros'),
('333',  '333',  '383',  'Enajenación derechos representativos de capital (bolsa)'),
('334',  '334',  '384',  'Contraprestación enajenación derechos de capital (no bolsa)')
ON CONFLICT (codigo_retencion) DO NOTHING;
-- Nota: 601 (artesanos, 0% exento) y 721-724 (pagos al exterior) quedan
-- deliberadamente sin mapeo — no generan retención de IR en la fuente
-- doméstica o están fuera de alcance (ver nota superior).

-- ────────────────────────────────────────────────────────────────
-- 9. RPC lp_calcular_103 — mismo patrón cross-schema que lp_calcular_104 / lp_get_facturas_qi
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION contabilidad.lp_calcular_103(
    p_empresa_id UUID,
    p_año        INT,
    p_mes        INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = contabilidad, facturacion, public
AS $$
DECLARE
    v_ruc           TEXT;
    v_qi_empresa_id UUID;
    v_desde         DATE;
    v_hasta         DATE;
    v_result        JSONB := '{}'::jsonb;
    v_row           RECORD;
    v_total         DECIMAL(14,2);
BEGIN
    -- 1. Verificar acceso del usuario actual a esta empresa LedgerPro
    IF NOT EXISTS (
        SELECT 1 FROM contabilidad.lp_usuarios_empresa ue
        WHERE ue.empresa_id = p_empresa_id AND ue.user_id = auth.uid() AND ue.activo = true
    ) THEN
        RAISE EXCEPTION 'Sin acceso a esta empresa';
    END IF;

    -- 2. RUC de la empresa (LedgerPro)
    SELECT ruc INTO v_ruc FROM contabilidad.lp_empresas WHERE id = p_empresa_id;
    IF v_ruc IS NULL OR trim(v_ruc) = '' THEN
        RETURN '{}'::jsonb;
    END IF;

    -- 3. Empresa equivalente en facturacion (QuickInvoice), por RUC
    SELECT id INTO v_qi_empresa_id
    FROM facturacion.empresas
    WHERE trim(ruc) = trim(v_ruc)
    LIMIT 1;

    IF v_qi_empresa_id IS NULL THEN
        RETURN '{}'::jsonb;
    END IF;

    v_desde := make_date(p_año, p_mes, 1);
    v_hasta := (v_desde + INTERVAL '1 month' - INTERVAL '1 day')::date;

    -- 4. Sumar retenciones FUENTE del período por código, mapeadas a casillero
    FOR v_row IN
        SELECT
            m.casillero_base,
            m.casillero_valor,
            COALESCE(SUM(rc.base_imponible), 0) AS total_base,
            COALESCE(SUM(rc.valor), 0)          AS total_valor
        FROM facturacion.retenciones_compras rc
        JOIN contabilidad.lp_rf_103_codigo_map m
          ON m.codigo_retencion = rc.codigo_retencion
        WHERE rc.empresa_id = v_qi_empresa_id
          AND rc.tipo = 'FUENTE'
          AND rc.estado = 'ACTIVO'
          AND rc.fecha_emision BETWEEN v_desde AND v_hasta
        GROUP BY m.casillero_base, m.casillero_valor
    LOOP
        v_result := v_result || jsonb_build_object(
            v_row.casillero_base,
            COALESCE((v_result->>v_row.casillero_base)::decimal, 0) + v_row.total_base
        );
        IF v_row.casillero_valor IS NOT NULL THEN
            v_result := v_result || jsonb_build_object(
                v_row.casillero_valor,
                COALESCE((v_result->>v_row.casillero_valor)::decimal, 0) + v_row.total_valor
            );
        END IF;
    END LOOP;

    -- 5. Totales — 399 (subtotal país) y 499 (total IR), sin operaciones al exterior en alcance
    SELECT COALESCE(SUM(rc.valor), 0) INTO v_total
    FROM facturacion.retenciones_compras rc
    JOIN contabilidad.lp_rf_103_codigo_map m ON m.codigo_retencion = rc.codigo_retencion
    WHERE rc.empresa_id = v_qi_empresa_id
      AND rc.tipo = 'FUENTE'
      AND rc.estado = 'ACTIVO'
      AND rc.fecha_emision BETWEEN v_desde AND v_hasta;

    v_result := v_result || jsonb_build_object('399', v_total, '499', v_total);

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION contabilidad.lp_calcular_103(UUID, INT, INT) TO authenticated;
