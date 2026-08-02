-- ============================================================
-- CORRECCIÓN #2 de códigos_retencion — reemplaza/corrige lo que
-- hizo 20260801b_fix_codigos_retencion_marzo2026.sql.
--
-- Esa primera migración se basó en una lectura incorrecta de la
-- resolución (asumía que el número de código ATS se mantenía igual
-- y solo cambiaba el porcentaje). Con la tabla oficial real del SRI
-- (sri.gob.ec/en/retenciones-en-la-fuente) se confirmó que VARIOS
-- códigos cambiaron de SIGNIFICADO, no solo de porcentaje — ej. el
-- 309 no es "arrendamiento de inmuebles" (eso es el 320), es
-- "medios de comunicación y publicidad". Esta migración corrige
-- eso de raíz, sobre TODAS las empresas.
--
-- NO se toca: cuenta_contable_id / cuenta_contable_codigo /
-- cuenta_contable_nombre (mapeo contable por empresa) ni el activo
-- de códigos no afectados por este cambio.
--
-- Sección IVA (códigos 725-730) — sin cambios, no tocada aquí.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Códigos que SÍ existen en la tabla real del SRI — se corrige
--    porcentaje/descripción/base_legal/aplica_a, y se reactivan por
--    si la migración anterior los había desactivado por error
--    (caso de 308 y 322, que NO debían retirarse).
-- ────────────────────────────────────────────────────────────
UPDATE facturacion.codigos_retencion cr
SET porcentaje  = v.porcentaje,
    descripcion = v.descripcion,
    base_legal  = v.base_legal,
    aplica_a    = v.aplica_a,
    activo      = true,
    updated_at  = timezone('utc', now())
FROM (VALUES
    ('303', 10::decimal,   'PERSONA_NATURAL', 'Honorarios profesionales y demás pagos por servicios relacionados con el título profesional', 'Res. NAC-DGERCGC26-00000009'),
    ('304', 10::decimal,   'PERSONA_NATURAL', 'Servicios predomina el intelecto no relacionados con el título profesional', 'Res. NAC-DGERCGC26-00000009'),
    ('307', 3::decimal,    'PERSONA_NATURAL', 'Servicios donde predomina la mano de obra', 'Res. NAC-DGERCGC26-00000009'),
    ('308', 10::decimal,   'TODOS', 'Utilización o aprovechamiento de la imagen o renombre (personas naturales, sociedades, "influencers")', 'Res. NAC-DGERCGC26-00000009'),
    ('309', 3::decimal,    'TODOS', 'Servicios prestados por medios de comunicación y agencias de publicidad', 'Res. NAC-DGERCGC26-00000009'),
    ('310', 1::decimal,    'TODOS', 'Servicio de transporte privado de pasajeros o transporte público o privado de carga', 'Res. NAC-DGERCGC26-00000009'),
    ('312', 2::decimal,    'TODOS', 'Transferencia de bienes muebles de naturaleza corporal', 'Res. NAC-DGERCGC26-00000009'),
    ('319', 2::decimal,    'PERSONA_JURIDICA', 'Cuotas de arrendamiento mercantil (prestado por sociedades), inclusive la de opción de compra', 'Res. NAC-DGERCGC26-00000009'),
    ('320', 10::decimal,   'TODOS', 'Arrendamiento de bienes inmuebles', 'Res. NAC-DGERCGC26-00000009'),
    ('322', 2::decimal,    'TODOS', 'Seguros y reaseguros (primas y cesiones)', 'Res. NAC-DGERCGC26-00000009'),
    ('323', 3::decimal,    'TODOS', 'Rendimientos financieros pagados a naturales y sociedades (no a IFIs)', 'Res. NAC-DGERCGC26-00000009'),
    ('332', 0::decimal,    'TODOS', 'Otras compras de bienes y servicios no sujetas a retención o con 0% (incluye régimen RIMPE — Negocios Populares)', 'Res. NAC-DGERCGC26-00000009'),
    ('343', 1::decimal,    'TODOS', 'Pagos aplicables el 1% (régimen RIMPE — Emprendedores, aplica con cualquier forma de pago inclusive tarjetas de crédito/débito)', 'Res. NAC-DGERCGC26-00000009'),
    ('601', 0::decimal,    'ARTESANO', 'Artesanos calificados por la JNDA — no sujetos a retención en la fuente', 'Art. 56 LRTI')
) AS v(codigo, porcentaje, aplica_a, descripcion, base_legal)
WHERE cr.tipo = 'FUENTE' AND cr.codigo = v.codigo;

-- ────────────────────────────────────────────────────────────
-- 2. Códigos que NO existen en la tabla real (algunos fueron
--    "revividos" por error en la migración anterior con un
--    significado inventado) — se desactivan definitivamente.
-- ────────────────────────────────────────────────────────────
UPDATE facturacion.codigos_retencion
SET activo = false, updated_at = timezone('utc', now())
WHERE tipo = 'FUENTE'
  AND codigo IN (
    '325','327','328','340','341','344','346','347','360',
    '403','404','405','405B','406','408','410','499','501','503','503B','699'
  );

