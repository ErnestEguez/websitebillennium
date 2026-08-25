-- ═══════════════════════════════════════════════════════════════════════════
-- FACTURACIÓN EN VIVO — borradores de factura para venta en vivo (TikTok, etc.)
--
-- Modal separado de Nueva Factura (no la recarga). Permite mantener varias
-- facturas en estado PENDIENTE simultáneamente, editarlas libremente, y
-- cuando estén listas, "emitirlas" cargándolas en el formulario normal de
-- Nueva Factura para completar el pago y disparar el flujo SRI existente
-- sin tocarlo. El borrador no se borra al emitir — queda con estado EMITIDA
-- y su comprobante_id, como historial.
--
-- Talla/Color: el diseño reutiliza los catálogos YA EXISTENTES de
-- lineas/subcategorias del producto (linea_id/subcategoria_id en productos).
-- NO se reetiqueta "Línea"/"Subcategoría" en ningún otro lugar de la
-- aplicación (ProductsPage, Configuración, Nueva Factura normal) — las
-- columnas etiqueta_campo_linea/etiqueta_campo_subcategoria de abajo solo
-- controlan el texto que se muestra en ESTE modal.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS facturacion.facturas_en_vivo (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id       UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    cliente_id       UUID REFERENCES facturacion.clientes(id),
    estado           TEXT NOT NULL DEFAULT 'PENDIENTE'
                         CHECK (estado IN ('PENDIENTE', 'EMITIDA', 'ELIMINADA')),
    observaciones    TEXT,
    -- Se llena al emitir (convertir en factura real vía Nueva Factura)
    comprobante_id   UUID REFERENCES facturacion.comprobantes(id),
    created_by       UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS facturacion.facturas_en_vivo_detalles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    factura_en_vivo_id  UUID NOT NULL REFERENCES facturacion.facturas_en_vivo(id) ON DELETE CASCADE,
    producto_id         UUID,
    nombre_producto     TEXT NOT NULL,
    cantidad            NUMERIC(12,4) NOT NULL DEFAULT 1,
    precio_unitario     NUMERIC(12,4) NOT NULL DEFAULT 0,
    descuento           NUMERIC(12,4) NOT NULL DEFAULT 0,
    iva_porcentaje      NUMERIC(5,2)  NOT NULL DEFAULT 0,
    -- Talla/Color — solo se capturan/muestran en este modal (ver comentario
    -- de cabecera). Al emitir, se copian a comprobante_detalles.talla/color.
    talla               TEXT,
    color               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS facturacion.facturas_en_vivo_pagos (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    factura_en_vivo_id  UUID NOT NULL REFERENCES facturacion.facturas_en_vivo(id) ON DELETE CASCADE,
    metodo_pago         TEXT NOT NULL,
    valor               NUMERIC(12,2) NOT NULL DEFAULT 0,
    referencia          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_facturas_en_vivo_empresa ON facturacion.facturas_en_vivo(empresa_id, estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_facturas_en_vivo_det_fev ON facturacion.facturas_en_vivo_detalles(factura_en_vivo_id);
CREATE INDEX IF NOT EXISTS idx_facturas_en_vivo_pag_fev ON facturacion.facturas_en_vivo_pagos(factura_en_vivo_id);

-- ── Config por empresa ───────────────────────────────────────────────────
-- mostrar_facturacion_en_vivo: activa/oculta el ítem del sidebar (default
-- apagado — es una función especializada, no todas las empresas la usan).
-- etiqueta_campo_linea/etiqueta_campo_subcategoria: texto libre por empresa
-- para los 2 dropdowns de este modal (default "Talla"/"Color", pero cada
-- empresa puede ponerle el nombre que corresponda a su propio negocio).
ALTER TABLE facturacion.empresas
    ADD COLUMN IF NOT EXISTS mostrar_facturacion_en_vivo BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS etiqueta_campo_linea        TEXT NOT NULL DEFAULT 'Talla',
    ADD COLUMN IF NOT EXISTS etiqueta_campo_subcategoria TEXT NOT NULL DEFAULT 'Color';

-- ── Permisos y RLS (mismo patrón que proformas) ─────────────────────────
GRANT ALL ON facturacion.facturas_en_vivo          TO authenticated, service_role;
GRANT ALL ON facturacion.facturas_en_vivo_detalles TO authenticated, service_role;
GRANT ALL ON facturacion.facturas_en_vivo_pagos    TO authenticated, service_role;

ALTER TABLE facturacion.facturas_en_vivo          ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.facturas_en_vivo_detalles ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturacion.facturas_en_vivo_pagos    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "facturas_en_vivo_empresa"     ON facturacion.facturas_en_vivo;
DROP POLICY IF EXISTS "facturas_en_vivo_det_empresa" ON facturacion.facturas_en_vivo_detalles;
DROP POLICY IF EXISTS "facturas_en_vivo_pag_empresa" ON facturacion.facturas_en_vivo_pagos;

CREATE POLICY "facturas_en_vivo_empresa" ON facturacion.facturas_en_vivo
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

CREATE POLICY "facturas_en_vivo_det_empresa" ON facturacion.facturas_en_vivo_detalles
    FOR ALL USING (factura_en_vivo_id IN (
        SELECT id FROM facturacion.facturas_en_vivo WHERE empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
        )
    ));

CREATE POLICY "facturas_en_vivo_pag_empresa" ON facturacion.facturas_en_vivo_pagos
    FOR ALL USING (factura_en_vivo_id IN (
        SELECT id FROM facturacion.facturas_en_vivo WHERE empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
        )
    ));
