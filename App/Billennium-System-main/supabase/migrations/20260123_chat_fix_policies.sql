-- PARCHE RÁPIDO: Políticas adicionales para que el chat funcione correctamente

-- Permitir que la oficina también pueda insertar en rooms si es necesario
CREATE POLICY "rooms_insert_oficina" ON chat_rooms FOR INSERT TO authenticated 
WITH CHECK (empresa_id = get_my_empresa_id() AND is_office());

-- Asegurar que la oficina pueda ver los rooms
CREATE POLICY "rooms_select_all_office" ON chat_rooms FOR SELECT TO authenticated 
USING (is_office() AND empresa_id = get_my_empresa_id());

-- Asegurar que la oficina pueda leer todos los mensajes de su empresa
CREATE POLICY "messages_select_all_office" ON chat_messages FOR SELECT TO authenticated 
USING (is_office() AND EXISTS (
    SELECT 1 FROM chat_rooms r WHERE r.id = room_id AND r.empresa_id = get_my_empresa_id()
));

-- Permitir que la oficina inserte mensajes
CREATE POLICY "messages_insert_office" ON chat_messages FOR INSERT TO authenticated 
WITH CHECK (is_office() AND EXISTS (
    SELECT 1 FROM chat_rooms r WHERE r.id = room_id AND r.empresa_id = get_my_empresa_id()
));
