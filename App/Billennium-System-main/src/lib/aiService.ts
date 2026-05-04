import { supabase } from './supabase';

export interface AiSuggestion {
    articulo_id: string;
    descripcion: string;
    motivo: string;
    precio: number;
}

export const aiService = {
    async getProductSuggestions(
        currentItems: Array<{ id: string; descripcion: string }>,
        empresaId: string
    ): Promise<AiSuggestion[]> {
        try {
            // En una implementación real, esto llamaría a una Edge Function que usa Google Gemini
            // Para esta etapa, simularemos la lógica de recomendación basada en palabras clave

            const lastItem = currentItems[currentItems.length - 1];
            if (!lastItem) return [];

            const desc = lastItem.descripcion.toLowerCase();
            let searchTerms: string[] = [];

            // Lógica de "Cross-selling" manual inteligente (mientras se activa el modelo real)
            if (desc.includes('riel') || desc.includes('extension')) {
                searchTerms = ['tornillo', 'jaladera', 'tirador', 'bisagra'];
            } else if (desc.includes('tubo') || desc.includes('pvc')) {
                searchTerms = ['codo', 'union', 'pegamento', 'teflon'];
            } else if (desc.includes('puerta')) {
                searchTerms = ['cerradura', 'bisagra', 'tope', 'manija'];
            } else {
                // Sugerencias generales de alta rotación
                searchTerms = ['guante', 'flexometro', 'destornillador'];
            }

            // Buscar productos reales en la base de datos que coincidan con los términos
            const { data: matches, error } = await supabase
                .from('articulos')
                .select('id, descripcion, precio')
                .eq('empresa_id', empresaId)
                .eq('activo', true)
                .or(searchTerms.map(term => `descripcion.ilike.%${term}%`).join(','))
                .limit(3);

            if (error) throw error;

            return (matches || []).map(m => ({
                articulo_id: m.id,
                descripcion: m.descripcion,
                precio: m.precio,
                motivo: `Frecuentemente comprado con "${lastItem.descripcion}"`
            }));

        } catch (err) {
            console.error('Error in AiService:', err);
            return [];
        }
    }
};