-- ────────────────────────────────────────────────────────────
-- 3. Códigos reales del SRI que faltaban por completo — se agregan
--    a toda empresa que ya tenga el catálogo sembrado.
-- ────────────────────────────────────────────────────────────
INSERT INTO facturacion.codigos_retencion
    (empresa_id, codigo, descripcion, tipo, porcentaje, aplica_a, base_legal, activo,
     cuenta_contable_id, cuenta_contable_codigo, cuenta_contable_nombre)
SELECT e.empresa_id, v.codigo, v.descripcion, 'FUENTE', v.porcentaje, v.aplica_a,
    'Res. NAC-DGERCGC26-00000009', true, NULL, NULL, NULL
FROM (SELECT DISTINCT empresa_id FROM facturacion.codigos_retencion) e
CROSS JOIN (VALUES
    ('303A', 5::decimal,    'PERSONA_JURIDICA',  'Servicios profesionales prestados por sociedades residentes'),
    ('304A', 10::decimal,   'PERSONA_NATURAL',   'Comisiones y demás pagos por servicios predomina intelecto no relacionados con el título profesional'),
    ('304B', 10::decimal,   'TODOS',              'Pagos a notarios y registradores de la propiedad y mercantil por sus actividades ejercidas como tales'),
    ('304C', 10::decimal,   'PERSONA_NATURAL',   'Pagos a deportistas, entrenadores, árbitros, miembros del cuerpo técnico por sus actividades ejercidas como tales'),
    ('304D', 10::decimal,   'PERSONA_NATURAL',   'Pagos a artistas por sus actividades ejercidas como tales'),
    ('304E', 10::decimal,   'PERSONA_NATURAL',   'Honorarios y demás pagos por servicios de docencia'),
    ('311',  3::decimal,    'PERSONA_NATURAL',   'Pagos a través de liquidación de compra (nivel cultural o rusticidad)'),
    ('312A', 1::decimal,    'TODOS',              'Compras al productor: bienes de origen bioacuático, forestal y los descritos en el art. 27.1 LRTI'),
    ('312C', 1.75::decimal, 'TODOS',              'Compras al comercializador: bienes de origen bioacuático, forestal y los descritos en el art. 27.1 LRTI'),
    ('332G', 0::decimal,    'TODOS',              'Pagos con tarjeta de crédito'),
    ('343A', 2::decimal,    'TODOS',              'Energía eléctrica'),
    ('343B', 2::decimal,    'TODOS',              'Actividades de construcción de obra material inmueble, urbanización, lotización o actividades similares'),
    ('343C', 2::decimal,    'TODOS',              'Recepción de botellas plásticas no retornables de PET'),
    ('344A', 2::decimal,    'TODOS',              'Pago local con tarjeta de crédito/débito reportado por la Emisora / entidades del Sistema Financiero'),
    ('344B', 2::decimal,    'TODOS',              'Adquisición de sustancias minerales dentro del territorio nacional'),
    ('314A', 10::decimal,   'PERSONA_NATURAL',   'Regalías por concepto de franquicias de acuerdo al Código INGENIOS (COESCCI) — pago a personas naturales'),
    ('314B', 10::decimal,   'PERSONA_NATURAL',   'Cánones, derechos de autor, marcas, patentes y similares de acuerdo al Código INGENIOS (COESCCI) — pago a personas naturales'),
    ('314C', 10::decimal,   'PERSONA_JURIDICA',  'Regalías por concepto de franquicias de acuerdo al Código INGENIOS (COESCCI) — pago a sociedades'),
    ('314D', 10::decimal,   'PERSONA_JURIDICA',  'Cánones, derechos de autor, marcas, patentes y similares de acuerdo al Código INGENIOS (COESCCI) — pago a sociedades'),
    ('3482', 5::decimal,    'PERSONA_JURIDICA',  'Comisiones a sociedades, nacionales o extranjeras residentes y establecimientos permanentes domiciliados en el país'),
    ('333',  10::decimal,   'TODOS',              'Ganancia en la enajenación de derechos representativos de capital u otros derechos'),
    ('334',  2::decimal,    'TODOS',              'Contraprestación producida por la enajenación de derechos representativos de capital u otros derechos')
) AS v(codigo, porcentaje, aplica_a, descripcion)
WHERE NOT EXISTS (
    SELECT 1 FROM facturacion.codigos_retencion cr2
    WHERE cr2.empresa_id = e.empresa_id AND cr2.codigo = v.codigo AND cr2.tipo = 'FUENTE'
)
ON CONFLICT (empresa_id, codigo, tipo) DO NOTHING;
