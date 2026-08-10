import { supabase } from '../lib/supabase'

export type TipoRetencionCodigo = 'FUENTE' | 'IVA'
export type AplicaA = 'TODOS' | 'PERSONA_NATURAL' | 'PERSONA_JURIDICA' | 'ARTESANO'

export interface CodigoRetencion {
    id: string
    empresa_id: string
    codigo: string
    descripcion: string
    tipo: TipoRetencionCodigo
    porcentaje: number
    aplica_a: AplicaA | null
    base_legal: string | null
    activo: boolean
    cuenta_contable_id: string | null
    cuenta_contable_codigo: string | null
    cuenta_contable_nombre: string | null
    created_at?: string
    updated_at?: string
}

type CodigoDefault = Omit<CodigoRetencion, 'id' | 'empresa_id' | 'created_at' | 'updated_at'>

export type CampoComparable = 'porcentaje' | 'descripcion' | 'base_legal' | 'aplica_a'

export interface DiffCodigoRetencion {
    id: string
    codigo: string
    tipo: TipoRetencionCodigo
    campos: Array<{ campo: CampoComparable; actual: string | number | null; nuevo: string | number | null }>
}

export interface ComparacionCatalogo {
    cambios: DiffCodigoRetencion[]          // codigo+tipo existe en ambos lados pero con valores distintos
    noEnCatalogoVigente: CodigoRetencion[]  // existe en la empresa pero ya no está en CODIGOS_SRI_DEFAULT — no se toca, solo se informa
}

