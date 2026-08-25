-- ═══════════════════════════════════════════════════════════════════════════
-- PLAN ACUMULATIVO (PA) — nueva forma de pago
--
-- Distinto de Crédito (CR): una venta con forma de pago PA NO genera
-- comprobante/factura electrónica de inmediato — se acumula aquí. Cuando el
-- cliente cancela el saldo TOTAL acumulado (sin plazo forzado), se
-- consolidan TODAS sus ventas_pa en estado ACUMULADO en una sola factura
-- electrónica, con fecha del día de la cancelación, manteniendo cada línea
-- de cada compra original por separado (no se fusionan/suman).
--
-- No se pudo reutilizar facturacion.cartera_cxc para esto: su columna
-- comprobante_id es NOT NULL + UNIQUE, es decir exige que ya exista una
-- factura real — justo lo contrario de cómo funciona PA. Por eso son
-- tablas separadas, y por lo mismo CR y PA nunca se mezclan en pantalla.
--
-- El saldo pendiente de un cliente NO se guarda en una columna (para no
-- desincronizarse) — siempre se calcula en vivo:
--   SUM(ventas_pa.total)  WHERE estado = 'ACUMULADO' Y cliente_id = X
--   - SUM(ventas_pa_pagos.valor) WHERE cliente_id = X (pagos aún no
--     consumidos por una consolidación)
-- Al llegar a 0, se consolidan todas las ventas_pa ACUMULADO de ese cliente.
--
-- Stock: se descuenta en el momento de la venta PA (el producto sale de la
-- tienda ya). Al consolidar/facturar NO se vuelve a descontar — la salida
-- de inventario ya ocurrió, la factura solo formaliza el documento SRI.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS facturacion.ventas_pa (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id     UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    cliente_id     UUID NOT NULL REFERENCES facturacion.clientes(id),
    fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
    total          NUMERIC(12,2) NOT NULL DEFAULT 0,
    estado         TEXT NOT NULL DEFAULT 'ACUMULADO'
                       CHECK (estado IN ('ACUMULADO', 'FACTURADO', 'ANULADO')),
    bodega_id      UUID,
    vendedor_id    UUID,
    -- Se llena al consolidar (junto con las demás ventas_pa ACUMULADO del
    -- mismo cliente) en una sola factura, al cancelar la deuda total.
    comprobante_id UUID REFERENCES facturacion.comprobantes(id),
    created_by     UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS facturacion.ventas_pa_detalles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venta_pa_id     UUID NOT NULL REFERENCES facturacion.ventas_pa(id) ON DELETE CASCADE,
    producto_id     UUID,
    nombre_producto TEXT NOT NULL,
    cantidad        NUMERIC(12,4) NOT NULL DEFAULT 1,
    precio_unitario NUMERIC(12,4) NOT NULL DEFAULT 0,
    descuento       NUMERIC(12,4) NOT NULL DEFAULT 0,
    iva_porcentaje  NUMERIC(5,2)  NOT NULL DEFAULT 0,
    talla           TEXT,
    color           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS facturacion.ventas_pa_pagos (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id   UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    cliente_id   UUID NOT NULL REFERENCES facturacion.clientes(id),
    fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
    valor        NUMERIC(12,2) NOT NULL,
    metodo_pago  TEXT,
    referencia   TEXT,
    created_by   UUID,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_ventas_pa_empresa_cliente ON facturacion.ventas_pa(empresa_id, cliente_id, estado);
CREATE INDEX IF NOT EXISTS idx_ventas_pa_det_venta       ON facturacion.ventas_pa_detalles(venta_pa_id);
CREATE INDEX IF NOT EXISTS idx_ventas_pa_pagos_cliente   ON facturacion.ventas_pa_pagos(empresa_id, cliente_id);

GRANT ALL ON facturacion.ventas_pa          TO authenticated, service_role;
GRANT ALL ON facturacion.ventas_pa_detalles TO authenticated, service_role;
GRANT ALL ON facturacion.ventas_pa_pagos    TO authenticated, service_role;

ALTER TABLE facturacion.ventas_pa          ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.ventas_pa_detalles ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.ventas_pa_pagos    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ventas_pa_empresa"       ON facturacion.ventas_pa;
DROP POLICY IF EXISTS "ventas_pa_det_empresa"   ON facturacion.ventas_pa_detalles;
DROP POLICY IF EXISTS "ventas_pa_pagos_empresa" ON facturacion.ventas_pa_pagos;

CREATE POLICY "ventas_pa_empresa" ON facturacion.ventas_pa
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

CREATE POLICY "ventas_pa_det_empresa" ON facturacion.ventas_pa_detalles
    FOR ALL USING (venta_pa_id IN (
        SELECT id FROM facturacion.ventas_pa WHERE empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
        )
    ));

CREATE POLICY "ventas_pa_pagos_empresa" ON facturacion.ventas_pa_pagos
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
