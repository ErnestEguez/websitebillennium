-- ============================================================
-- Guías de Remisión Electrónicas (SRI Ecuador)
-- ============================================================

-- 1. Catálogo de transportistas reutilizables
CREATE TABLE IF NOT EXISTS public.transportistas (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nombre              TEXT NOT NULL,
    tipo_identificacion TEXT NOT NULL DEFAULT '05', -- 04=RUC, 05=Cédula, 06=Pasaporte
    identificacion      TEXT NOT NULL,
    placa               TEXT NOT NULL,
    telefono            TEXT,
    activo              BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc', now())
);
ALTER TABLE public.transportistas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transportistas_empresa" ON public.transportistas
    USING (empresa_id = (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));
GRANT ALL ON public.transportistas TO authenticated, service_role;

-- 2. Cabecera de guías de remisión
CREATE TABLE IF NOT EXISTS public.guias_remision (
    id                           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id                   UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    secuencial                   TEXT NOT NULL,           -- 001-001-000000001
    clave_acceso                 TEXT UNIQUE,
    ambiente                     TEXT DEFAULT 'PRUEBAS',
    fecha_emision                DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_ini_transporte         DATE NOT NULL,
    fecha_fin_transporte         DATE NOT NULL,
    dir_salida                   TEXT NOT NULL,
    -- Transportista (catálogo o manual)
    transportista_id             UUID REFERENCES public.transportistas(id),
    transportista_nombre         TEXT NOT NULL,
    transportista_identificacion TEXT NOT NULL,
    transportista_tipo_id        TEXT NOT NULL DEFAULT '05',
    placa                        TEXT NOT NULL,
    -- Destinatario (cliente catálogo o manual)
    cliente_id                   UUID REFERENCES public.clientes(id),
    destinatario_nombre          TEXT NOT NULL,
    destinatario_identificacion  TEXT NOT NULL,
    destinatario_direccion       TEXT NOT NULL,
    -- Documento de sustento (factura de origen)
    comprobante_id               UUID REFERENCES public.comprobantes(id),
    doc_sustento_numero          TEXT NOT NULL,
    doc_sustento_autorizacion    TEXT,
    doc_sustento_fecha           DATE,
    -- Datos adicionales de transporte
    motivo_traslado              TEXT NOT NULL DEFAULT 'VENTA',
    ruta                         TEXT,
    -- Estado SRI
    estado_sri                   TEXT NOT NULL DEFAULT 'PENDIENTE',
    xml_firmado                  TEXT,
    autorizacion_numero          TEXT,
    fecha_autorizacion           TIMESTAMPTZ,
    observaciones_sri            TEXT,
    created_at                   TIMESTAMPTZ DEFAULT timezone('utc', now())
);
ALTER TABLE public.guias_remision ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guias_remision_empresa" ON public.guias_remision
    USING (empresa_id = (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));
GRANT ALL ON public.guias_remision TO authenticated, service_role;

-- 3. Detalle de productos de la guía
CREATE TABLE IF NOT EXISTS public.guia_remision_detalles (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guia_remision_id UUID NOT NULL REFERENCES public.guias_remision(id) ON DELETE CASCADE,
    producto_id      UUID REFERENCES public.productos(id),
    codigo           TEXT,
    descripcion      TEXT NOT NULL,
    cantidad         NUMERIC(12,4) NOT NULL,
    precio_unitario  NUMERIC(12,4) NOT NULL DEFAULT 0,
    total            NUMERIC(12,4) NOT NULL DEFAULT 0
);
ALTER TABLE public.guia_remision_detalles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guia_detalles_empresa" ON public.guia_remision_detalles
    USING (guia_remision_id IN (
        SELECT id FROM public.guias_remision
        WHERE empresa_id = (SELECT empresa_id FROM public.profiles WHERE id = auth.uid())
    ));
GRANT ALL ON public.guia_remision_detalles TO authenticated, service_role;
