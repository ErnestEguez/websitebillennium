-- ============================================================
-- FIX: RLS + Permisos para schema restaurantes
-- Solo corrige la sección que falló. No toca ninguna otra
-- tabla ni schema (facturacion, public, auth).
-- ============================================================

-- ─────────────────────────────────────────────────────────
-- 0. LIMPIAR POLÍTICAS PARCIALMENTE CREADAS (seguridad)
-- ─────────────────────────────────────────────────────────
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN (
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'restaurantes'
    )
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON restaurantes.%I;',
            pol.policyname, pol.tablename
        );
    END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────
-- 1. ACTIVAR RLS EN TODAS LAS TABLAS DEL SCHEMA
-- ─────────────────────────────────────────────────────────
ALTER TABLE restaurantes.config_empresa         ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurantes.staff                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurantes.categorias             ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurantes.productos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurantes.mesas                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurantes.clientes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurantes.proveedores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurantes.pedidos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurantes.pedido_detalles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurantes.reservas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurantes.caja_sesiones          ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurantes.comprobantes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurantes.comprobante_detalles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurantes.comprobante_pagos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurantes.ingresos_stock         ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurantes.detalle_ingresos_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurantes.kardex                 ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────
-- 2. POLÍTICAS: config_empresa
-- ─────────────────────────────────────────────────────────
CREATE POLICY "config_empresa_select" ON restaurantes.config_empresa
FOR SELECT TO authenticated
USING (restaurantes.is_admin_plataforma() OR empresa_id = restaurantes.get_my_empresa_id());

CREATE POLICY "config_empresa_insert" ON restaurantes.config_empresa
FOR INSERT TO authenticated
WITH CHECK (restaurantes.is_admin_plataforma() OR empresa_id = restaurantes.get_my_empresa_id());

CREATE POLICY "config_empresa_update" ON restaurantes.config_empresa
FOR UPDATE TO authenticated
USING (restaurantes.is_admin_plataforma()
    OR (empresa_id = restaurantes.get_my_empresa_id() AND restaurantes.is_restoflow_oficina()));

CREATE POLICY "config_empresa_delete" ON restaurantes.config_empresa
FOR DELETE TO authenticated
USING (restaurantes.is_admin_plataforma());

-- ─────────────────────────────────────────────────────────
-- 3. POLÍTICAS: staff (portal maneja Auth, staff maneja roles RestoFlow)
-- ─────────────────────────────────────────────────────────
CREATE POLICY "staff_select" ON restaurantes.staff
FOR SELECT TO authenticated
USING (
    id = auth.uid()
    OR restaurantes.is_admin_plataforma()
    OR (empresa_id = restaurantes.get_my_empresa_id() AND restaurantes.is_restoflow_oficina())
);

CREATE POLICY "staff_insert" ON restaurantes.staff
FOR INSERT TO authenticated
WITH CHECK (
    restaurantes.is_admin_plataforma()
    OR (empresa_id = restaurantes.get_my_empresa_id() AND restaurantes.is_restoflow_oficina())
);

CREATE POLICY "staff_update" ON restaurantes.staff
FOR UPDATE TO authenticated
USING (
    id = auth.uid()
    OR restaurantes.is_admin_plataforma()
    OR (empresa_id = restaurantes.get_my_empresa_id() AND restaurantes.is_restoflow_oficina())
);

CREATE POLICY "staff_delete" ON restaurantes.staff
FOR DELETE TO authenticated
USING (
    restaurantes.is_admin_plataforma()
    OR (empresa_id = restaurantes.get_my_empresa_id() AND restaurantes.is_restoflow_oficina())
);

-- ─────────────────────────────────────────────────────────
-- 4. POLÍTICAS GENÉRICAS: tablas con empresa_id directo
--    (excluye tablas hijas y las que tienen políticas propias)
-- ─────────────────────────────────────────────────────────
DO $$
DECLARE tbl TEXT;
BEGIN
    FOR tbl IN (
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'restaurantes'
          AND table_name NOT IN (
              -- Tienen políticas propias (arriba o abajo)
              'config_empresa', 'staff', 'caja_sesiones',
              -- No tienen empresa_id directo (son tablas hijas)
              'pedido_detalles', 'comprobante_detalles',
              'comprobante_pagos', 'detalle_ingresos_stock'
          )
        ORDER BY table_name
    )
    LOOP
        EXECUTE format(
            'CREATE POLICY "%I_policy" ON restaurantes.%I
             FOR ALL TO authenticated
             USING (
                 restaurantes.is_admin_plataforma()
                 OR empresa_id = restaurantes.get_my_empresa_id()
             )
             WITH CHECK (
                 restaurantes.is_admin_plataforma()
                 OR empresa_id = restaurantes.get_my_empresa_id()
             );',
            tbl, tbl
        );
    END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────
-- 5. POLÍTICAS: caja_sesiones (política granular por operación)
-- ─────────────────────────────────────────────────────────
CREATE POLICY "caja_sesiones_select" ON restaurantes.caja_sesiones
FOR SELECT TO authenticated
USING (restaurantes.is_admin_plataforma() OR empresa_id = restaurantes.get_my_empresa_id());

