-- ============================================================
-- 1. FIX: RLS de lineas/subcategorias no soportaba multiempresa
--
-- La política original (20260708_mejoras_generales.sql) solo comparaba
-- contra facturacion.profiles.empresa_id (la empresa "principal" del
-- usuario) — un usuario con acceso a varias empresas vía
-- usuario_empresas no podía INSERTAR una línea/subcategoría en ninguna
-- empresa que no fuera esa "principal". Se actualiza al mismo patrón ya
-- usado en tablas más nuevas (ej. proformas).
-- ============================================================

DROP POLICY IF EXISTS "lineas_empresa" ON facturacion.lineas;
CREATE POLICY "lineas_empresa" ON facturacion.lineas
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

DROP POLICY IF EXISTS "subcategorias_empresa" ON facturacion.subcategorias;
CREATE POLICY "subcategorias_empresa" ON facturacion.subcategorias
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

-- ============================================================
-- 2. Datos de transferencia (cuenta bancaria, N° comprobante,
--    observaciones) en los pagos de Facturación en Vivo y Plan
--    Acumulativo — mismos campos que ya existen en el pago de una
--    factura normal (PagoFactura), para que al emitir/consolidar no se
--    pierda esa información.
-- ============================================================

ALTER TABLE facturacion.facturas_en_vivo_pagos
    ADD COLUMN IF NOT EXISTS cuenta_bancaria_id UUID,
    ADD COLUMN IF NOT EXISTS numero_documento   TEXT,
    ADD COLUMN IF NOT EXISTS observaciones      TEXT;

ALTER TABLE facturacion.ventas_pa_pagos
    ADD COLUMN IF NOT EXISTS cuenta_bancaria_id UUID,
    ADD COLUMN IF NOT EXISTS numero_documento   TEXT,
    ADD COLUMN IF NOT EXISTS observaciones      TEXT;
