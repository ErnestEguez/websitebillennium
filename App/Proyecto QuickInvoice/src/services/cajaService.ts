import { supabase } from '../lib/supabase';

export interface CajaSesion {
    id: string;
    empresa_id: string;
    usuario_id: string;
    fecha_apertura: string;
    fecha_cierre: string | null;
    base_inicial: number;
    total_efectivo: number;
    total_tarjetas: number;
    total_transferencia: number;
    total_otros: number;
    total_propina: number;
    estado: 'abierta' | 'cerrada';
}

export interface ResumenCierre {
    total_efectivo: number;
    total_tarjetas: number;
    total_transferencia: number;
    total_otros: number;
    total_propina: number;
}

export const cajaService = {
    /**
     * Verifica si hay una caja abierta en la empresa.
     * Retorna la sesión activa si existe.
     */
    async getCajaAbierta(empresaId: string): Promise<CajaSesion | null> {
        const { data, error } = await supabase
            .from('caja_sesiones')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('estado', 'abierta')
            .maybeSingle();

        if (error) {
            console.error('Error al obtener caja abierta:', error);
            throw error;
        }

        return data;
    },

    /**
     * Abre una nueva caja para el usuario actual.
     */
    async abrirCaja(empresaId: string, usuarioId: string, baseInicial: number = 0): Promise<CajaSesion> {
        // Doble verificación por seguridad
        const abierta = await this.getCajaAbierta(empresaId);
        if (abierta) {
            throw new Error('Ya existe una caja abierta en esta empresa.');
        }

        const { data, error } = await supabase
            .from('caja_sesiones')
            .insert({
                empresa_id: empresaId,
                usuario_id: usuarioId,
                base_inicial: baseInicial,
                estado: 'abierta',
                fecha_apertura: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Obtiene los totales calculados de las facturas de la sesión actual.
     * Esto se usa para pre-llenar el cierre o para validar.
     */
    async calcularTotalesSesion(sesionId: string): Promise<ResumenCierre> {
        const { data: comprobantes, error } = await supabase
            .from('comprobantes')
            .select('total, comprobante_pagos(metodo_pago, valor)')
            .eq('caja_sesion_id', sesionId);

        if (error) throw error;

        const totales: ResumenCierre = {
            total_efectivo: 0,
            total_tarjetas: 0,
            total_transferencia: 0,
            total_otros: 0,
            total_propina: 0
        };

        if (!comprobantes || comprobantes.length === 0) return totales;

        console.log(`[Cierre] ${comprobantes.length} comprobante(s) en sesión ${sesionId}`);

        comprobantes.forEach(comp => {
            (comp.comprobante_pagos as any[])?.forEach((pago: any) => {
                const valor = Number(pago.valor) || 0;
                const metodo = (pago.metodo_pago || '').toLowerCase();

                if (metodo === 'efectivo') {
                    totales.total_efectivo += valor;
                } else if (metodo === 'tarjeta' || metodo === 'credito' || metodo.includes('tarjet')) {
                    totales.total_tarjetas += valor;
                } else if (metodo === 'transferencia' || metodo.includes('transfer')) {
                    totales.total_transferencia += valor;
                } else {
                    totales.total_otros += valor; // cheque, otros
                }
            });
        });

        return totales;
    },

    /**
     * Cierra la caja actual.
     */
    async cerrarCaja(sesionId: string, totales: ResumenCierre): Promise<void> {
        const { error } = await supabase
            .from('caja_sesiones')
            .update({
                fecha_cierre: new Date().toISOString(),
                estado: 'cerrada',
                total_efectivo: totales.total_efectivo,
                total_tarjetas: totales.total_tarjetas,
                total_transferencia: totales.total_transferencia,
                total_otros: totales.total_otros
                // total_propina eliminado: columna no existe en caja_sesiones
            })
            .eq('id', sesionId);

        if (error) throw error;
    }
};
