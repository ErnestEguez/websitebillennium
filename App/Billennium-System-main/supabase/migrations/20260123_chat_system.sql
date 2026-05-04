-- 1. EXTENSIÓN DE ROLES PARA VENDEDORES
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS is_office BOOLEAN DEFAULT false;

-- Función para verificar si el usuario es de oficina
CREATE OR REPLACE FUNCTION public.is_office()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
BEGIN
  RETURN COALESCE((SELECT is_office FROM vendedores WHERE id = auth.uid()::text), false);
END;
$$;

-- 2. TABLAS DE CHAT
CREATE TABLE IF NOT EXISTS chat_rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    vendedor_id text NOT NULL REFERENCES vendedores(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(vendedor_id) -- Un vendedor tiene un solo canal con su oficina
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    sender_id text NOT NULL REFERENCES vendedores(id),
    content text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

-- 3. SEGURIDAD RLS
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Políticas para chat_rooms
CREATE POLICY "rooms_select_vendedor" ON chat_rooms FOR SELECT TO authenticated 
USING (vendedor_id = auth.uid()::text);

CREATE POLICY "rooms_select_oficina" ON chat_rooms FOR SELECT TO authenticated 
USING (empresa_id = get_my_empresa_id());

CREATE POLICY "rooms_select_admin" ON chat_rooms FOR SELECT TO authenticated 
USING (is_admin());

CREATE POLICY "rooms_insert_vendedor" ON chat_rooms FOR INSERT TO authenticated 
WITH CHECK (vendedor_id = auth.uid()::text);

-- Políticas para chat_messages
CREATE POLICY "messages_select_vendedor" ON chat_messages FOR SELECT TO authenticated 
USING (sender_id = auth.uid()::text OR EXISTS (
    SELECT 1 FROM chat_rooms r WHERE r.id = room_id AND r.vendedor_id = auth.uid()::text
));

CREATE POLICY "messages_select_oficina" ON chat_messages FOR SELECT TO authenticated 
USING (EXISTS (
    SELECT 1 FROM chat_rooms r WHERE r.id = room_id AND r.empresa_id = get_my_empresa_id()
));

CREATE POLICY "messages_select_admin" ON chat_messages FOR SELECT TO authenticated 
USING (is_admin());

CREATE POLICY "messages_insert_all" ON chat_messages FOR INSERT TO authenticated 
WITH CHECK (sender_id = auth.uid()::text);

-- 4. REALTIME
-- Habilitar replicación para chat
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_rooms;
