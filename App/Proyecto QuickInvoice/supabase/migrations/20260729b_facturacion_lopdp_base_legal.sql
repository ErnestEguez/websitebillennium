-- ============================================================
-- MÓDULO LOPDP — Fase 4 (parte 2/2): base legal / consentimiento en
-- clientes y proveedores (schema core `facturacion`)
--
-- Autorizado explícitamente en el alcance de esta fase. Cambios
-- puramente ADD COLUMN, no destructivos, todos nulables/con default —
-- ninguna columna ni tabla existente se modifica.
--
-- Enum SEPARADO de lopdp.base_legal_enum (mismos 6 valores, duplicado
-- deliberado): así facturacion nunca depende estructuralmente de lopdp
-- — si el módulo LOPDP se desactivara o removiera algún día, estas
-- columnas del core siguen funcionando de forma independiente.
--
-- consentimiento_explicito/fecha son puramente informativos: NUNCA
-- bloquean la creación de una factura ni ninguna operación normal —
-- no se agrega ningún CHECK ni trigger que valide su presencia.
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'base_legal_tratamiento_enum' AND n.nspname = 'facturacion'
    ) THEN
        CREATE TYPE facturacion.base_legal_tratamiento_enum AS ENUM (
            'consentimiento',
            'ejecucion_contrato',
            'obligacion_legal',
            'interes_vital',
            'interes_publico',
            'interes_legitimo'
        );
    END IF;
END $$;

ALTER TABLE facturacion.clientes
    ADD COLUMN IF NOT EXISTS base_legal_tratamiento   facturacion.base_legal_tratamiento_enum,
    ADD COLUMN IF NOT EXISTS consentimiento_explicito BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS consentimiento_fecha     TIMESTAMPTZ;

ALTER TABLE facturacion.proveedores
    ADD COLUMN IF NOT EXISTS base_legal_tratamiento   facturacion.base_legal_tratamiento_enum,
    ADD COLUMN IF NOT EXISTS consentimiento_explicito BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS consentimiento_fecha     TIMESTAMPTZ;
