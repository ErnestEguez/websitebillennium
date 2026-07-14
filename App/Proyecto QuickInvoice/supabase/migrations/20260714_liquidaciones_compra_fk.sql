-- =============================================================
-- PARCHE: Foreign Keys para Liquidaciones de Compra
-- Ejecutar en Supabase SQL Editor DESPUÉS de 20260714_liquidaciones_compra.sql
-- Sin estas FK, PostgREST no puede resolver los joins de la API.
-- =============================================================

-- FK a proveedores (nullable — el beneficiario puede no estar en catálogo)
ALTER TABLE facturacion.liquidaciones_compra
    ADD CONSTRAINT fk_lc_proveedor
    FOREIGN KEY (proveedor_id)
    REFERENCES facturacion.proveedores(id)
    ON DELETE SET NULL;

-- FK a puntos_emision (obligatoria)
ALTER TABLE facturacion.liquidaciones_compra
    ADD CONSTRAINT fk_lc_punto_emision
    FOREIGN KEY (punto_emision_id)
    REFERENCES facturacion.puntos_emision(id);
