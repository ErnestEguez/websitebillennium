-- ═══════════════════════════════════════════════════════════════════════
-- Sentinel — Sistema de inducción guiada
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS facturacion.sentinel_progreso (
    user_id     UUID    NOT NULL,
    empresa_id  UUID    NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    mision_id   TEXT    NOT NULL,
    completada  BOOLEAN NOT NULL DEFAULT false,
    paso_actual INT     NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ DEFAULT timezone('utc', now()),
    PRIMARY KEY (user_id, empresa_id, mision_id)
);

ALTER TABLE facturacion.sentinel_progreso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sentinel_own_rows" ON facturacion.sentinel_progreso
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

GRANT ALL ON facturacion.sentinel_progreso TO authenticated, service_role;
