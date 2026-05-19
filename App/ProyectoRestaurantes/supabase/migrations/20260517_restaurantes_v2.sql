-- ============================================================
-- MIGRACIÓN COMPLETA v2: Schema restaurantes → Portal Billennium
-- Ejecutar en SQL Editor de Supabase (proyecto del Portal).
-- Solo toca el schema restaurantes. No modifica auth, facturacion ni public.
-- ============================================================

-- ─────────────────────────────────────────────────────────
-- 0. EXTENSIÓN
-- ─────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ─────────────────────────────────────────────────────────
-- 1. FUNCIONES DE SEGURIDAD
--    Leen de facturacion.profiles (portal) — sin crear usuarios propios.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION restaurantes.get_my_empresa_id()
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = facturacion, public
AS $$
BEGIN
  RETURN (
    SELECT empresa_id FROM facturacion.profiles
    WHERE id = auth.uid() LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION restaurantes.is_admin_plataforma()
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = facturacion, public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM facturacion.profiles
    WHERE id = auth.uid() AND rol = 'admin_plataforma'
  );
END;
$$;

CREATE OR REPLACE FUNCTION restaurantes.is_restoflow_oficina()
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = restaurantes, facturacion, public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM facturacion.profiles WHERE id = auth.uid() AND rol = 'admin_plataforma') THEN
    RETURN TRUE;
  END IF;
  IF EXISTS (SELECT 1 FROM facturacion.profiles WHERE id = auth.uid() AND rol = 'oficina') THEN
    RETURN TRUE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM restaurantes.staff
    WHERE id = auth.uid() AND rol = 'oficina' AND estado = 'activo'
  );
END;
$$;


-- ─────────────────────────────────────────────────────────
-- 2. TABLAS
-- ─────────────────────────────────────────────────────────

-- Config RestoFlow por empresa
CREATE TABLE IF NOT EXISTS restaurantes.config_empresa (
    empresa_id     UUID PRIMARY KEY,
    usar_restoflow BOOLEAN DEFAULT TRUE,
    config_sri     JSONB DEFAULT '{}',
    config_general JSONB DEFAULT '{}',
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);

