-- Anulación de Notas de Crédito de clientes — 2026-08-09
-- Esquema: facturacion
-- Punto 3B del plan de desarrollo. notas_credito solo tenía estado_sri
-- (trámite SRI) — igual que comprobantes, necesita un estado de NEGOCIO
-- separado (ACTIVA/ANULADA) para poder anular sin pisar el estado SRI.

ALTER TABLE facturacion.notas_credito
    ADD COLUMN IF NOT EXISTS estado_sistema TEXT NOT NULL DEFAULT 'ACTIVA';

ALTER TABLE facturacion.notas_credito
    DROP CONSTRAINT IF EXISTS notas_credito_estado_sistema_check;

ALTER TABLE facturacion.notas_credito
    ADD CONSTRAINT notas_credito_estado_sistema_check
    CHECK (estado_sistema IN ('ACTIVA', 'ANULADA'));

ALTER TABLE facturacion.notas_credito
    ADD COLUMN IF NOT EXISTS fecha_anulacion   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS motivo_anulacion  TEXT,
    ADD COLUMN IF NOT EXISTS usuario_anulacion UUID REFERENCES facturacion.profiles(id);
