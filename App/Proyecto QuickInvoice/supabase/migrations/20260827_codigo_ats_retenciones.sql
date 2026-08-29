-- ═══════════════════════════════════════════════════════════════════════════
-- codigo_ats en codigos_retencion — código equivalente en el Anexo
-- Transaccional (ATS) para retenciones de IVA.
--
-- El comprobante de retención electrónico (firmado y autorizado por el SRI)
-- y el ATS usan catálogos DISTINTOS de código para la misma tarifa de
-- retención de IVA (ej. comprobante="1" / ATS="725" para 30%). La columna
-- "codigo" ya existente sigue siendo la del comprobante — esta columna
-- nueva es solo de referencia, para que quede la relación documentada en el
-- mismo catálogo en vez de tenerla suelta en la cabeza del contador.
--
-- Aditiva: no toca ninguna fila existente de ninguna empresa.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE facturacion.codigos_retencion
    ADD COLUMN IF NOT EXISTS codigo_ats TEXT;
