-- Políticas para permitir que la oficina borre mensajes

-- Permitir que la oficina elimine mensajes de su empresa
CREATE POLICY "messages_delete_office" ON chat_messages FOR DELETE TO authenticated 
USING (is_office() AND EXISTS (
    SELECT 1 FROM chat_rooms r WHERE r.id = room_id AND r.empresa_id = get_my_empresa_id()
));
