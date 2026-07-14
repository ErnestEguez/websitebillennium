-- Paso 1: Agente de retención en configuración de empresa
-- Ejecutar en Supabase SQL Editor (schema: facturacion)

ALTER TABLE facturacion.empresas
    ADD COLUMN IF NOT EXISTS es_agente_retencion        boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS numero_resolucion_retencion text,
    ADD COLUMN IF NOT EXISTS fecha_inicio_retencion      date;

COMMENT ON COLUMN facturacion.empresas.es_agente_retencion        IS 'Designado por el SRI para emitir comprobantes de retención';
COMMENT ON COLUMN facturacion.empresas.numero_resolucion_retencion IS 'N° de resolución del SRI que designó a la empresa como agente de retención (referencial)';
COMMENT ON COLUMN facturacion.empresas.fecha_inicio_retencion      IS 'Fecha desde la que está vigente la designación como agente de retención';
