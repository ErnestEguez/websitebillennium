-- ============================================================
-- Ventas a Crédito de Electrodomésticos — Fase 0 (fundaciones)
-- ============================================================
-- Módulo nuevo, apagado por defecto en toda empresa existente
-- (habilita_ventas_electrodomesticos_credito = false). Ninguna tabla ni
-- columna existente se modifica ni se borra — 100% aditivo.
--
-- Ver diagnóstico completo: rama feature/ventas-credito-electrodomesticos.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Toggle de empresa — exclusivo de superadmin
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturacion.empresas
    ADD COLUMN IF NOT EXISTS habilita_ventas_electrodomesticos_credito BOOLEAN NOT NULL DEFAULT false;

-- Enforcement real a nivel de base (no solo ocultar el checkbox en UI):
-- cualquier UPDATE que cambie este campo sin ser admin_plataforma se
-- rechaza. facturacion.es_admin_plataforma() ya existe y se usa en 21
-- migraciones para el mismo propósito.
CREATE OR REPLACE FUNCTION facturacion.fn_bloquear_toggle_credito_electrodomesticos()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.habilita_ventas_electrodomesticos_credito IS DISTINCT FROM OLD.habilita_ventas_electrodomesticos_credito
       AND NOT facturacion.es_admin_plataforma() THEN
        RAISE EXCEPTION 'Solo un administrador de plataforma puede cambiar habilita_ventas_electrodomesticos_credito';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_toggle_credito_electrodomesticos ON facturacion.empresas;
CREATE TRIGGER trg_bloquear_toggle_credito_electrodomesticos
    BEFORE UPDATE ON facturacion.empresas
    FOR EACH ROW EXECUTE FUNCTION facturacion.fn_bloquear_toggle_credito_electrodomesticos();

