import { supabase } from './supabase';

export interface ChatMessage {
    id: string;
    room_id: string;
    sender_id: string;
    content: string;
    is_read: boolean;
    created_at: string;
}

export interface ChatRoom {
    id: string;
    empresa_id: string;
    vendedor_id: string;
    updated_at: string;
    vendedor?: {
        nombre: string;
        email: string;
    };
}

export const chatService = {
    async getOrCreateRoom(vendedorId: string, empresaId: string): Promise<string> {
        // Intentar buscar room existente
        const { data: existing, error: searchError } = await supabase
            .from('chat_rooms')
            .select('id')
            .eq('vendedor_id', vendedorId)
            .maybeSingle();

        if (existing) return existing.id;

        // Si no existe, crear
        const { data: newRoom, error: createError } = await supabase
            .from('chat_rooms')
            .insert({
                vendedor_id: vendedorId,
                empresa_id: empresaId
            })
            .select('id')
            .single();

        if (createError) throw createError;
        return newRoom.id;
    },

    async getMessages(roomId: string): Promise<ChatMessage[]> {
        const { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('room_id', roomId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    },

    async sendMessage(roomId: string, senderId: string, content: string): Promise<void> {
        const { error } = await supabase
            .from('chat_messages')
            .insert({
                room_id: roomId,
                sender_id: senderId,
                content: content,
                is_read: false
            });

        if (error) throw error;

        // Actualizar updated_at de la room
        await supabase
            .from('chat_rooms')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', roomId);
    },

    subscribeToMessages(roomId: string, onMessage: (message: ChatMessage) => void) {
        return supabase
            .channel(`room:${roomId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'chat_messages',
                    filter: `room_id=eq.${roomId}`
                },
                (payload) => {
                    onMessage(payload.new as ChatMessage);
                }
            )
            .subscribe();
    },

    async getActiveRooms(empresaId: string): Promise<ChatRoom[]> {
        const { data, error } = await supabase
            .from('chat_rooms')
            .select(`
        *,
        vendedor:vendedores!chat_rooms_vendedor_id_fkey(nombre, email)
      `)
            .eq('empresa_id', empresaId)
            .order('updated_at', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    async deleteMessages(roomId: string, daysBack?: number): Promise<void> {
        let query = supabase
            .from('chat_messages')
            .delete()
            .eq('room_id', roomId);

        if (daysBack && daysBack > 0) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysBack);
            query = query.gte('created_at', cutoffDate.toISOString());
        }

        const { error } = await query;
        if (error) throw error;
    },

    async deleteAllMessagesForVendor(vendedorId: string): Promise<void> {
        const { data: room } = await supabase
            .from('chat_rooms')
            .select('id')
            .eq('vendedor_id', vendedorId)
            .maybeSingle();

        if (room) {
            const { error } = await supabase
                .from('chat_messages')
                .delete()
                .eq('room_id', room.id);

            if (error) throw error;
        }
    }
};
