-- ============================================================
-- Corrige la tabla de códigos de retención en la fuente (IR) en
-- TODAS las empresas, para reflejar la Resolución NAC-DGERCGC26-
-- 00000009 del SRI (vigente desde 01-mar-2026). Mismo patrón que
-- 20260715_fix_codigos_retencion_340.sql (UPDATE sin filtro por
-- empresa_id, porque codigos_retencion hoy es una copia idéntica
-- por empresa del mismo catálogo nacional).
--
-- NO se toca: cuenta_contable_id / cuenta_contable_codigo /
-- cuenta_contable_nombre (mapeo contable, es legítimamente
-- distinto por empresa) ni el "activo" de códigos que NO fueron
-- retirados por la resolución (si una empresa lo había desactivado
-- a mano, se respeta esa decisión).
--
-- Sección IVA (códigos 725-730) — sin cambios, no tocada aquí.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Códigos que se mantienen pero cambian de porcentaje/descripción
-- ────────────────────────────────────────────────────────────
UPDATE facturacion.codigos_retencion cr
SET porcentaje  = v.porcentaje,
    descripcion = v.descripcion,
    base_legal  = v.base_legal,
    aplica_a    = v.aplica_a,
    updated_at  = timezone('utc', now())
FROM (VALUES
    ('303', 10::decimal,   'PERSONA_NATURAL', 'Honorarios, comisiones y demás pagos a personas naturales donde prevalezca el intelecto sobre la mano de obra (con o sin título profesional — unificado, antes eran 2 códigos distintos)', 'Res. NAC-DGERCGC26-00000009, num. 7.a'),
    ('304', 3::decimal,    'PERSONA_NATURAL', 'Servicios donde predomina la mano de obra sobre el factor intelectual', 'Res. NAC-DGERCGC26-00000009, num. 5.a'),
    ('307', 2::decimal,    'TODOS', 'Construcción de obra material inmueble, urbanización, lotización y actividades similares', 'Res. NAC-DGERCGC26-00000009, num. 4.h'),
    ('309', 10::decimal,   'TODOS', 'Arrendamiento de bienes inmuebles', 'Res. NAC-DGERCGC26-00000009, num. 7.g'),
    ('310', 2::decimal,    'TODOS', 'Seguros y reaseguros — primas y cesiones (unificado PN/PJ, antes 2 códigos distintos)', 'Res. NAC-DGERCGC26-00000009, num. 4.c'),
    ('312', 1::decimal,    'TODOS', 'Transporte privado de pasajeros o transporte público/privado de carga', 'Res. NAC-DGERCGC26-00000009, num. 2.a'),
    ('319', 3::decimal,    'TODOS', 'Pagos no contemplados en un porcentaje específico — retención general (catch-all, unifica varios códigos "otros" previos)', 'Res. NAC-DGERCGC26-00000009, Art. 3'),
    ('320', 2::decimal,    'TODOS', 'Arrendamiento mercantil (leasing) — cuotas, inclusive la de opción de compra', 'Res. NAC-DGERCGC26-00000009, num. 4.g'),
    ('323', 10::decimal,   'TODOS', 'Cánones, regalías, derechos de autor, marcas, patentes y similares (propiedad intelectual)', 'Res. NAC-DGERCGC26-00000009, num. 7.e'),
    ('325', 3::decimal,    'TODOS', 'Intereses, descuentos y rendimientos financieros (préstamos, cuentas corrientes, depósitos a plazo, certificados de inversión, avales, fianzas, etc.)', 'Res. NAC-DGERCGC26-00000009, num. 5.d'),
    ('327', 2::decimal,    'TODOS', 'Energía eléctrica', 'Res. NAC-DGERCGC26-00000009, num. 4.a'),
    ('332', 3::decimal,    'PERSONA_NATURAL', 'Pagos mediante Liquidación de Compra de bienes y/o servicios a personas naturales no obligadas a llevar contabilidad, no inscritas en RUC o con RUC suspendido (nivel cultural o rusticidad)', 'Res. NAC-DGERCGC26-00000009, num. 5.f'),
    ('343', 1::decimal,    'TODOS', 'Compra de bienes agrícola, avícola, pecuario, apícola, cunícola, bioacuático, forestal y carnes en estado natural, directo al productor', 'Res. NAC-DGERCGC26-00000009, num. 2.b'),
    ('344', 1.75::decimal, 'TODOS', 'Compra de bienes agrícola/avícola/pecuario/bioacuático/forestal en estado natural a comercializadores (no productores)', 'Res. NAC-DGERCGC26-00000009, num. 3.a'),
    ('346', 2::decimal,    'TODOS', 'Adquisición de bienes muebles de naturaleza corporal', 'Res. NAC-DGERCGC26-00000009, num. 4.i'),
    ('347', 2::decimal,    'TODOS', 'Pagos con tarjeta de crédito/débito a establecimientos afiliados', 'Res. NAC-DGERCGC26-00000009, num. 4.b'),
    ('405', 5::decimal,    'PERSONA_JURIDICA', 'Servicios profesionales prestados por sociedades residentes (requieren profesional titulado)', 'Res. NAC-DGERCGC26-00000009, num. 6.a'),
    ('503', 2::decimal,    'TODOS', 'Ganancias en enajenación de derechos representativos de capital NO cotizados en bolsa de valores del Ecuador', 'Res. NAC-DGERCGC26-00000009, num. 4.d'),
    ('601', 0::decimal,    'ARTESANO', 'Artesanos calificados por la JNDA — no sujetos a retención en la fuente', 'Art. 56 LRTI')
) AS v(codigo, porcentaje, aplica_a, descripcion, base_legal)
WHERE cr.tipo = 'FUENTE' AND cr.codigo = v.codigo;