-- ────────────────────────────────────────────────────────────
-- 2. Configuración financiera por empresa (1 fila por empresa)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.config_credito_electrodomesticos (
    empresa_id                    UUID PRIMARY KEY REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    permite_garante_opcional      BOOLEAN NOT NULL DEFAULT true,
    permite_periodicidad_diaria   BOOLEAN NOT NULL DEFAULT true,
    permite_periodicidad_semanal  BOOLEAN NOT NULL DEFAULT true,
    permite_periodicidad_mensual  BOOLEAN NOT NULL DEFAULT true,
    permite_pago_anticipado       BOOLEAN NOT NULL DEFAULT true,
    -- Mora: campos reservados desde ya (para no migrar de nuevo), pero el
    -- cálculo/uso real queda diseñado en Fase 5, cuando exista al menos
    -- una cuota real venciendo para probarlo contra un caso real.
    permite_mora                  BOOLEAN NOT NULL DEFAULT false,
    dias_gracia_mora              INTEGER NOT NULL DEFAULT 0,
    tasa_mora_default             NUMERIC(6,4) NOT NULL DEFAULT 0,
    redondeo_cuota                NUMERIC(4,2) NOT NULL DEFAULT 0.01,
    base_calculo_interes          TEXT NOT NULL DEFAULT 'SALDO_DESPUES_ENTRADA'
        CHECK (base_calculo_interes IN ('SALDO_DESPUES_ENTRADA','TOTAL_VENTA')),
    prefijo_contrato              TEXT,
    prefijo_pagare                TEXT,
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

GRANT ALL ON facturacion.config_credito_electrodomesticos TO authenticated, service_role;
ALTER TABLE facturacion.config_credito_electrodomesticos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "config_credito_electro_empresa" ON facturacion.config_credito_electrodomesticos;
CREATE POLICY "config_credito_electro_empresa" ON facturacion.config_credito_electrodomesticos
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

-- ────────────────────────────────────────────────────────────
-- 3. Tabla comercial de tasas/factores por plazo (opcional, punto 7
--    del requerimiento) — vive vacía hasta que una empresa la use.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.tasas_credito_electrodomesticos (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id     UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    periodicidad   TEXT NOT NULL CHECK (periodicidad IN ('DIARIA','SEMANAL','MENSUAL')),
    numero_cuotas  INTEGER NOT NULL CHECK (numero_cuotas > 0),
    tipo_valor     TEXT NOT NULL CHECK (tipo_valor IN ('TASA_PERIODICA','TASA_ANUAL_NOMINAL','TASA_EFECTIVA_ANUAL','FACTOR_ACUMULADO_PLAZO')),
    porcentaje     NUMERIC(8,4) NOT NULL,
    vigencia_desde DATE NOT NULL DEFAULT CURRENT_DATE,
    vigencia_hasta DATE,
    activo         BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_by     UUID REFERENCES auth.users
);

CREATE INDEX IF NOT EXISTS idx_tasas_credito_electro_empresa
    ON facturacion.tasas_credito_electrodomesticos(empresa_id, periodicidad, numero_cuotas);

-- No más de una tasa VIGENTE (activa) para la misma combinación empresa +
-- periodicidad + cuotas + fecha de inicio de vigencia (pide el requerimiento
-- "no permitir tener más de una tasa vigente para la misma...fecha").
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasas_credito_electro_vigencia
    ON facturacion.tasas_credito_electrodomesticos(empresa_id, periodicidad, numero_cuotas, vigencia_desde)
    WHERE activo = true;

GRANT ALL ON facturacion.tasas_credito_electrodomesticos TO authenticated, service_role;
ALTER TABLE facturacion.tasas_credito_electrodomesticos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasas_credito_electro_empresa" ON facturacion.tasas_credito_electrodomesticos;
CREATE POLICY "tasas_credito_electro_empresa" ON facturacion.tasas_credito_electrodomesticos
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

-- ────────────────────────────────────────────────────────────
-- 4. Cobradores — mismo shape/patrón que facturacion.vendedores
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturacion.cobradores (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id     UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    codigo         TEXT,
    nombres        TEXT NOT NULL,
    identificacion TEXT,
    telefono       TEXT,
    correo         TEXT,
    zona           TEXT,
    estado         TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','baja')),
    fecha_baja     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_by     UUID REFERENCES auth.users,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_by     UUID REFERENCES auth.users
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cobradores_identificacion
    ON facturacion.cobradores(empresa_id, identificacion) WHERE identificacion IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cobradores_empresa ON facturacion.cobradores(empresa_id);

GRANT ALL ON facturacion.cobradores TO authenticated, service_role;
ALTER TABLE facturacion.cobradores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cobradores_empresa" ON facturacion.cobradores;
CREATE POLICY "cobradores_empresa" ON facturacion.cobradores
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

-- ────────────────────────────────────────────────────────────
-- 5. Seriales — concepto 100% nuevo en el proyecto (confirmado: no
--    existía "serial"/"numero_serie" en ningún lado). Se capturan SOLO
--    al vender (no en Ingreso de Compras), según el requerimiento.
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturacion.productos
    ADD COLUMN IF NOT EXISTS controla_serie BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS facturacion.producto_seriales (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id             UUID NOT NULL REFERENCES facturacion.empresas(id) ON DELETE CASCADE,
    producto_id            UUID NOT NULL REFERENCES facturacion.productos(id) ON DELETE RESTRICT,
    serial                 TEXT NOT NULL,
    estado                 TEXT NOT NULL DEFAULT 'vendido' CHECK (estado IN ('vendido','devuelto')),
    comprobante_id         UUID REFERENCES facturacion.comprobantes(id) ON DELETE SET NULL,
    comprobante_detalle_id UUID,
    credito_id             UUID,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_by             UUID REFERENCES auth.users
);

-- El candado real contra doble venta: mismo serial no puede estar
-- "vendido" dos veces para la misma empresa. Un serial devuelto libera
-- el índice (solo cubre estado='vendido') y puede volver a venderse.
CREATE UNIQUE INDEX IF NOT EXISTS uq_producto_seriales_vendido
    ON facturacion.producto_seriales(empresa_id, serial) WHERE estado = 'vendido';
CREATE INDEX IF NOT EXISTS idx_producto_seriales_producto ON facturacion.producto_seriales(producto_id);

GRANT ALL ON facturacion.producto_seriales TO authenticated, service_role;
ALTER TABLE facturacion.producto_seriales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "producto_seriales_empresa" ON facturacion.producto_seriales;
CREATE POLICY "producto_seriales_empresa" ON facturacion.producto_seriales
    FOR ALL USING (empresa_id IN (
        SELECT empresa_id FROM facturacion.profiles         WHERE id      = auth.uid()
        UNION
        SELECT empresa_id FROM facturacion.usuario_empresas WHERE user_id = auth.uid() AND activo = true
    ));

-- ────────────────────────────────────────────────────────────
-- 6. Permisos nuevos — mismo patrón que perm_eliminar_compra
--    (20260802c_perm_eliminar_compra.sql): operativos en true por
--    defecto, los sensibles/irreversibles en false (hay que concederlos
--    a propósito).
-- ────────────────────────────────────────────────────────────
ALTER TABLE facturacion.user_permisos
    ADD COLUMN IF NOT EXISTS perm_cobradores                     BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_credito_electrodomesticos       BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_credito_tasas                   BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_credito_cobros                  BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_credito_documentos               BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS perm_aprobar_excepcion_credito        BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS perm_reversar_pago_credito            BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS perm_anular_credito_electrodomesticos BOOLEAN NOT NULL DEFAULT false;

-- ── Verificación sugerida después de correr esta migración ──
--   SELECT habilita_ventas_electrodomesticos_credito FROM facturacion.empresas LIMIT 5;
--   -- debe salir "false" en todas
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'facturacion' AND table_name IN
--     ('config_credito_electrodomesticos','tasas_credito_electrodomesticos','cobradores','producto_seriales');
