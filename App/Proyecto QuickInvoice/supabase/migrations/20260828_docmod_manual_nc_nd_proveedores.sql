-- ═══════════════════════════════════════════════════════════════════════════
-- Documento modificado — captura manual para N/C y N/D de proveedores
--
-- El ATS exige, sin excepción, declarar tipo/establecimiento/punto de
-- emisión/secuencial/autorización del documento que una N/C o N/D modifica
-- (tipoComprobante 04/05). Hoy ese dato solo sale de la compra vinculada
-- (ingresos_stock) — pero:
--   - Las N/D permiten explícitamente registrarse SIN compra vinculada
--     (factura del proveedor no digitada en el sistema) — ahí no hay de
--     dónde sacar el dato y el ATS queda incompleto (rechazado por el DIMM:
--     "Debe especificar el TIPO/ESTABLECIMIENTO/PUNTO DE EMISIÓN/NUMERO
--     SECUENCIAL/NUMERO DE AUTORIZACION correspondiente al documento
--     modificado").
--   - Las N/C siempre exigen vincular una compra, pero esa compra puede no
--     tener clave_acceso real (proveedores sin factura electrónica, claves
--     placeholder) — mismo problema.
--
-- Columnas nuevas, nullable, aditivas: cuando estén completas, el generador
-- del ATS (AtsPage.tsx) las usa como respaldo si la compra vinculada no
-- trae clave_acceso.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE facturacion.nd_proveedores
    ADD COLUMN IF NOT EXISTS doc_mod_tipo            TEXT,
    ADD COLUMN IF NOT EXISTS doc_mod_establecimiento  TEXT,
    ADD COLUMN IF NOT EXISTS doc_mod_punto_emision    TEXT,
    ADD COLUMN IF NOT EXISTS doc_mod_secuencial       TEXT,
    ADD COLUMN IF NOT EXISTS doc_mod_autorizacion     TEXT;

ALTER TABLE facturacion.notas_credito_proveedores
    ADD COLUMN IF NOT EXISTS doc_mod_tipo            TEXT,
    ADD COLUMN IF NOT EXISTS doc_mod_establecimiento  TEXT,
    ADD COLUMN IF NOT EXISTS doc_mod_punto_emision    TEXT,
    ADD COLUMN IF NOT EXISTS doc_mod_secuencial       TEXT,
    ADD COLUMN IF NOT EXISTS doc_mod_autorizacion     TEXT;
