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

// ── Catálogo SRI Ecuador — Tabla de retenciones vigente 2025-2026 ─────────────
// Fuentes: Res. NAC-DGERCGC14-00787 y actualizaciones NAC-DGERCGC20-00000077,
//          Ley Org. Simplif. Progresividad Tributaria (2019), LORTI Art. 45/48,
//          LIVA Art. 63, Res. NAC-DGERCGC15-00000284, Res. NAC-DGERCGC21-00000036
export const CODIGOS_SRI_DEFAULT: CodigoDefault[] = [

    // ── Retención en la Fuente (IR) — impuestoSRI=1 ───────────────────────────

    // Honorarios y servicios de personas naturales
    { tipo: 'FUENTE', codigo: '303', porcentaje: 10, activo: true, aplica_a: 'PERSONA_NATURAL', base_legal: 'Art. 45 LRTI',
      descripcion: 'Honorarios profesionales y demás pagos a personas naturales con título de instrucción superior',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '304', porcentaje: 2, activo: true, aplica_a: 'PERSONA_NATURAL', base_legal: 'Art. 45 LRTI',
      descripcion: 'Servicios donde predomina la mano de obra sin título de instrucción superior',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '307', porcentaje: 1, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 45 LRTI',
      descripcion: 'Servicios de construcción, urbanización, lotización y actividades similares',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '308', porcentaje: 8, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 45 LRTI',
      descripcion: 'Retención presuntiva — honorarios y comisiones a no residentes',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '309', porcentaje: 8, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 45 LRTI',
      descripcion: 'Arrendamiento de bienes inmuebles',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '310', porcentaje: 1, activo: true, aplica_a: 'PERSONA_NATURAL', base_legal: 'Art. 45 LRTI',
      descripcion: 'Seguros y reaseguros — primas y cesiones (personas naturales)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '312', porcentaje: 1, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 45 LRTI',
      descripcion: 'Transporte privado de pasajeros o servicio público o privado de carga',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '319', porcentaje: 2, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 45 LRTI',
      descripcion: 'Otros servicios no contemplados en los anteriores (persona natural no obligada)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '320', porcentaje: 2, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 45 LRTI',
      descripcion: 'Arrendamiento de bienes muebles',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '322', porcentaje: 1, activo: true, aplica_a: 'PERSONA_JURIDICA', base_legal: 'Art. 45 LRTI',
      descripcion: 'Seguros y reaseguros — primas y cesiones (personas jurídicas)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '323', porcentaje: 5, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 45 LRTI',
      descripcion: 'Regalías, derechos de autor, marcas, patentes y similares a residentes',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '325', porcentaje: 2, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 45 LRTI',
      descripcion: 'Intereses, descuentos y beneficios en títulos valores emitidos a 360 días o más',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '327', porcentaje: 1, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 45 LRTI',
      descripcion: 'Energía eléctrica',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '328', porcentaje: 1, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 45 LRTI',
      descripcion: 'Actividades de construcción de bienes inmuebles con propiedad del contratista',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },

    // Liquidaciones de compra (LC)
    { tipo: 'FUENTE', codigo: '332', porcentaje: 2, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 45 LRTI',
      descripcion: 'Por pagos a través de Liquidación de Compra — bienes (nivel cultural o rusticidad)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '340', porcentaje: 3, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 45 LRTI',
      descripcion: 'Por pagos a través de Liquidación de Compra — servicios (nivel cultural o rusticidad)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '341', porcentaje: 1, activo: true, aplica_a: 'PERSONA_NATURAL', base_legal: 'Art. 45 LRTI',
      descripcion: 'Por pagos a través de Liquidación de Compra — no obligados a llevar contabilidad (bienes)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },

    // Compra de bienes
    { tipo: 'FUENTE', codigo: '343', porcentaje: 1, activo: true, aplica_a: 'PERSONA_NATURAL', base_legal: 'Art. 45 LRTI',
      descripcion: 'Compra de bienes: agrícola, avícola, pecuario, apícola, cunícola, bioacuáticos (no obligados)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '344', porcentaje: 2, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 45 LRTI',
      descripcion: 'Compra de bienes agrícolas, avícolas, pecuarios, bioacuáticos a contribuyentes RISE',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '346', porcentaje: 1, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 45 LRTI',
      descripcion: 'Compra de bienes muebles de naturaleza corporal no contemplados en otros códigos',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '347', porcentaje: 1, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 45 LRTI',
      descripcion: 'Compra de bienes muebles corporales con tarjeta de crédito o débito',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },

    // Otras retenciones persona natural / no obligado
    { tipo: 'FUENTE', codigo: '360', porcentaje: 1, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 45 LRTI',
      descripcion: 'Otras retenciones aplicables al 1% no contempladas en los anteriores',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },

    // Persona jurídica / obligado a llevar contabilidad
    { tipo: 'FUENTE', codigo: '403', porcentaje: 1, activo: true, aplica_a: 'PERSONA_JURIDICA', base_legal: 'Art. 45 LRTI',
      descripcion: 'Compra de bienes: agrícola, avícola, pecuario, bioacuáticos (obligados a llevar contabilidad)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '404', porcentaje: 1, activo: true, aplica_a: 'PERSONA_JURIDICA', base_legal: 'Art. 45 LRTI',
      descripcion: 'Compra de bienes muebles corporales (obligados a llevar contabilidad)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '405', porcentaje: 2, activo: true, aplica_a: 'PERSONA_JURIDICA', base_legal: 'Art. 45 LRTI',
      descripcion: 'Servicios prestados por sociedades (obligadas a llevar contabilidad)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '406', porcentaje: 2, activo: true, aplica_a: 'PERSONA_JURIDICA', base_legal: 'Art. 45 LRTI',
      descripcion: 'Servicios prestados por personas naturales obligadas a llevar contabilidad',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '408', porcentaje: 8, activo: true, aplica_a: 'PERSONA_JURIDICA', base_legal: 'Art. 45 LRTI',
      descripcion: 'Honorarios y demás pagos a personas jurídicas o naturales obligadas',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '410', porcentaje: 1, activo: true, aplica_a: 'PERSONA_JURIDICA', base_legal: 'Art. 45 LRTI',
      descripcion: 'Seguros y reaseguros — primas y cesiones (personas jurídicas obligadas)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '499', porcentaje: 2, activo: true, aplica_a: 'PERSONA_JURIDICA', base_legal: 'Art. 45 LRTI',
      descripcion: 'Otros pagos a contribuyentes obligados a llevar contabilidad',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },

    // Ganancias de capital
    { tipo: 'FUENTE', codigo: '501', porcentaje: 10, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 45 LRTI',
      descripcion: 'Ganancias de capital en la enajenación de bienes inmuebles',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '503', porcentaje: 2, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 45 LRTI',
      descripcion: 'Ganancias en la enajenación de derechos representativos de capital (acciones)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },

    // Artesanos y no retención
    { tipo: 'FUENTE', codigo: '601', porcentaje: 0, activo: true, aplica_a: 'ARTESANO', base_legal: 'Art. 56 LRTI',
      descripcion: 'Artesanos calificados por la JNDA — no sujetos a retención en la fuente',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '699', porcentaje: 2, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 45 LRTI',
      descripcion: 'Otros pagos / contribuyentes no categorizados en los anteriores',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },

    // Pagos al exterior
    { tipo: 'FUENTE', codigo: '721', porcentaje: 0, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 48 LRTI',
      descripcion: 'Bienes no producidos en el país — sin retención de IR en la fuente',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '722', porcentaje: 0, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 48 LRTI',
      descripcion: 'Servicios del exterior — sin retención IR en la fuente (aplica retención IVA)',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '723', porcentaje: 25, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 48 LRTI',
      descripcion: 'Servicios prestados desde el exterior sin convenio de doble imposición — 25%',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },
    { tipo: 'FUENTE', codigo: '724', porcentaje: 22, activo: true, aplica_a: 'TODOS', base_legal: 'Art. 48 LRTI',
      descripcion: 'Pagos al exterior con convenio de doble imposición — 22%',
      cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null },

    // ── Retención del IVA — impuestoSRI=2 ─────────────────────────────────────
    { tipo: 'IVA', codigo: '725', porcentaje: 30, activo: true, aplica_a: 'TODOS',
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
}