-- Roles específicos RestoFlow (mesero/cocina/oficina) + PIN de salón
-- Auth sigue siendo del portal. Este tabla solo extiende con atributos de RestoFlow.
CREATE TABLE IF NOT EXISTS restaurantes.staff (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    empresa_id  UUID NOT NULL,
    rol         TEXT NOT NULL DEFAULT 'mesero'
                    CHECK (rol IN ('oficina','mesero','cocina')),
    pin         TEXT,
    estado      TEXT DEFAULT 'activo' CHECK (estado IN ('activo','baja')),
    fecha_baja  TIMESTAMPTZ,
    motivo_baja TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Categorías
CREATE TABLE IF NOT EXISTS restaurantes.categorias (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL,
    nombre     TEXT NOT NULL,
    tipo       TEXT DEFAULT 'restaurante',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Productos
CREATE TABLE IF NOT EXISTS restaurantes.productos (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id     UUID NOT NULL,
    categoria_id   UUID REFERENCES restaurantes.categorias(id) ON DELETE SET NULL,
    nombre         TEXT NOT NULL,
    precio_venta   DECIMAL(12,2) DEFAULT 0,
    costo_promedio DECIMAL(12,2) DEFAULT 0,
    stock          DECIMAL(12,2) DEFAULT 0,
    iva_porcentaje DECIMAL(5,2)  DEFAULT 15,
    maneja_stock   BOOLEAN DEFAULT FALSE,
    activo         BOOLEAN DEFAULT TRUE,
    created_at     TIMESTAMPTZ DEFAULT now()
);

-- Mesas
CREATE TABLE IF NOT EXISTS restaurantes.mesas (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL,
    numero     TEXT NOT NULL,
    capacidad  INTEGER DEFAULT 4,
    estado     TEXT DEFAULT 'libre'
                   CHECK (estado IN ('libre','ocupada','reservada','atendida')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Clientes
CREATE TABLE IF NOT EXISTS restaurantes.clientes (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id     UUID NOT NULL,
    identificacion TEXT NOT NULL,
    nombre         TEXT NOT NULL,
    email          TEXT,
    direccion      TEXT,
    telefono       TEXT,
    created_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE (empresa_id, identificacion)
);

-- Proveedores
CREATE TABLE IF NOT EXISTS restaurantes.proveedores (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id       UUID NOT NULL,
    ruc              TEXT NOT NULL,
    nombre_empresa   TEXT NOT NULL,
    nombre_encargado TEXT,
    direccion        TEXT,
    correo           TEXT,
    telefono         TEXT,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Pedidos (cabecera — soporta split check con pedido_padre_id)
CREATE TABLE IF NOT EXISTS restaurantes.pedidos (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL,
    mesa_id             UUID REFERENCES restaurantes.mesas(id) ON DELETE SET NULL,
    mesero_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    estado              TEXT DEFAULT 'pendiente'
                            CHECK (estado IN (
                                'pendiente','en_preparacion','atendido',
                                'facturado','cancelado','servido'
                            )),
    total               DECIMAL(12,2) DEFAULT 0,
    nombre_cliente_mesa TEXT,
    es_division         BOOLEAN DEFAULT FALSE,
    pedido_padre_id     UUID REFERENCES restaurantes.pedidos(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- Pedidos (detalle)
CREATE TABLE IF NOT EXISTS restaurantes.pedido_detalles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pedido_id       UUID NOT NULL REFERENCES restaurantes.pedidos(id) ON DELETE CASCADE,
    producto_id     UUID REFERENCES restaurantes.productos(id) ON DELETE SET NULL,
    cantidad        DECIMAL(12,2) NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    subtotal        DECIMAL(12,2) NOT NULL,
    notas           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Reservas
CREATE TABLE IF NOT EXISTS restaurantes.reservas (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id     UUID NOT NULL,
    mesa_id        UUID REFERENCES restaurantes.mesas(id) ON DELETE CASCADE,
    cliente_nombre TEXT NOT NULL,
    personas       INTEGER DEFAULT 2,
    fecha_hora     TIMESTAMPTZ NOT NULL,
    estado         TEXT DEFAULT 'pendiente'
                       CHECK (estado IN ('pendiente','completada','cancelada')),
    created_at     TIMESTAMPTZ DEFAULT now()
);

-- Sesiones de Caja
CREATE TABLE IF NOT EXISTS restaurantes.caja_sesiones (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id          UUID NOT NULL,
    usuario_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    fecha_apertura      TIMESTAMPTZ DEFAULT now(),
    fecha_cierre        TIMESTAMPTZ,
    base_inicial        DECIMAL(12,2) DEFAULT 0,
    total_efectivo      DECIMAL(12,2) DEFAULT 0,
    total_tarjetas      DECIMAL(12,2) DEFAULT 0,
    total_transferencia DECIMAL(12,2) DEFAULT 0,
    total_otros         DECIMAL(12,2) DEFAULT 0,
    total_propina       DECIMAL(12,2) DEFAULT 0,
    estado              TEXT DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada')),
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- Comprobantes / Facturas (cabecera)
CREATE TABLE IF NOT EXISTS restaurantes.comprobantes (
    id                                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id                         UUID NOT NULL,
    pedido_id                          UUID REFERENCES restaurantes.pedidos(id) ON DELETE SET NULL,
    cliente_id                         UUID REFERENCES restaurantes.clientes(id) ON DELETE SET NULL,
    caja_sesion_id                     UUID REFERENCES restaurantes.caja_sesiones(id) ON DELETE SET NULL,
    secuencial                         TEXT NOT NULL,
    clave_acceso                       TEXT,
    autorizacion_numero                TEXT,
    tipo_comprobante                   TEXT DEFAULT 'FACTURA',
    ambiente                           TEXT DEFAULT 'PRUEBAS',
    total                              DECIMAL(12,2) NOT NULL,
    estado_sri                         TEXT DEFAULT 'PENDIENTE'
                                           CHECK (estado_sri IN (
                                               'PENDIENTE','ENVIADO','AUTORIZADO','RECHAZADO'
                                           )),
    fecha_autorizacion                 TIMESTAMPTZ,
    xml_firmado                        TEXT,
    observaciones_sri                  TEXT,
    sri_utilizacion_sistema_financiero BOOLEAN DEFAULT FALSE,
    created_at                         TIMESTAMPTZ DEFAULT now()
);

-- Comprobante (detalle — snapshot para historial)
CREATE TABLE IF NOT EXISTS restaurantes.comprobante_detalles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comprobante_id  UUID NOT NULL REFERENCES restaurantes.comprobantes(id) ON DELETE CASCADE,
    producto_id     UUID,
    nombre_producto TEXT,
    cantidad        DECIMAL(12,2),
    precio_unitario DECIMAL(12,2),
    subtotal        DECIMAL(12,2),
    iva_porcentaje  DECIMAL(5,2),
    iva_valor       DECIMAL(12,2),
    total           DECIMAL(12,2)
);

-- Comprobante (pagos)
CREATE TABLE IF NOT EXISTS restaurantes.comprobante_pagos (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comprobante_id UUID NOT NULL REFERENCES restaurantes.comprobantes(id) ON DELETE CASCADE,
    metodo_pago    TEXT NOT NULL,
    valor          DECIMAL(12,2) NOT NULL,
    referencia     TEXT
);

-- Ingresos de Stock (cabecera)
CREATE TABLE IF NOT EXISTS restaurantes.ingresos_stock (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id     UUID NOT NULL,
    proveedor_id   UUID REFERENCES restaurantes.proveedores(id) ON DELETE SET NULL,
    numero_factura TEXT,
    fecha_ingreso  DATE DEFAULT CURRENT_DATE,
    observaciones  TEXT,
    total          DECIMAL(12,2) DEFAULT 0,
    created_by     UUID REFERENCES auth.users(id),
    created_at     TIMESTAMPTZ DEFAULT now()
);

-- Detalle Ingresos Stock
CREATE TABLE IF NOT EXISTS restaurantes.detalle_ingresos_stock (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ingreso_id     UUID NOT NULL REFERENCES restaurantes.ingresos_stock(id) ON DELETE CASCADE,
    producto_id    UUID REFERENCES restaurantes.productos(id) ON DELETE SET NULL,
    cantidad       DECIMAL(12,2) NOT NULL,
    costo_unitario DECIMAL(12,2) NOT NULL,
    subtotal       DECIMAL(12,2)
);

-- Kardex (movimientos de inventario)
CREATE TABLE IF NOT EXISTS restaurantes.kardex (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id           UUID NOT NULL,
    producto_id          UUID REFERENCES restaurantes.productos(id) ON DELETE CASCADE,
    fecha                TIMESTAMPTZ DEFAULT now(),
    tipo_movimiento      TEXT NOT NULL CHECK (tipo_movimiento IN ('ENTRADA','SALIDA')),
    motivo               TEXT NOT NULL,
    documento_referencia TEXT,
    cantidad             DECIMAL(12,2) NOT NULL,
    costo_unitario       DECIMAL(12,2),
    saldo_cantidad       DECIMAL(12,2),
    saldo_costo_promedio DECIMAL(12,2),
    created_at           TIMESTAMPTZ DEFAULT now()
);


-- ─────────────────────────────────────────────────────────
-- 3. ÍNDICES
-- ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rest_productos_empresa    ON restaurantes.productos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_rest_mesas_empresa        ON restaurantes.mesas(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_rest_pedidos_empresa      ON restaurantes.pedidos(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_rest_pedidos_mesa         ON restaurantes.pedidos(mesa_id);
CREATE INDEX IF NOT EXISTS idx_rest_pedidos_padre        ON restaurantes.pedidos(pedido_padre_id);
CREATE INDEX IF NOT EXISTS idx_rest_ped_det_pedido       ON restaurantes.pedido_detalles(pedido_id);
CREATE INDEX IF NOT EXISTS idx_rest_comprobantes_emp     ON restaurantes.comprobantes(empresa_id, estado_sri);
CREATE INDEX IF NOT EXISTS idx_rest_comprobantes_pedido  ON restaurantes.comprobantes(pedido_id);
CREATE INDEX IF NOT EXISTS idx_rest_kardex_empresa       ON restaurantes.kardex(empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_rest_kardex_producto      ON restaurantes.kardex(producto_id);
CREATE INDEX IF NOT EXISTS idx_rest_caja_empresa         ON restaurantes.caja_sesiones(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_rest_staff_empresa        ON restaurantes.staff(empresa_id);


-- ─────────────────────────────────────────────────────────
-- 4. TRIGGER updated_at
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION restaurantes.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_config_empresa_upd
    BEFORE UPDATE ON restaurantes.config_empresa
    FOR EACH ROW EXECUTE FUNCTION restaurantes.set_updated_at();

CREATE TRIGGER trg_proveedores_upd
    BEFORE UPDATE ON restaurantes.proveedores
    FOR EACH ROW EXECUTE FUNCTION restaurantes.set_updated_at();


-- ─────────────────────────────────────────────────────────
-- 5. RPCs
-- ─────────────────────────────────────────────────────────

-- 5.1 Crear pedido completo (atómico)
CREATE OR REPLACE FUNCTION restaurantes.crear_pedido_completo(
    p_mesa_id    UUID,
    p_mesero_id  UUID,
    p_empresa_id UUID,
    p_total      NUMERIC,
    p_detalles   JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = restaurantes, public
AS $$
DECLARE
    v_pedido_id UUID;
    v_det       JSONB;
BEGIN
    INSERT INTO restaurantes.pedidos (mesa_id, mesero_id, empresa_id, total, estado)
    VALUES (p_mesa_id, p_mesero_id, p_empresa_id, p_total, 'pendiente')
    RETURNING id INTO v_pedido_id;

    FOR v_det IN SELECT * FROM jsonb_array_elements(p_detalles) LOOP
        INSERT INTO restaurantes.pedido_detalles
            (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
        VALUES (
            v_pedido_id,
            (v_det->>'producto_id')::UUID,
            (v_det->>'cantidad')::NUMERIC,
            (v_det->>'precio_unitario')::NUMERIC,
            (v_det->>'subtotal')::NUMERIC
        );
    END LOOP;

    UPDATE restaurantes.mesas SET estado = 'ocupada' WHERE id = p_mesa_id;

    RETURN jsonb_build_object(
        'id', v_pedido_id, 'mesa_id', p_mesa_id,
        'empresa_id', p_empresa_id, 'estado', 'pendiente', 'total', p_total
    );
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;

-- 5.2 Dividir pedido (split check)
CREATE OR REPLACE FUNCTION restaurantes.dividir_pedido(
    p_pedido_original_id UUID,
    p_nuevos_pedidos     JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = restaurantes, public
AS $$
DECLARE
    v_origen         RECORD;
    v_nuevo_json     JSONB;
    v_item_json      JSONB;
    v_nuevo_id       UUID;
    v_total_nuevo    DECIMAL(12,2);
    v_cantidad_mover DECIMAL(12,2);
    v_padre_id       UUID;
BEGIN
    SELECT * INTO v_origen FROM restaurantes.pedidos WHERE id = p_pedido_original_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;

    v_padre_id := COALESCE(v_origen.pedido_padre_id, v_origen.id);

    FOR v_nuevo_json IN SELECT * FROM jsonb_array_elements(p_nuevos_pedidos) LOOP
        v_total_nuevo := 0;

        INSERT INTO restaurantes.pedidos (
            empresa_id, mesa_id, mesero_id, estado, total,
            nombre_cliente_mesa, es_division, pedido_padre_id, created_at
        ) VALUES (
            v_origen.empresa_id, v_origen.mesa_id, v_origen.mesero_id,
            'pendiente', 0, v_nuevo_json->>'nombre_cliente', TRUE, v_padre_id, NOW()
        ) RETURNING id INTO v_nuevo_id;

        FOR v_item_json IN SELECT * FROM jsonb_array_elements(v_nuevo_json->'items') LOOP
            v_cantidad_mover := (v_item_json->>'cantidad')::DECIMAL;
            v_total_nuevo    := v_total_nuevo + (v_item_json->>'precio')::DECIMAL * v_cantidad_mover;

            INSERT INTO restaurantes.pedido_detalles
                (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
            VALUES (
                v_nuevo_id, (v_item_json->>'producto_id')::UUID,
                v_cantidad_mover, (v_item_json->>'precio')::DECIMAL,
                (v_item_json->>'precio')::DECIMAL * v_cantidad_mover
            );

            UPDATE restaurantes.pedido_detalles
            SET cantidad = cantidad - v_cantidad_mover,
                subtotal = subtotal - (precio_unitario * v_cantidad_mover)
            WHERE pedido_id = p_pedido_original_id
              AND producto_id = (v_item_json->>'producto_id')::UUID;
        END LOOP;

        UPDATE restaurantes.pedidos SET total = v_total_nuevo WHERE id = v_nuevo_id;
    END LOOP;

    DELETE FROM restaurantes.pedido_detalles
    WHERE pedido_id = p_pedido_original_id AND cantidad <= 0.001;

    UPDATE restaurantes.pedidos
    SET total = (SELECT COALESCE(SUM(subtotal),0) FROM restaurantes.pedido_detalles WHERE pedido_id = p_pedido_original_id),
        es_division = TRUE
    WHERE id = p_pedido_original_id;

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error dividiendo pedido: %', SQLERRM;
END;
$$;

-- 5.3 Revertir división
CREATE OR REPLACE FUNCTION restaurantes.revertir_division_total(p_pedido_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = restaurantes, public
AS $$
DECLARE
    v_target    RECORD;
    v_padre_id  UUID;
    v_hijo      RECORD;
    v_item      RECORD;
BEGIN
    SELECT * INTO v_target FROM restaurantes.pedidos WHERE id = p_pedido_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;

    v_padre_id := COALESCE(v_target.pedido_padre_id, v_target.id);

    IF NOT EXISTS (SELECT 1 FROM restaurantes.pedidos WHERE id = v_padre_id AND es_division = TRUE) THEN
        RAISE EXCEPTION 'Este pedido no forma parte de una división activa';
    END IF;

    FOR v_hijo IN SELECT * FROM restaurantes.pedidos WHERE pedido_padre_id = v_padre_id LOOP
        FOR v_item IN SELECT * FROM restaurantes.pedido_detalles WHERE pedido_id = v_hijo.id LOOP
            IF EXISTS (SELECT 1 FROM restaurantes.pedido_detalles WHERE pedido_id = v_padre_id AND producto_id = v_item.producto_id) THEN
                UPDATE restaurantes.pedido_detalles
                SET cantidad = cantidad + v_item.cantidad, subtotal = subtotal + v_item.subtotal
                WHERE pedido_id = v_padre_id AND producto_id = v_item.producto_id;
            ELSE
                INSERT INTO restaurantes.pedido_detalles (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
                VALUES (v_padre_id, v_item.producto_id, v_item.cantidad, v_item.precio_unitario, v_item.subtotal);
            END IF;
        END LOOP;
        DELETE FROM restaurantes.pedidos WHERE id = v_hijo.id;
    END LOOP;

    UPDATE restaurantes.pedidos
    SET total = (SELECT COALESCE(SUM(subtotal),0) FROM restaurantes.pedido_detalles WHERE pedido_id = v_padre_id),
        es_division = FALSE, nombre_cliente_mesa = NULL
    WHERE id = v_padre_id;

    RETURN jsonb_build_object('success', true, 'padre_id', v_padre_id);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error revirtiendo división: %', SQLERRM;
END;
$$;

-- 5.4 Reseteo transaccional (borra movimientos, conserva maestros)
CREATE OR REPLACE FUNCTION restaurantes.reset_empresa_transaccional(p_empresa_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = restaurantes, public
AS $$
BEGIN
    DELETE FROM restaurantes.comprobante_pagos
    WHERE comprobante_id IN (SELECT id FROM restaurantes.comprobantes WHERE empresa_id = p_empresa_id);
    DELETE FROM restaurantes.comprobante_detalles
    WHERE comprobante_id IN (SELECT id FROM restaurantes.comprobantes WHERE empresa_id = p_empresa_id);
    DELETE FROM restaurantes.comprobantes    WHERE empresa_id = p_empresa_id;

    DELETE FROM restaurantes.pedido_detalles
    WHERE pedido_id IN (SELECT id FROM restaurantes.pedidos WHERE empresa_id = p_empresa_id);
    DELETE FROM restaurantes.pedidos         WHERE empresa_id = p_empresa_id;

    DELETE FROM restaurantes.kardex          WHERE empresa_id = p_empresa_id;
    DELETE FROM restaurantes.reservas        WHERE empresa_id = p_empresa_id;
    DELETE FROM restaurantes.caja_sesiones   WHERE empresa_id = p_empresa_id;

    DELETE FROM restaurantes.detalle_ingresos_stock
    WHERE ingreso_id IN (SELECT id FROM restaurantes.ingresos_stock WHERE empresa_id = p_empresa_id);
    DELETE FROM restaurantes.ingresos_stock  WHERE empresa_id = p_empresa_id;

    UPDATE restaurantes.productos SET stock = 0, costo_promedio = 0 WHERE empresa_id = p_empresa_id;
    UPDATE restaurantes.mesas     SET estado = 'libre'              WHERE empresa_id = p_empresa_id;

    RETURN jsonb_build_object('success', TRUE, 'message', 'Reseteo completo.');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;


-- ─────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY
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

-- ── config_empresa ─────────────────────────
CREATE POLICY "cfg_select" ON restaurantes.config_empresa FOR SELECT TO authenticated
USING (restaurantes.is_admin_plataforma() OR empresa_id = restaurantes.get_my_empresa_id());

CREATE POLICY "cfg_insert" ON restaurantes.config_empresa FOR INSERT TO authenticated
WITH CHECK (restaurantes.is_admin_plataforma() OR empresa_id = restaurantes.get_my_empresa_id());

CREATE POLICY "cfg_update" ON restaurantes.config_empresa FOR UPDATE TO authenticated
USING (restaurantes.is_admin_plataforma() OR (empresa_id = restaurantes.get_my_empresa_id() AND restaurantes.is_restoflow_oficina()));

CREATE POLICY "cfg_delete" ON restaurantes.config_empresa FOR DELETE TO authenticated
USING (restaurantes.is_admin_plataforma());

-- ── staff ─────────────────────────────────
CREATE POLICY "staff_select" ON restaurantes.staff FOR SELECT TO authenticated
USING (id = auth.uid() OR restaurantes.is_admin_plataforma()
    OR (empresa_id = restaurantes.get_my_empresa_id() AND restaurantes.is_restoflow_oficina()));

CREATE POLICY "staff_insert" ON restaurantes.staff FOR INSERT TO authenticated
WITH CHECK (restaurantes.is_admin_plataforma()
    OR (empresa_id = restaurantes.get_my_empresa_id() AND restaurantes.is_restoflow_oficina()));

CREATE POLICY "staff_update" ON restaurantes.staff FOR UPDATE TO authenticated
USING (id = auth.uid() OR restaurantes.is_admin_plataforma()
    OR (empresa_id = restaurantes.get_my_empresa_id() AND restaurantes.is_restoflow_oficina()));

CREATE POLICY "staff_delete" ON restaurantes.staff FOR DELETE TO authenticated
USING (restaurantes.is_admin_plataforma()
    OR (empresa_id = restaurantes.get_my_empresa_id() AND restaurantes.is_restoflow_oficina()));

-- ── Tablas con empresa_id directo (macro) ──
-- EXCLUYE: config_empresa, staff, caja_sesiones (tienen políticas propias)
-- EXCLUYE: pedido_detalles, comprobante_detalles, comprobante_pagos, detalle_ingresos_stock (sin empresa_id)
DO $$
DECLARE tbl TEXT;
BEGIN
    FOR tbl IN (
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'restaurantes'
          AND table_name IN (
              'categorias','productos','mesas','clientes','proveedores',
              'pedidos','reservas','comprobantes','ingresos_stock','kardex'
          )
        ORDER BY table_name
    )
    LOOP
        EXECUTE format(
            'CREATE POLICY "%I_policy" ON restaurantes.%I
             FOR ALL TO authenticated
             USING  (restaurantes.is_admin_plataforma() OR empresa_id = restaurantes.get_my_empresa_id())
             WITH CHECK (restaurantes.is_admin_plataforma() OR empresa_id = restaurantes.get_my_empresa_id());',
            tbl, tbl
        );
    END LOOP;
END $$;

-- ── caja_sesiones (granular por operación) ─
CREATE POLICY "caja_select" ON restaurantes.caja_sesiones FOR SELECT TO authenticated
USING (restaurantes.is_admin_plataforma() OR empresa_id = restaurantes.get_my_empresa_id());

CREATE POLICY "caja_insert" ON restaurantes.caja_sesiones FOR INSERT TO authenticated
WITH CHECK (restaurantes.is_admin_plataforma() OR empresa_id = restaurantes.get_my_empresa_id());

CREATE POLICY "caja_update" ON restaurantes.caja_sesiones FOR UPDATE TO authenticated
USING (restaurantes.is_admin_plataforma()
    OR (empresa_id = restaurantes.get_my_empresa_id() AND usuario_id = auth.uid()));

CREATE POLICY "caja_delete" ON restaurantes.caja_sesiones FOR DELETE TO authenticated
USING (restaurantes.is_admin_plataforma()
    OR (empresa_id = restaurantes.get_my_empresa_id() AND restaurantes.is_restoflow_oficina()));

-- ── Tablas hijas (sin empresa_id, acceso via FK) ─
CREATE POLICY "ped_det_policy" ON restaurantes.pedido_detalles FOR ALL TO authenticated
USING (restaurantes.is_admin_plataforma() OR EXISTS (
    SELECT 1 FROM restaurantes.pedidos p
    WHERE p.id = pedido_id AND p.empresa_id = restaurantes.get_my_empresa_id()))
WITH CHECK (restaurantes.is_admin_plataforma() OR EXISTS (
    SELECT 1 FROM restaurantes.pedidos p
    WHERE p.id = pedido_id AND p.empresa_id = restaurantes.get_my_empresa_id()));

CREATE POLICY "comp_det_policy" ON restaurantes.comprobante_detalles FOR ALL TO authenticated
USING (restaurantes.is_admin_plataforma() OR EXISTS (
    SELECT 1 FROM restaurantes.comprobantes c
    WHERE c.id = comprobante_id AND c.empresa_id = restaurantes.get_my_empresa_id()))
WITH CHECK (restaurantes.is_admin_plataforma() OR EXISTS (
    SELECT 1 FROM restaurantes.comprobantes c
    WHERE c.id = comprobante_id AND c.empresa_id = restaurantes.get_my_empresa_id()));

CREATE POLICY "comp_pago_policy" ON restaurantes.comprobante_pagos FOR ALL TO authenticated
USING (restaurantes.is_admin_plataforma() OR EXISTS (
    SELECT 1 FROM restaurantes.comprobantes c
    WHERE c.id = comprobante_id AND c.empresa_id = restaurantes.get_my_empresa_id()))
WITH CHECK (restaurantes.is_admin_plataforma() OR EXISTS (
    SELECT 1 FROM restaurantes.comprobantes c
    WHERE c.id = comprobante_id AND c.empresa_id = restaurantes.get_my_empresa_id()));

CREATE POLICY "det_ing_policy" ON restaurantes.detalle_ingresos_stock FOR ALL TO authenticated
USING (restaurantes.is_admin_plataforma() OR EXISTS (
    SELECT 1 FROM restaurantes.ingresos_stock i
    WHERE i.id = ingreso_id AND i.empresa_id = restaurantes.get_my_empresa_id()))
WITH CHECK (restaurantes.is_admin_plataforma() OR EXISTS (
    SELECT 1 FROM restaurantes.ingresos_stock i
    WHERE i.id = ingreso_id AND i.empresa_id = restaurantes.get_my_empresa_id()));


-- ─────────────────────────────────────────────────────────
-- 7. PERMISOS
-- ─────────────────────────────────────────────────────────
GRANT USAGE  ON SCHEMA restaurantes TO authenticated, service_role, anon;
GRANT ALL    ON ALL TABLES    IN SCHEMA restaurantes TO authenticated, service_role;
GRANT ALL    ON ALL SEQUENCES IN SCHEMA restaurantes TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION restaurantes.get_my_empresa_id()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION restaurantes.is_admin_plataforma()         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION restaurantes.is_restoflow_oficina()        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION restaurantes.set_updated_at()              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION restaurantes.crear_pedido_completo(UUID,UUID,UUID,NUMERIC,JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION restaurantes.dividir_pedido(UUID,JSONB)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION restaurantes.revertir_division_total(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION restaurantes.reset_empresa_transaccional(UUID) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────
-- 8. RECARGAR SCHEMA
-- ─────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
