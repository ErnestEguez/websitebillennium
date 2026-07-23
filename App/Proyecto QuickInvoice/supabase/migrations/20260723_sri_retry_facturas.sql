-- ============================================================
-- REINTENTO AUTOMÁTICO DE AUTORIZACIÓN SRI (Facturas) — 2026-07-23
-- Esquema: facturacion
-- ============================================================
-- Aditivo: nuevas columnas de control + extensiones + 1 cron job.
-- No modifica ninguna tabla/columna existente.

-- ────────────────────────────────────────────────────────────
-- 1. Columnas de control de reintento en comprobantes
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturacion.comprobantes
    ADD COLUMN IF NOT EXISTS intentos_sri       INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ultimo_intento_sri  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS alerta_enviada      BOOLEAN NOT NULL DEFAULT false;

-- ────────────────────────────────────────────────────────────
-- 2. Extensiones necesarias para el cron
-- ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- ────────────────────────────────────────────────────────────
-- 3. Cron job — cada 15 minutos llama a la Edge Function
--    sri-retry-facturas, que hace el barrido y reintenta.
--
--    ⚠️ IMPORTANTE: reemplaza <SERVICE_ROLE_KEY> por la
--    service_role key real del proyecto (Project Settings → API)
--    ANTES de correr este script. No la subas a git en ningún
--    otro archivo — este valor queda solo dentro de la base de
--    datos, en la definición del cron job.
-- ────────────────────────────────────────────────────────────
SELECT cron.schedule(
    'sri-retry-facturas',
    '*/15 * * * *',
    $$
    SELECT net.http_post(
        url     := 'https://ietsocfibsoclienqafq.supabase.co/functions/v1/sri-retry-facturas',
        headers := jsonb_build_object(
            'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
    );
    $$
);

-- Para desactivar el job en el futuro (no correr ahora):
-- SELECT cron.unschedule('sri-retry-facturas');
