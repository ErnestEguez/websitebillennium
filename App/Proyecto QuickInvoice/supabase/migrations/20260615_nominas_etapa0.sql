-- Etapa 0 — Cimientos del módulo "Talento Humano y Nóminas"
--
-- - Toggle de activación del módulo por empresa (additive, default false).
-- - Esquema `nominas` (ya creado vacío por el usuario): estructura organizativa
--   (secciones/cargos) y parámetros generales de nómina (SBU, IESS, fondo de reserva).
--
-- Nota: además de correr este SQL, verificar en Dashboard → Settings → API →
-- "Exposed schemas" que el esquema `nominas` esté agregado (igual que
-- facturacion/contabilidad/finance), o supabase.schema('nominas') fallará desde el frontend.

-- 1. Toggle del módulo
ALTER TABLE facturacion.empresas
    ADD COLUMN IF NOT EXISTS usar_talento_humano BOOLEAN NOT NULL DEFAULT false;

-- 2. Estructura organizativa: secciones (departamentos)
CREATE TABLE IF NOT EXISTS nominas.secciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    UNIQUE (empresa_id, nombre)
);

-- 3. Estructura organizativa: cargos (puestos)
CREATE TABLE IF NOT EXISTS nominas.cargos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    seccion_id UUID REFERENCES nominas.secciones(id) ON DELETE SET NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    UNIQUE (empresa_id, nombre)
);

-- 4. Parámetros generales de nómina (1 fila por empresa)
CREATE TABLE IF NOT EXISTS nominas.parametros (
    empresa_id UUID PRIMARY KEY REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    sbu NUMERIC(10,2) NOT NULL DEFAULT 482.00,
    aporte_personal_iess_pct NUMERIC(5,2) NOT NULL DEFAULT 9.45,
    aporte_patronal_iess_pct NUMERIC(5,2) NOT NULL DEFAULT 12.15,
    fondo_reserva_pct NUMERIC(5,2) NOT NULL DEFAULT 8.33,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 5. RLS — mismo patrón multiempresa que 20260614_puntos_emision.sql
--    (incluye usuario_empresas para usuarios con acceso a varias empresas).
ALTER TABLE nominas.secciones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE nominas.cargos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE nominas.parametros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nominas_secciones_empresa" ON nominas.secciones
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

CREATE POLICY "nominas_cargos_empresa" ON nominas.cargos
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

CREATE POLICY "nominas_parametros_empresa" ON nominas.parametros
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles WHERE id = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));