-- ────────────────────────────────────────────────────────────
-- 2. Códigos retirados por la resolución (absorbidos por otro
--    código) — se desactivan, NO se borran (evita romper cualquier
--    referencia histórica en retenciones_compras/retenciones_ventas,
--    que guardan el código como texto).
-- ────────────────────────────────────────────────────────────
UPDATE facturacion.codigos_retencion
SET activo = false, updated_at = timezone('utc', now())
WHERE tipo = 'FUENTE'
  AND codigo IN ('308','322','328','340','341','360','403','404','406','408','410','499','501','699');

-- ────────────────────────────────────────────────────────────
-- 3. Códigos nuevos (creados por la resolución) — se agregan a
--    toda empresa que ya tenga el catálogo sembrado y no los
--    tenga todavía. Código ATS provisional (ver comentario en
--    codigoRetencionService.ts) hasta que el SRI publique la
--    Ficha Técnica con el número oficial.
-- ────────────────────────────────────────────────────────────
INSERT INTO facturacion.codigos_retencion
    (empresa_id, codigo, descripcion, tipo, porcentaje, aplica_a, base_legal, activo,
     cuenta_contable_id, cuenta_contable_codigo, cuenta_contable_nombre)
SELECT DISTINCT empresa_id, '405B',
    'Comisiones pagadas a sociedades residentes en Ecuador',
    'FUENTE', 5, 'PERSONA_JURIDICA',
    'Res. NAC-DGERCGC26-00000009, num. 6.b (código provisional, verificar)',
    true, NULL, NULL, NULL
FROM facturacion.codigos_retencion
ON CONFLICT (empresa_id, codigo, tipo) DO NOTHING;

INSERT INTO facturacion.codigos_retencion
    (empresa_id, codigo, descripcion, tipo, porcentaje, aplica_a, base_legal, activo,
     cuenta_contable_id, cuenta_contable_codigo, cuenta_contable_nombre)
SELECT DISTINCT empresa_id, '503B',
    'Ganancias en enajenación de derechos representativos de capital SÍ cotizados en bolsa de valores del Ecuador',
    'FUENTE', 10, 'TODOS',
    'Res. NAC-DGERCGC26-00000009, num. 7.f (código provisional, verificar)',
    true, NULL, NULL, NULL
FROM facturacion.codigos_retencion
ON CONFLICT (empresa_id, codigo, tipo) DO NOTHING;
