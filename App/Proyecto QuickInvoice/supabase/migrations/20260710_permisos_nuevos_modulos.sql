-- ═══════════════════════════════════════════════════════════════════════
-- Permisos de nuevos módulos — 2026-07-10
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE facturacion.user_permisos
    -- Estaban en el código pero sin columna en BD (siempre caían al fallback true)
    ADD COLUMN IF NOT EXISTS perm_consulta_cartera        BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_estado_cuenta           BOOLEAN NOT NULL DEFAULT true,

    -- Nuevos módulos incorporados recientemente
    ADD COLUMN IF NOT EXISTS perm_guias_remision          BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_preparaciones_pintura   BOOLEAN NOT NULL DEFAULT true;
