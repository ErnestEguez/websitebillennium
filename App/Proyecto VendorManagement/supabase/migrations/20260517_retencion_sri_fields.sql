-- Campos SRI para comprobantes de retención electrónica
ALTER TABLE facturacion.retenciones_compras
    ADD COLUMN IF NOT EXISTS clave_acceso       TEXT,
    ADD COLUMN IF NOT EXISTS estado_sri         TEXT NOT NULL DEFAULT 'NO_FIRMADA',
    ADD COLUMN IF NOT EXISTS fecha_autorizacion TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS xml_firmado        TEXT,
    ADD COLUMN IF NOT EXISTS observaciones_sri  TEXT;

COMMENT ON COLUMN facturacion.retenciones_compras.clave_acceso IS
    'Clave de acceso de 49 dígitos enviada al SRI (módulo 11, codDoc=07)';
COMMENT ON COLUMN facturacion.retenciones_compras.estado_sri IS
    'Estado de firma electrónica: NO_FIRMADA | ENVIADO | AUTORIZADO | RECHAZADO';
COMMENT ON COLUMN facturacion.retenciones_compras.xml_firmado IS
    'XML XAdES-BES firmado, devuelto por la función sri-retencion';

CREATE INDEX IF NOT EXISTS idx_retenciones_sri_estado
    ON facturacion.retenciones_compras(empresa_id, estado_sri);
