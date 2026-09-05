-- ═══════════════════════════════════════════════════════════════════════════
-- TERMINALES — relaciona cada máquina física (por un nombre elegido por el
-- usuario, ej. "Caja 1") con un punto de emisión SRI, guardado en el
-- servidor en vez de solo en el localStorage del navegador.
--
-- Por qué: la asignación anterior vivía SOLO en localStorage (ver
-- lib/dispositivoPuntoEmision.ts) — se perdía si se borraba el caché del
-- navegador, y un admin no tenía forma de ver/gestionar centralmente qué
-- serie usa cada caja. Con esta tabla, el navegador solo necesita recordar
-- el NOMBRE de su terminal (texto legible, ej. "Caja 1"); la asignación
-- real vive aquí y se puede reasignar sin tocar la máquina física.
--
-- Compatibilidad: NO se elimina el mecanismo anterior (localStorage con el
-- punto_emision_id directo) — puntoEmisionService.resolverParaDispositivo
-- sigue usándolo como respaldo si esta máquina no tiene un nombre de
-- terminal asignado, para no interrumpir a las máquinas ya configuradas
-- con el sistema viejo.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS facturacion.terminales (
    id               UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id       UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    nombre           TEXT NOT NULL,
    punto_emision_id UUID REFERENCES facturacion.puntos_emision(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (empresa_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_terminales_empresa ON facturacion.terminales(empresa_id);

GRANT ALL ON facturacion.terminales TO authenticated, service_role;

ALTER TABLE facturacion.terminales ENABLE ROW LEVEL SECURITY;

-- Mismo patrón multiempresa que puntos_emision / proformas / retenciones_ventas.
DROP POLICY IF EXISTS "terminales_empresa" ON facturacion.terminales;
CREATE POLICY "terminales_empresa" ON facturacion.terminales
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

-- ── Verificación sugerida después de correr esta migración ──
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'facturacion' AND table_name = 'terminales';
