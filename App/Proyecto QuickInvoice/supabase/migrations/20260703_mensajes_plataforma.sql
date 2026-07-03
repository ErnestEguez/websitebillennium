-- Tabla global de mensajes del SuperAdmin visible para todos los usuarios
CREATE TABLE IF NOT EXISTS facturacion.mensajes_plataforma (
    id      INTEGER PRIMARY KEY DEFAULT 1,
    mensaje TEXT    DEFAULT '',
    activo  BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT single_row CHECK (id = 1)
);

-- Insertar fila única si no existe
INSERT INTO facturacion.mensajes_plataforma (id, mensaje)
VALUES (1, '')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE facturacion.mensajes_plataforma ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "msg_read_all"   ON facturacion.mensajes_plataforma;
DROP POLICY IF EXISTS "msg_admin_write" ON facturacion.mensajes_plataforma;

-- Cualquier usuario autenticado puede leer
CREATE POLICY "msg_read_all" ON facturacion.mensajes_plataforma
    FOR SELECT TO authenticated USING (true);

-- Solo admin_plataforma puede escribir
CREATE POLICY "msg_admin_write" ON facturacion.mensajes_plataforma
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM facturacion.profiles
        WHERE id = auth.uid() AND rol = 'admin_plataforma'
    ));

GRANT SELECT ON facturacion.mensajes_plataforma TO authenticated;
GRANT ALL    ON facturacion.mensajes_plataforma TO service_role;