// ── Catálogo SRI Ecuador — Tabla de retenciones vigente desde 2026-03-01 ──────
// Fuente: tabla oficial descargada de sri.gob.ec/en/retenciones-en-la-fuente
// ("Detalle de porcentajes de retención en la fuente de impuesto a la renta"),
// que ya incorpora la Resolución NAC-DGERCGC26-00000009 (SRI, vigente desde
// 01-mar-2026). Códigos verificados 1:1 contra esa tabla — NO se heredaron
// códigos de versiones anteriores de este archivo, varios estaban mal
// asignados (ej. el 309 no es arrendamiento de inmuebles, es medios de
// comunicación/publicidad — el correcto para arrendamiento es 320).
// Alcance: solo "domésticos" (compras/servicios a proveedores locales) —
// no incluye pagos a no residentes, dividendos, loterías, banano/combustibles
// ni subcódigos bancarios muy específicos (rendimientos financieros entre
// IFIs) — fuera del uso típico de compras de una empresa en QuickInvoice.
// Sección IVA (impuestoSRI=2) sin cambios — no cubierta por esta tabla.
export const CODIGOS_SRI_DEFAULT: CodigoDefault[] = [

    // ── Retención en la Fuente (IR) — impuestoSRI=1 ───────────────────────────
    // Grupo 1 — Derivadas del trabajo (honorarios / servicios personas naturales)
    { tipo: 'FUENTE', codigo: '303', porcentaje: 10, activo: true, aplica_a: 'PERSONA_NATURAL',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Honorarios profesionales y demás pagos por servicios relacionados con el título profesional',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '303A', porcentaje: 5, activo: true, aplica_a: 'PERSONA_JURIDICA',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Servicios profesionales prestados por sociedades residentes',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '304', porcentaje: 10, activo: true, aplica_a: 'PERSONA_NATURAL',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Servicios predomina el intelecto no relacionados con el título profesional',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '304A', porcentaje: 10, activo: true, aplica_a: 'PERSONA_NATURAL',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Comisiones y demás pagos por servicios predomina intelecto no relacionados con el título profesional',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '304B', porcentaje: 10, activo: true, aplica_a: 'TODOS',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Pagos a notarios y registradores de la propiedad y mercantil por sus actividades ejercidas como tales',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '304C', porcentaje: 10, activo: true, aplica_a: 'PERSONA_NATURAL',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Pagos a deportistas, entrenadores, árbitros, miembros del cuerpo técnico por sus actividades ejercidas como tales',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '304D', porcentaje: 10, activo: true, aplica_a: 'PERSONA_NATURAL',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Pagos a artistas por sus actividades ejercidas como tales',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '304E', porcentaje: 10, activo: true, aplica_a: 'PERSONA_NATURAL',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Honorarios y demás pagos por servicios de docencia',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '307', porcentaje: 3, activo: true, aplica_a: 'PERSONA_NATURAL',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Servicios donde predomina la mano de obra',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '308', porcentaje: 10, activo: true, aplica_a: 'TODOS',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Utilización o aprovechamiento de la imagen o renombre (personas naturales, sociedades, "influencers")',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '309', porcentaje: 3, activo: true, aplica_a: 'TODOS',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Servicios prestados por medios de comunicación y agencias de publicidad',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '310', porcentaje: 1, activo: true, aplica_a: 'TODOS',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Servicio de transporte privado de pasajeros o transporte público o privado de carga',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '311', porcentaje: 3, activo: true, aplica_a: 'PERSONA_NATURAL',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Pagos a través de liquidación de compra (nivel cultural o rusticidad)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },

    // Grupo 2 — Por bienes y servicios
    { tipo: 'FUENTE', codigo: '312', porcentaje: 2, activo: true, aplica_a: 'TODOS',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Transferencia de bienes muebles de naturaleza corporal',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '312A', porcentaje: 1, activo: true, aplica_a: 'TODOS',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Compras al productor: bienes de origen bioacuático, forestal y los descritos en el art. 27.1 LRTI',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '312C', porcentaje: 1.75, activo: true, aplica_a: 'TODOS',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Compras al comercializador: bienes de origen bioacuático, forestal y los descritos en el art. 27.1 LRTI',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '322', porcentaje: 2, activo: true, aplica_a: 'TODOS',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Seguros y reaseguros (primas y cesiones)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '332', porcentaje: 0, activo: true, aplica_a: 'TODOS',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Otras compras de bienes y servicios no sujetas a retención o con 0% (incluye régimen RIMPE — Negocios Populares)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '332G', porcentaje: 0, activo: true, aplica_a: 'TODOS',
      base_legal: 'LRTI / RLRTI',
      descripcion: 'Pagos con tarjeta de crédito',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '343', porcentaje: 1, activo: true, aplica_a: 'TODOS',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Pagos aplicables el 1% (régimen RIMPE — Emprendedores, aplica con cualquier forma de pago inclusive tarjetas de crédito/débito)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '343A', porcentaje: 2, activo: true, aplica_a: 'TODOS',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Energía eléctrica',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '343B', porcentaje: 2, activo: true, aplica_a: 'TODOS',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Actividades de construcción de obra material inmueble, urbanización, lotización o actividades similares',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '343C', porcentaje: 2, activo: true, aplica_a: 'TODOS',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Recepción de botellas plásticas no retornables de PET',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '344A', porcentaje: 2, activo: true, aplica_a: 'TODOS',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Pago local con tarjeta de crédito/débito reportado por la Emisora / entidades del Sistema Financiero',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '344B', porcentaje: 2, activo: true, aplica_a: 'TODOS',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Adquisición de sustancias minerales dentro del territorio nacional',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },

    // Grupo 3 — Por regalías, cánones y arrendamiento
    { tipo: 'FUENTE', codigo: '314A', porcentaje: 10, activo: true, aplica_a: 'PERSONA_NATURAL',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Regalías por concepto de franquicias de acuerdo al Código INGENIOS (COESCCI) — pago a personas naturales',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '314B', porcentaje: 10, activo: true, aplica_a: 'PERSONA_NATURAL',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Cánones, derechos de autor, marcas, patentes y similares de acuerdo al Código INGENIOS (COESCCI) — pago a personas naturales',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '314C', porcentaje: 10, activo: true, aplica_a: 'PERSONA_JURIDICA',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Regalías por concepto de franquicias de acuerdo al Código INGENIOS (COESCCI) — pago a sociedades',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '314D', porcentaje: 10, activo: true, aplica_a: 'PERSONA_JURIDICA',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Cánones, derechos de autor, marcas, patentes y similares de acuerdo al Código INGENIOS (COESCCI) — pago a sociedades',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '319', porcentaje: 2, activo: true, aplica_a: 'PERSONA_JURIDICA',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Cuotas de arrendamiento mercantil (prestado por sociedades), inclusive la de opción de compra',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '320', porcentaje: 10, activo: true, aplica_a: 'TODOS',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Arrendamiento de bienes inmuebles',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '3482', porcentaje: 5, activo: true, aplica_a: 'PERSONA_JURIDICA',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Comisiones a sociedades, nacionales o extranjeras residentes y establecimientos permanentes domiciliados en el país',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },

    // Grupo 4 — Relacionadas con el capital (subconjunto de uso frecuente en compras/servicios)
    { tipo: 'FUENTE', codigo: '323', porcentaje: 3, activo: true, aplica_a: 'TODOS',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Rendimientos financieros pagados a naturales y sociedades (no a IFIs)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '333', porcentaje: 10, activo: true, aplica_a: 'TODOS',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Ganancia en la enajenación de derechos representativos de capital u otros derechos',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '334', porcentaje: 2, activo: true, aplica_a: 'TODOS',
      base_legal: 'Res. NAC-DGERCGC26-00000009',
      descripcion: 'Contraprestación producida por la enajenación de derechos representativos de capital u otros derechos',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },

    // Artesanos — no cubierto por esta resolución específica, se mantiene la exención de LRTI
    { tipo: 'FUENTE', codigo: '601', porcentaje: 0, activo: true, aplica_a: 'ARTESANO', base_legal: 'Art. 56 LRTI',
      descripcion: 'Artesanos calificados por la JNDA — no sujetos a retención en la fuente',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },

    // Pagos al exterior / no residentes — FUERA DE ALCANCE de esta actualización.
    // El Art. 4 de la Res. NAC-DGERCGC26-00000009 los rige por la tarifa general
    // de sociedades (no un % fijo simple como el resto de esta tabla), así que se
    // dejan como estaban — requieren revisión aparte con el contador.
    { tipo: 'FUENTE', codigo: '721', porcentaje: 0, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 48 LRTI',
      descripcion: 'Bienes no producidos en el país — sin retención de IR en la fuente',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '722', porcentaje: 0, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 48 LRTI',
      descripcion: 'Servicios del exterior — sin retención IR en la fuente (aplica retención IVA)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '723', porcentaje: 25, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 48 LRTI',
      descripcion: 'Servicios prestados desde el exterior sin convenio de doble imposición — 25% (verificar tarifa general de sociedades vigente)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '724', porcentaje: 22, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 48 LRTI',
      descripcion: 'Pagos al exterior con convenio de doble imposición — 22% (verificar tarifa vigente)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },

    // ── Retención del IVA — impuestoSRI=2 ─────────────────────────────────────
    // Código real confirmado por autorización SRI en producción el 2026-08-10
    // (comprobante ConHierro/PINO ARISTATA: con codigoRetencion=725 el SRI
    // rechazó "no existe o no está vigente"; con codigoRetencion=1 autorizó).
    // Los demás códigos IVA de esta tabla (726-730) NO están verificados así
    // — no tocarlos sin la misma prueba.
    { tipo: 'IVA', codigo: '1', porcentaje: 30, activo: true, aplica_a: 'TODOS',
      base_legal: 'Art. 63 LIVA / Res. NAC-DGERCGC15-00000284',
      descripcion: 'Retención IVA 30% — compra de bienes (agentes de retención sector privado)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'IVA', codigo: '726', porcentaje: 70, activo: true, aplica_a: 'TODOS',
      base_legal: 'Art. 63 LIVA / Res. NAC-DGERCGC15-00000284',
      descripcion: 'Retención IVA 70% — prestación de servicios (agentes de retención sector privado)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'IVA', codigo: '727', porcentaje: 100, activo: true, aplica_a: 'PERSONA_NATURAL',
      base_legal: 'Art. 63 LIVA',
      descripcion: 'Retención IVA 100% — servicios profesionales y Liquidaciones de Compra',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'IVA', codigo: '728', porcentaje: 100, activo: true, aplica_a: 'TODOS',
      base_legal: 'Art. 63 LIVA / Res. NAC-DGERCGC21-00000036',
      descripcion: 'Retención IVA 100% — entidades y organismos del sector público (como agentes de retención)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'IVA', codigo: '729', porcentaje: 100, activo: true, aplica_a: 'TODOS',
      base_legal: 'Art. 63 LIVA',
      descripcion: 'Retención IVA 100% — importaciones de servicios del exterior',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'IVA', codigo: '730', porcentaje: 100, activo: true, aplica_a: 'TODOS',
      base_legal: 'Art. 63 LIVA',
      descripcion: 'Retención IVA 100% — pagos al exterior por servicios digitales gravados con IVA',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
]

export const codigoRetencionService = {

    async listar(empresaId: string): Promise<CodigoRetencion[]> {
        const { data, error } = await supabase
            .from('codigos_retencion')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('tipo')
            .order('codigo')
        if (error) throw error
        return data as CodigoRetencion[]
    },

    async crear(record: Omit<CodigoRetencion, 'id' | 'created_at' | 'updated_at'>): Promise<CodigoRetencion> {
        const { data, error } = await supabase
            .from('codigos_retencion')
            .insert(record)
            .select()
            .single()
        if (error) throw error
        return data as CodigoRetencion
    },

    async actualizar(id: string, cambios: Partial<CodigoRetencion>): Promise<void> {
        const { error } = await supabase
            .from('codigos_retencion')
            .update(cambios)
            .eq('id', id)
        if (error) throw error
    },

    async toggleActivo(id: string, activo: boolean): Promise<void> {
        const { error } = await supabase
            .from('codigos_retencion')
            .update({ activo })
            .eq('id', id)
        if (error) throw error
    },

    async contarCodigos(empresaId: string): Promise<number> {
        const { count } = await supabase
            .from('codigos_retencion')
            .select('id', { count: 'exact', head: true })
            .eq('empresa_id', empresaId)
        return count ?? 0
    },

    async sembrarDefaults(empresaId: string): Promise<{ insertados: number }> {
        // Solo inserta códigos que NO existan — jamás actualiza registros existentes.
        // Las actualizaciones de porcentajes/descripciones del SRI se hacen
        // manualmente desde la UI (botón Editar de cada código).
        const registros = CODIGOS_SRI_DEFAULT.map(c => ({ ...c, empresa_id: empresaId }))
        const { error } = await supabase
            .from('codigos_retencion')
            .upsert(registros, { onConflict: 'empresa_id,codigo,tipo', ignoreDuplicates: true })
        if (error) throw error
        // Retorna cuántos quedaron en total para que la UI pueda informar
        const total = await codigoRetencionService.contarCodigos(empresaId)
        return { insertados: total }
    },

    // Compara el catálogo ya cargado de la empresa contra CODIGOS_SRI_DEFAULT
    // (matched por codigo+tipo). Solo mira porcentaje/descripcion/base_legal/
    // aplica_a — nunca cuenta_contable_* (eso lo asigna el usuario a mano y
    // no debe perderse al actualizar). Los códigos que la empresa tiene pero
    // que ya no están en la tabla vigente se listan aparte, sin tocarlos.
    async compararConDefaults(empresaId: string): Promise<ComparacionCatalogo> {
        const existentes = await codigoRetencionService.listar(empresaId)
        const cambios: DiffCodigoRetencion[] = []
        const noEnCatalogoVigente: CodigoRetencion[] = []

        for (const actual of existentes) {
            const def = CODIGOS_SRI_DEFAULT.find(d => d.codigo === actual.codigo && d.tipo === actual.tipo)
            if (!def) {
                noEnCatalogoVigente.push(actual)
                continue
            }
            const campos: DiffCodigoRetencion['campos'] = []
            if (actual.porcentaje !== def.porcentaje)
                campos.push({ campo: 'porcentaje', actual: actual.porcentaje, nuevo: def.porcentaje })
            if (actual.descripcion !== def.descripcion)
                campos.push({ campo: 'descripcion', actual: actual.descripcion, nuevo: def.descripcion })
            if ((actual.base_legal ?? null) !== (def.base_legal ?? null))
                campos.push({ campo: 'base_legal', actual: actual.base_legal, nuevo: def.base_legal })
            if ((actual.aplica_a ?? 'TODOS') !== (def.aplica_a ?? 'TODOS'))
                campos.push({ campo: 'aplica_a', actual: actual.aplica_a, nuevo: def.aplica_a })

            if (campos.length > 0) {
                cambios.push({ id: actual.id, codigo: actual.codigo, tipo: actual.tipo, campos })
            }
        }

        return { cambios, noEnCatalogoVigente }
    },

    // Aplica únicamente los campos diferentes detectados por compararConDefaults.
    // No toca cuenta_contable_id/codigo/nombre ni activo.
    async actualizarDesdeDefaults(cambios: DiffCodigoRetencion[]): Promise<void> {
        for (const cambio of cambios) {
            const def = CODIGOS_SRI_DEFAULT.find(d => d.codigo === cambio.codigo && d.tipo === cambio.tipo)
            if (!def) continue
            const { error } = await supabase
                .from('codigos_retencion')
                .update({
                    porcentaje: def.porcentaje,
                    descripcion: def.descripcion,
                    base_legal: def.base_legal,
                    aplica_a: def.aplica_a,
                })
                .eq('id', cambio.id)
            if (error) throw error
        }
    },
}