CREATE POLICY "caja_sesiones_insert" ON restaurantes.caja_sesiones
FOR INSERT TO authenticated
WITH CHECK (restaurantes.is_admin_plataforma() OR empresa_id = restaurantes.get_my_empresa_id());

-- Solo el propio usuario puede cerrar su caja (UPDATE)
CREATE POLICY "caja_sesiones_update" ON restaurantes.caja_sesiones
FOR UPDATE TO authenticated
USING (
    restaurantes.is_admin_plataforma()
    OR (empresa_id = restaurantes.get_my_empresa_id() AND usuario_id = auth.uid())
);

CREATE POLICY "caja_sesiones_delete" ON restaurantes.caja_sesiones
FOR DELETE TO authenticated
USING (
    restaurantes.is_admin_plataforma()
    OR (empresa_id = restaurantes.get_my_empresa_id() AND restaurantes.is_restoflow_oficina())
);

-- ─────────────────────────────────────────────────────────
-- 6. POLÍTICAS: tablas hijas (sin empresa_id propio, acceso via FK)
-- ─────────────────────────────────────────────────────────

-- pedido_detalles → acceso vía pedidos.empresa_id
CREATE POLICY "pedido_detalles_policy" ON restaurantes.pedido_detalles
FOR ALL TO authenticated
USING (
    restaurantes.is_admin_plataforma()
    OR EXISTS (
        SELECT 1 FROM restaurantes.pedidos p
        WHERE p.id = pedido_id
          AND p.empresa_id = restaurantes.get_my_empresa_id()
    )
)
WITH CHECK (
    restaurantes.is_admin_plataforma()
    OR EXISTS (
        SELECT 1 FROM restaurantes.pedidos p
        WHERE p.id = pedido_id
          AND p.empresa_id = restaurantes.get_my_empresa_id()
    )
);

-- comprobante_detalles → acceso vía comprobantes.empresa_id
CREATE POLICY "comprobante_detalles_policy" ON restaurantes.comprobante_detalles
FOR ALL TO authenticated
USING (
    restaurantes.is_admin_plataforma()
    OR EXISTS (
        SELECT 1 FROM restaurantes.comprobantes c
        WHERE c.id = comprobante_id
          AND c.empresa_id = restaurantes.get_my_empresa_id()
    )
)
WITH CHECK (
    restaurantes.is_admin_plataforma()
    OR EXISTS (
        SELECT 1 FROM restaurantes.comprobantes c
        WHERE c.id = comprobante_id
          AND c.empresa_id = restaurantes.get_my_empresa_id()
    )
);

-- comprobante_pagos → acceso vía comprobantes.empresa_id
CREATE POLICY "comprobante_pagos_policy" ON restaurantes.comprobante_pagos
FOR ALL TO authenticated
USING (
    restaurantes.is_admin_plataforma()
    OR EXISTS (
        SELECT 1 FROM restaurantes.comprobantes c
        WHERE c.id = comprobante_id
          AND c.empresa_id = restaurantes.get_my_empresa_id()
    )
)
WITH CHECK (
    restaurantes.is_admin_plataforma()
    OR EXISTS (
        SELECT 1 FROM restaurantes.comprobantes c
        WHERE c.id = comprobante_id
          AND c.empresa_id = restaurantes.get_my_empresa_id()
    )
);

-- detalle_ingresos_stock → acceso vía ingresos_stock.empresa_id
CREATE POLICY "detalle_ingresos_stock_policy" ON restaurantes.detalle_ingresos_stock
FOR ALL TO authenticated
USING (
    restaurantes.is_admin_plataforma()
    OR EXISTS (
        SELECT 1 FROM restaurantes.ingresos_stock i
        WHERE i.id = ingreso_id
          AND i.empresa_id = restaurantes.get_my_empresa_id()
    )
)
WITH CHECK (
    restaurantes.is_admin_plataforma()
    OR EXISTS (
        SELECT 1 FROM restaurantes.ingresos_stock i
        WHERE i.id = ingreso_id
          AND i.empresa_id = restaurantes.get_my_empresa_id()
    )
);

-- ─────────────────────────────────────────────────────────
-- 7. PERMISOS
-- ─────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA restaurantes TO authenticated, service_role, anon;

GRANT ALL ON ALL TABLES    IN SCHEMA restaurantes TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA restaurantes TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION restaurantes.get_my_empresa_id()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION restaurantes.is_admin_plataforma()         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION restaurantes.is_restoflow_oficina()        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION restaurantes.crear_pedido_completo(UUID, UUID, UUID, NUMERIC, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION restaurantes.dividir_pedido(UUID, JSONB)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION restaurantes.revertir_division_total(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION restaurantes.reset_empresa_transaccional(UUID) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────
-- 8. RECARGAR SCHEMA
-- ─────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
