import { supabase } from '../../lib/supabase'
import type { ConceptoNomina } from '../../types/nominas'

const nominas = () => supabase.schema('nominas')

const CONCEPTOS_ESTANDAR: Omit<ConceptoNomina, 'id' | 'empresa_id' | 'created_at' | 'updated_at'>[] = [
    { codigo: 'SUELDO',              nombre: 'Sueldo Base',                          tipo: 'ingreso',   formula: 'calculado',         valor_predeterminado: null,  afecta_iess: true,  afecta_renta: true,  es_legal: true,  aplica_siempre: true,  orden: 1,  activo: true },
    { codigo: 'HRS_EXTRA_50',        nombre: 'Horas Extra Suplementarias (50%)',     tipo: 'ingreso',   formula: 'porcentaje_sueldo',  valor_predeterminado: 50,   afecta_iess: true,  afecta_renta: true,  es_legal: false, aplica_siempre: false, orden: 10, activo: true },
    { codigo: 'HRS_EXTRA_100',       nombre: 'Horas Extra Extraordinarias (100%)',   tipo: 'ingreso',   formula: 'porcentaje_sueldo',  valor_predeterminado: 100,  afecta_iess: true,  afecta_renta: true,  es_legal: false, aplica_siempre: false, orden: 11, activo: true },
    { codigo: 'DEC3_MENS',           nombre: 'Décimo Tercero Mensualizado',          tipo: 'ingreso',   formula: 'calculado',         valor_predeterminado: null,  afecta_iess: false, afecta_renta: false, es_legal: true,  aplica_siempre: false, orden: 20, activo: true },
    { codigo: 'DEC4_MENS',           nombre: 'Décimo Cuarto Mensualizado (SBU/12)', tipo: 'ingreso',   formula: 'porcentaje_sbu',     valor_predeterminado: null,  afecta_iess: false, afecta_renta: false, es_legal: true,  aplica_siempre: false, orden: 21, activo: true },
    { codigo: 'FONDO_RES',           nombre: 'Fondo de Reserva Mensual (8.33%)',    tipo: 'ingreso',   formula: 'porcentaje_sueldo',  valor_predeterminado: 8.33, afecta_iess: false, afecta_renta: false, es_legal: true,  aplica_siempre: false, orden: 22, activo: true },
    { codigo: 'IESS_PERS',           nombre: 'Aporte Personal IESS (9.45%)',        tipo: 'descuento', formula: 'calculado',         valor_predeterminado: null,  afecta_iess: false, afecta_renta: false, es_legal: true,  aplica_siempre: true,  orden: 50, activo: true },
    { codigo: 'PRESTAMO_EMP',        nombre: 'Préstamo a la Empresa',               tipo: 'descuento', formula: 'fijo',              valor_predeterminado: null,  afecta_iess: false, afecta_renta: false, es_legal: false, aplica_siempre: false, orden: 60, activo: true },
    { codigo: 'PRESTAMO_FORANEO',    nombre: 'Préstamo Foráneo / Comisariato',      tipo: 'descuento', formula: 'fijo',              valor_predeterminado: null,  afecta_iess: false, afecta_renta: false, es_legal: false, aplica_siempre: false, orden: 61, activo: true },
    { codigo: 'PRESTAMO_IESS_QUIRO', nombre: 'Préstamo IESS Quirografario',         tipo: 'descuento', formula: 'fijo',              valor_predeterminado: null,  afecta_iess: false, afecta_renta: false, es_legal: false, aplica_siempre: false, orden: 62, activo: true },
    { codigo: 'PRESTAMO_IESS_HIPO',  nombre: 'Préstamo IESS Hipotecario',           tipo: 'descuento', formula: 'fijo',              valor_predeterminado: null,  afecta_iess: false, afecta_renta: false, es_legal: false, aplica_siempre: false, orden: 63, activo: true },
    { codigo: 'DESCUENTO_VAR',       nombre: 'Descuento / Multa Variable',          tipo: 'descuento', formula: 'fijo',              valor_predeterminado: null,  afecta_iess: false, afecta_renta: false, es_legal: false, aplica_siempre: false, orden: 70, activo: true },
]

export const conceptosNominaService = {

    async listarConceptos(empresaId: string): Promise<ConceptoNomina[]> {
        const { data, error } = await nominas()
            .from('conceptos')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .order('orden')
        if (error) throw error
        return data as ConceptoNomina[]
    },

    async listarConceptosTodos(empresaId: string): Promise<ConceptoNomina[]> {
        const { data, error } = await nominas()
            .from('conceptos')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('orden')
        if (error) throw error
        return data as ConceptoNomina[]
    },

    async crearConcepto(concepto: Omit<ConceptoNomina, 'id' | 'created_at' | 'updated_at' | 'activo'>): Promise<ConceptoNomina> {
        const { data, error } = await nominas()
            .from('conceptos')
            .insert(concepto)
            .select()
            .single()
        if (error) throw error
        return data as ConceptoNomina
    },

    async actualizarConcepto(id: string, campos: Partial<ConceptoNomina>): Promise<ConceptoNomina> {
        const { data, error } = await nominas()
            .from('conceptos')
            .update(campos)
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as ConceptoNomina
    },

    async desactivarConcepto(id: string): Promise<void> {
        const { error } = await nominas()
            .from('conceptos')
            .update({ activo: false })
            .eq('id', id)
        if (error) throw error
    },

    async sembrarEstandares(empresaId: string): Promise<void> {
        const filas = CONCEPTOS_ESTANDAR.map(c => ({ ...c, empresa_id: empresaId }))
        const { error } = await nominas()
            .from('conceptos')
            .insert(filas)
        if (error) throw error
    },
}
