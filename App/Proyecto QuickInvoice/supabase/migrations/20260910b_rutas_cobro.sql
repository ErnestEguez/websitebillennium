-- ============================================================
-- Ruta de cobro por cobrador — Oficina arma la ruta del día
-- (vencidos + vencen hoy, ordenados por cercanía geográfica desde
-- el local) y el cobrador la ve en Cobros Móvil.
-- ============================================================

-- 1. Punto de partida de la ruta: ubicación del local — mismo patrón que
--    facturacion.clientes.geo_latitud/geo_longitud (20260909d).
ALTER TABLE facturacion.empresas
    ADD COLUMN IF NOT EXISTS geo_latitud  DECIMAL(10,7),
    ADD COLUMN IF NOT EXISTS geo_longitud DECIMAL(10,7);

-- 2. Cabecera — una ruta por cobrador y día (regenerar reemplaza las
--    paradas de la existente en vez de duplicar).
CREATE TABLE IF NOT EXISTS facturacion.rutas_cobro (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id     UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    cobrador_id    UUID NOT NULL REFERENCES facturacion.cobradores(id) ON DELETE CASCADE,
    fecha          DATE NOT NULL,
    total_estimado NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_by     UUID REFERENCES auth.users
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rutas_cobro_cobrador_fecha
    ON facturacion.rutas_cobro(empresa_id, cobrador_id, fecha);

GRANT ALL ON facturacion.rutas_cobro TO authenticated, service_role;
ALTER TABLE facturacion.rutas_cobro ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rutas_cobro_empresa" ON facturacion.rutas_cobro;
CREATE POLICY "rutas_cobro_empresa" ON facturacion.rutas_cobro
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

-- 3. Paradas — snapshot de nombre/dirección/monto al momento de generar
--    (si el cliente cambia de dirección después, la ruta ya emitida no
--    debe moverse sola).
CREATE TABLE IF NOT EXISTS facturacion.rutas_cobro_paradas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ruta_id         UUID NOT NULL REFERENCES facturacion.rutas_cobro(id) ON DELETE CASCADE,
    orden           INTEGER NOT NULL,
    cliente_id      UUID NOT NULL REFERENCES facturacion.clientes(id) ON DELETE RESTRICT,
    cliente_nombre  TEXT NOT NULL,
    direccion       TEXT,
    geo_latitud     DECIMAL(10,7),
    geo_longitud    DECIMAL(10,7),
    monto_pendiente NUMERIC(12,2) NOT NULL DEFAULT 0,
    estado          TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','visitado')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_rutas_cobro_paradas_ruta ON facturacion.rutas_cobro_paradas(ruta_id, orden);

GRANT ALL ON facturacion.rutas_cobro_paradas TO authenticated, service_role;
ALTER TABLE facturacion.rutas_cobro_paradas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rutas_cobro_paradas_empresa" ON facturacion.rutas_cobro_paradas;
CREATE POLICY "rutas_cobro_paradas_empresa" ON facturacion.rutas_cobro_paradas
    FOR ALL USING (ruta_id IN (
        SELECT id FROM facturacion.rutas_cobro WHERE empresa_id IN (
            SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
            UNION
            SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
        )
    ));

-- ── Verificación sugerida después de correr esta migración ──
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'facturacion' AND table_name IN ('rutas_cobro','rutas_cobro_paradas');
--   SELECT geo_latitud, geo_longitud FROM facturacion.empresas LIMIT 5;
