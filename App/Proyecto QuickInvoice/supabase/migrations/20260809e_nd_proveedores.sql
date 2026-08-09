-- Notas de Débito de Proveedores — 2026-08-09
-- Esquema: facturacion
-- Punto 4 del plan de desarrollo. Adaptado a las convenciones reales
-- del proyecto: proveedor_id/compra_id como FK (no texto suelto, para
-- poder unir con proveedores/ingresos_stock igual que el resto del
-- sistema), y RLS multiempresa (profiles UNION usuario_empresas) desde
-- el arranque -- no la versión simple que falló en unidades.

CREATE TABLE IF NOT EXISTS facturacion.nd_proveedores (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    proveedor_id        UUID NOT NULL REFERENCES facturacion.proveedores(id),
    compra_id           UUID REFERENCES facturacion.ingresos_stock(id),      -- factura relacionada, si existe en el sistema
    cxp_id              UUID REFERENCES facturacion.cuentas_por_pagar(id),   -- CxP afectada (existente o creada por esta N/D)
    numero_nd           VARCHAR(17) NOT NULL,                                -- 001-001-000000001
    fecha_emision       DATE NOT NULL,
    numero_autorizacion VARCHAR(49),
    base_imponible      NUMERIC(12,2) NOT NULL DEFAULT 0,
    iva                 NUMERIC(12,2) NOT NULL DEFAULT 0,
    total               NUMERIC(12,2) NOT NULL,
    concepto            TEXT,
    estado              VARCHAR(20) NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'ANULADA')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID REFERENCES facturacion.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_nd_proveedores_empresa   ON facturacion.nd_proveedores(empresa_id);
CREATE INDEX IF NOT EXISTS idx_nd_proveedores_proveedor ON facturacion.nd_proveedores(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_nd_proveedores_compra    ON facturacion.nd_proveedores(compra_id);

ALTER TABLE facturacion.nd_proveedores ENABLE ROW LEVEL SECURITY;

DO $do$
DECLARE
    _using TEXT := $u$empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas
            WHERE user_id = auth.uid() AND activo = true
        )$u$;
BEGIN
    EXECUTE format('CREATE POLICY %I ON facturacion.nd_proveedores FOR SELECT USING (%s)',
        'nd_proveedores_select', _using);
    EXECUTE format('CREATE POLICY %I ON facturacion.nd_proveedores FOR INSERT WITH CHECK (%s)',
        'nd_proveedores_insert', _using);
    EXECUTE format('CREATE POLICY %I ON facturacion.nd_proveedores FOR UPDATE USING (%s) WITH CHECK (%s)',
        'nd_proveedores_update', _using, _using);
    EXECUTE format('CREATE POLICY %I ON facturacion.nd_proveedores FOR DELETE USING (%s)',
        'nd_proveedores_delete', _using);
END $do$;

GRANT ALL ON facturacion.nd_proveedores TO authenticated, service_role;
