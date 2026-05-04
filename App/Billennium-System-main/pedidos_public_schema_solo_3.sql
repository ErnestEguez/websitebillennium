
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE FUNCTION pedidosbillennium.delete_articulos_empresa(p_empresa_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$

DECLARE

  deleted_detalle_count integer;

  deleted_articulos_count integer;

BEGIN
  DELETE FROM pedidosbillennium.proforma_detalle
  WHERE articulo_id IN (
    SELECT id FROM pedidosbillennium.articulos WHERE empresa_id = p_empresa_id
  );
  GET DIAGNOSTICS deleted_detalle_count = ROW_COUNT;
  DELETE FROM pedidosbillennium.articulos
  WHERE empresa_id = p_empresa_id;
  GET DIAGNOSTICS deleted_articulos_count = ROW_COUNT;
  RETURN json_build_object(
    'success', true,
    'deleted_articulos', deleted_articulos_count,
    'deleted_detalle', deleted_detalle_count,
    'empresa_id', p_empresa_id
  );
END;
$$;
CREATE FUNCTION pedidosbillennium.es_admin() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM vendedores WHERE id = auth.uid()::text),
    false
  );
$$;
CREATE FUNCTION pedidosbillennium.generar_numero_pedido(p_empresa_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pedidosbillennium', 'public', 'pg_temp'
    AS $_$
DECLARE
ultimo_numero integer;
nuevo_numero text;
BEGIN
SELECT COALESCE(MAX(CAST(numero AS integer)), 0)
INTO ultimo_numero
FROM pedido_cabecera
WHERE empresa_id = p_empresa_id AND numero ~ '^[0-9]+$';
nuevo_numero := LPAD((ultimo_numero + 1)::text, 6, '0');
RETURN nuevo_numero;
END;
$_$;
CREATE FUNCTION pedidosbillennium.generar_numero_proforma(p_empresa_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pedidosbillennium', 'public', 'pg_temp'
    AS $_$
DECLARE
ultimo_numero integer;
nuevo_numero text;
BEGIN
SELECT COALESCE(MAX(CAST(numero AS integer)), 0)
INTO ultimo_numero
FROM proforma_cabecera
WHERE empresa_id = p_empresa_id AND numero ~ '^[0-9]+$';
nuevo_numero := LPAD((ultimo_numero + 1)::text, 6, '0');
RETURN nuevo_numero;
END;
$_$;
CREATE FUNCTION pedidosbillennium.get_my_email() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN (SELECT email FROM vendedores WHERE id = auth.uid()::text);
END;
$$;
CREATE FUNCTION pedidosbillennium.get_my_empresa_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pedidosbillennium', 'public'
    AS $$
BEGIN
  RETURN (SELECT empresa_id FROM vendedores WHERE id = auth.uid()::text);
END;
$$;
CREATE FUNCTION pedidosbillennium.ic_insert_factura(p_cfac_numero integer, p_cfac_tipo character varying, p_cfac_fecfact timestamp without time zone, p_cfac_bodega integer, p_cfac_codigo bigint, p_cfac_cliente text, p_cfac_total numeric, p_cfac_dcto numeric, p_cfac_iva numeric, p_cfac_numfact character varying, p_cfac_transp character varying, p_cfac_comenta text, p_detalle jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_ic_id integer;
    v_item  jsonb;
BEGIN
    DELETE FROM pedidosbillennium."IC_FacturaDet"
    WHERE "CFac_Numero" = p_cfac_numero
      AND "CFac_Tipo"   = p_cfac_tipo;
    DELETE FROM pedidosbillennium."IC_FacturaCab"
    WHERE "CFac_Numero" = p_cfac_numero
      AND "CFac_Tipo"   = p_cfac_tipo
      AND "CFac_Codigo" = p_cfac_codigo;
    INSERT INTO pedidosbillennium."IC_FacturaCab" (
        "CFac_Numero","CFac_Tipo","CFac_Fecfact","CFac_Bodega",
        "CFac_Codigo","CFac_Cliente",
        "CFac_Total","CFac_Dcto","CFac_Iva",
        "CFac_NumFact","CFac_Transporte","Cfac_Comenta"
    )
    VALUES (
        p_cfac_numero,p_cfac_tipo,p_cfac_fecfact,p_cfac_bodega,
        p_cfac_codigo,p_cfac_cliente,
        p_cfac_total,p_cfac_dcto,p_cfac_iva,
        p_cfac_numfact,p_cfac_transp,p_cfac_comenta
    )
    RETURNING "IC_Id" INTO v_ic_id;
    FOR v_item IN SELECT jsonb_array_elements(p_detalle)
    LOOP
        INSERT INTO pedidosbillennium."IC_FacturaDet"(
            "IC_Id",
            "CFac_Numero","CFac_Tipo","DFac_Codigo",
            "DFac_Fecha","DFac_Bodega",
            "DFac_CodItem","DFac_Cantidad",
            "DFac_Precio","DFac_Costo",
            "DFac_Total","DFac_Iva"
        )
        VALUES (
            v_ic_id,
            p_cfac_numero,p_cfac_tipo,
            (v_item->>'DFac_Codigo')::integer,
            (v_item->>'DFac_Fecha')::timestamp,
            (v_item->>'DFac_Bodega')::integer,
            v_item->>'DFac_CodItem',
            (v_item->>'DFac_Cantidad')::numeric,
            (v_item->>'DFac_Precio')::numeric,
            (v_item->>'DFac_Costo')::numeric,
            (v_item->>'DFac_Total')::numeric,
            (v_item->>'DFac_Iva')::numeric
        );
    END LOOP;
END;
$$;
CREATE FUNCTION pedidosbillennium.is_admin() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pedidosbillennium', 'public'
    AS $$
BEGIN
  RETURN COALESCE((SELECT is_admin FROM vendedores WHERE id = auth.uid()::text), false);
END;
$$;
CREATE FUNCTION pedidosbillennium.is_office() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pedidosbillennium', 'public'
    AS $$
BEGIN
  RETURN COALESCE((SELECT is_office FROM vendedores WHERE id = auth.uid()::text), false);
END;
$$;
CREATE FUNCTION pedidosbillennium.limpiar_politicas(p_tabla text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = p_tabla AND schemaname = 'pedidosbillennium') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, p_tabla);
    END LOOP;
END;
$$;
CREATE FUNCTION pedidosbillennium.prevent_admin_modification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pedidosbillennium', 'public', 'pg_temp'
    AS $$
BEGIN
IF OLD.is_admin = true AND NEW.is_admin = false THEN
RAISE EXCEPTION 'No se puede quitar el rol de administrador';
END IF;
RETURN NEW;
END;
$$;
CREATE FUNCTION pedidosbillennium.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pedidosbillennium', 'public', 'pg_temp'
    AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$;
SET default_tablespace = '';
SET default_table_access_method = heap;
CREATE TABLE pedidosbillennium.articulos (
    id text NOT NULL,
    descripcion text NOT NULL,
    precio numeric(18,2) DEFAULT 0,
    costo numeric(18,2) DEFAULT 0,
    stock numeric(18,2) DEFAULT 0,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    empresa_id uuid NOT NULL,
    tasa_iva numeric DEFAULT '0'::numeric
);
CREATE TABLE pedidosbillennium.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id uuid NOT NULL,
    sender_id text NOT NULL,
    content text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE pedidosbillennium.chat_rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    vendedor_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE pedidosbillennium.clientes (
    ruc character varying(13) NOT NULL,
    nombres_completos text NOT NULL,
    correo text,
    telefono character varying(20),
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    nombre_negocio text,
    empresa_id uuid
);
CREATE TABLE pedidosbillennium.empresas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ruc character varying(13) NOT NULL,
    nombre_comercial text NOT NULL,
    representante_legal text NOT NULL,
    direccion text NOT NULL,
    telefonos text NOT NULL,
    correos text NOT NULL,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    logo_url text,
    habilitar_proformas boolean DEFAULT true,
    habilitar_pedidos boolean DEFAULT true
);
CREATE TABLE pedidosbillennium.ic_facturacab (
    ic_id integer NOT NULL,
    cfac_numero integer NOT NULL,
    cfac_tipo character varying(2) NOT NULL,
    cfac_fecfact timestamp without time zone NOT NULL,
    cfac_bodega integer NOT NULL,
    cfac_codigo bigint NOT NULL,
    cfac_cliente text,
    cfac_total numeric(18,4),
    cfac_dcto numeric(18,4),
    cfac_iva numeric(18,4),
    cfac_numfact character varying(50),
    cfac_transporte character varying(50),
    cfac_comenta text,
    cfac_autoriza character varying(50),
    estado character varying(20) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    fechacreacion timestamp without time zone DEFAULT now() NOT NULL,
    fechaprocesado timestamp without time zone
);
ALTER TABLE pedidosbillennium.ic_facturacab ALTER COLUMN ic_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pedidosbillennium.ic_facturacab_ic_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE pedidosbillennium.ic_facturadet (
    icdet_id integer NOT NULL,
    ic_id integer NOT NULL,
    cfac_numero integer NOT NULL,
    cfac_tipo character varying(2) NOT NULL,
    dfac_codigo integer NOT NULL,
    dfac_fecha timestamp without time zone NOT NULL,
    dfac_bodega integer NOT NULL,
    dfac_coditem character varying(50) NOT NULL,
    dfac_cantidad numeric(18,4) NOT NULL,
    dfac_precio numeric(18,4) NOT NULL,
    dfac_costo numeric(18,4),
    dfac_total numeric(18,4),
    dfac_iva numeric(18,4),
    fechacreacion timestamp without time zone DEFAULT now() NOT NULL
);
ALTER TABLE pedidosbillennium.ic_facturadet ALTER COLUMN icdet_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME pedidosbillennium.ic_facturadet_icdet_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE pedidosbillennium.pedido_cabecera (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero text,
    ruc_cliente text NOT NULL,
    nombre_cliente text NOT NULL,
    vendedor_id text,
    subtotal numeric DEFAULT 0,
    total numeric DEFAULT 0,
    estado text DEFAULT 'Pendiente'::text,
    sincronizada boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    cliente_ruc character varying,
    forma_pago text,
    observaciones text,
    fecha_procesado timestamp with time zone,
    impuesto numeric DEFAULT 0,
    empresa_id uuid,
    fecha_autorizacion timestamp with time zone,
    autorizada_por text,
    codven_erp smallint,
    numero_factura text
);
CREATE TABLE pedidosbillennium.pedido_detalle (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pedido_id uuid,
    articulo_id text NOT NULL,
    descripcion text NOT NULL,
    cantidad numeric NOT NULL,
    precio numeric NOT NULL,
    costo numeric NOT NULL,
    subtotal numeric NOT NULL,
    utilidad_porcentaje numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    empresa_id uuid NOT NULL,
    tasa_iva numeric
);
CREATE TABLE pedidosbillennium.proforma_cabecera (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero text,
    ruc_cliente text NOT NULL,
    nombre_cliente text NOT NULL,
    vendedor_id text,
    subtotal numeric DEFAULT 0,
    total numeric DEFAULT 0,
    estado text DEFAULT 'PENDIENTE'::text,
    sincronizada boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    cliente_ruc character varying(13),
    forma_pago text,
    observaciones text,
    fecha_procesado timestamp with time zone,
    impuesto numeric DEFAULT 0,
    empresa_id uuid,
    fecha_autorizacion timestamp with time zone,
    autorizada_por text,
    codven_erp smallint
);
CREATE TABLE pedidosbillennium.proforma_detalle (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    proforma_id uuid,
    articulo_id text NOT NULL,
    descripcion text NOT NULL,
    cantidad numeric NOT NULL,
    precio numeric NOT NULL,
    costo numeric NOT NULL,
    subtotal numeric NOT NULL,
    utilidad_porcentaje numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    empresa_id uuid NOT NULL,
    tasa_iva numeric
);
CREATE TABLE pedidosbillennium.vendedores (
    id text NOT NULL,
    nombre text NOT NULL,
    email text,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    telefono text,
    empresa_id uuid,
    is_admin boolean DEFAULT false,
    user_id uuid,
    codven_erp smallint,
    is_office boolean DEFAULT false
);
ALTER TABLE ONLY pedidosbillennium.articulos
    ADD CONSTRAINT articulos_pkey PRIMARY KEY (id, empresa_id);
ALTER TABLE ONLY pedidosbillennium.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pedidosbillennium.chat_rooms
    ADD CONSTRAINT chat_rooms_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pedidosbillennium.chat_rooms
    ADD CONSTRAINT chat_rooms_vendedor_id_key UNIQUE (vendedor_id);
ALTER TABLE ONLY pedidosbillennium.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (ruc);
ALTER TABLE ONLY pedidosbillennium.empresas
    ADD CONSTRAINT empresas_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pedidosbillennium.empresas
    ADD CONSTRAINT empresas_ruc_key UNIQUE (ruc);
ALTER TABLE ONLY pedidosbillennium.ic_facturacab
    ADD CONSTRAINT ic_facturacab_cfac_numero_cfac_tipo_key UNIQUE (cfac_numero, cfac_tipo);
ALTER TABLE ONLY pedidosbillennium.ic_facturacab
    ADD CONSTRAINT ic_facturacab_pkey PRIMARY KEY (ic_id);
ALTER TABLE ONLY pedidosbillennium.ic_facturadet
    ADD CONSTRAINT ic_facturadet_pkey PRIMARY KEY (icdet_id);
ALTER TABLE ONLY pedidosbillennium.pedido_cabecera
    ADD CONSTRAINT pedido_cabecera_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pedidosbillennium.pedido_detalle
    ADD CONSTRAINT pedido_detalle_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pedidosbillennium.proforma_cabecera
    ADD CONSTRAINT proforma_cabecera_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pedidosbillennium.proforma_detalle
    ADD CONSTRAINT proforma_detalle_pkey PRIMARY KEY (id);
ALTER TABLE ONLY pedidosbillennium.vendedores
    ADD CONSTRAINT vendedores_pkey PRIMARY KEY (id);
CREATE INDEX idx_articulos_descripcion ON pedidosbillennium.articulos USING btree (descripcion);
CREATE INDEX idx_articulos_empresa_id ON pedidosbillennium.articulos USING btree (empresa_id);
CREATE INDEX idx_clientes_ruc ON pedidosbillennium.clientes USING btree (ruc);
CREATE INDEX idx_pedido_cabecera_autorizada_por ON pedidosbillennium.pedido_cabecera USING btree (autorizada_por);
CREATE INDEX idx_pedido_cabecera_cliente_ruc ON pedidosbillennium.pedido_cabecera USING btree (cliente_ruc);
CREATE INDEX idx_pedido_cabecera_empresa ON pedidosbillennium.pedido_cabecera USING btree (empresa_id);
CREATE INDEX idx_pedido_cabecera_empresa_id ON pedidosbillennium.pedido_cabecera USING btree (empresa_id);
CREATE INDEX idx_pedido_cabecera_estado ON pedidosbillennium.pedido_cabecera USING btree (estado);
CREATE INDEX idx_pedido_cabecera_vendedor ON pedidosbillennium.pedido_cabecera USING btree (vendedor_id);
CREATE INDEX idx_pedido_detalle_articulo_id ON pedidosbillennium.pedido_detalle USING btree (articulo_id, empresa_id);
CREATE INDEX idx_pedido_detalle_pedido ON pedidosbillennium.pedido_detalle USING btree (pedido_id);
CREATE INDEX idx_pedidos_empresa ON pedidosbillennium.pedido_cabecera USING btree (empresa_id);
CREATE INDEX idx_pedidos_estado ON pedidosbillennium.pedido_cabecera USING btree (estado);
CREATE INDEX idx_pedidos_fecha ON pedidosbillennium.pedido_cabecera USING btree (created_at);
CREATE INDEX idx_proforma_cabecera_autorizada_por ON pedidosbillennium.proforma_cabecera USING btree (autorizada_por);
CREATE INDEX idx_proforma_cabecera_cliente_ruc ON pedidosbillennium.proforma_cabecera USING btree (cliente_ruc);
CREATE INDEX idx_proforma_cabecera_created ON pedidosbillennium.proforma_cabecera USING btree (created_at);
CREATE INDEX idx_proforma_cabecera_empresa_id ON pedidosbillennium.proforma_cabecera USING btree (empresa_id);
CREATE INDEX idx_proforma_cabecera_estado ON pedidosbillennium.proforma_cabecera USING btree (estado);
CREATE INDEX idx_proforma_cabecera_sincronizada ON pedidosbillennium.proforma_cabecera USING btree (sincronizada);
CREATE INDEX idx_proforma_cabecera_vendedor ON pedidosbillennium.proforma_cabecera USING btree (vendedor_id);
CREATE INDEX idx_proforma_detalle_articulo_empresa ON pedidosbillennium.proforma_detalle USING btree (articulo_id, empresa_id);
CREATE INDEX idx_proforma_detalle_proforma_id ON pedidosbillennium.proforma_detalle USING btree (proforma_id);
CREATE INDEX idx_vendedores_empresa_id ON pedidosbillennium.vendedores USING btree (empresa_id);
CREATE TRIGGER protect_admin_privileges BEFORE UPDATE ON pedidosbillennium.vendedores FOR EACH ROW EXECUTE FUNCTION pedidosbillennium.prevent_admin_modification();
CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON pedidosbillennium.clientes FOR EACH ROW EXECUTE FUNCTION pedidosbillennium.update_updated_at_column();
CREATE TRIGGER update_empresas_updated_at BEFORE UPDATE ON pedidosbillennium.empresas FOR EACH ROW EXECUTE FUNCTION pedidosbillennium.update_updated_at_column();
CREATE TRIGGER update_pedido_cabecera_updated_at BEFORE UPDATE ON pedidosbillennium.pedido_cabecera FOR EACH ROW EXECUTE FUNCTION pedidosbillennium.update_updated_at_column();
CREATE TRIGGER update_proforma_cabecera_updated_at BEFORE UPDATE ON pedidosbillennium.proforma_cabecera FOR EACH ROW EXECUTE FUNCTION pedidosbillennium.update_updated_at_column();
CREATE TRIGGER update_vendedores_updated_at BEFORE UPDATE ON pedidosbillennium.vendedores FOR EACH ROW EXECUTE FUNCTION pedidosbillennium.update_updated_at_column();
ALTER TABLE ONLY pedidosbillennium.chat_messages
    ADD CONSTRAINT chat_messages_room_id_fkey FOREIGN KEY (room_id) REFERENCES pedidosbillennium.chat_rooms(id) ON DELETE CASCADE;
ALTER TABLE ONLY pedidosbillennium.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES pedidosbillennium.vendedores(id);
ALTER TABLE ONLY pedidosbillennium.chat_rooms
    ADD CONSTRAINT chat_rooms_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES pedidosbillennium.empresas(id) ON DELETE CASCADE;
ALTER TABLE ONLY pedidosbillennium.chat_rooms
    ADD CONSTRAINT chat_rooms_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES pedidosbillennium.vendedores(id) ON DELETE CASCADE;
ALTER TABLE ONLY pedidosbillennium.clientes
    ADD CONSTRAINT clientes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES pedidosbillennium.empresas(id);
ALTER TABLE ONLY pedidosbillennium.ic_facturadet
    ADD CONSTRAINT fk_icdet_iccab FOREIGN KEY (ic_id) REFERENCES pedidosbillennium.ic_facturacab(ic_id);
ALTER TABLE ONLY pedidosbillennium.pedido_cabecera
    ADD CONSTRAINT pedido_cabecera_autorizada_por_fkey FOREIGN KEY (autorizada_por) REFERENCES pedidosbillennium.vendedores(id);
ALTER TABLE ONLY pedidosbillennium.pedido_cabecera
    ADD CONSTRAINT pedido_cabecera_cliente_ruc_fkey FOREIGN KEY (cliente_ruc) REFERENCES pedidosbillennium.clientes(ruc);
ALTER TABLE ONLY pedidosbillennium.pedido_cabecera
    ADD CONSTRAINT pedido_cabecera_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES pedidosbillennium.empresas(id);
ALTER TABLE ONLY pedidosbillennium.pedido_cabecera
    ADD CONSTRAINT pedido_cabecera_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES pedidosbillennium.vendedores(id);
ALTER TABLE ONLY pedidosbillennium.pedido_detalle
    ADD CONSTRAINT pedido_detalle_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidosbillennium.pedido_cabecera(id) ON DELETE CASCADE;
ALTER TABLE ONLY pedidosbillennium.proforma_cabecera
    ADD CONSTRAINT proforma_cabecera_autorizada_por_fkey FOREIGN KEY (autorizada_por) REFERENCES pedidosbillennium.vendedores(id);
ALTER TABLE ONLY pedidosbillennium.proforma_cabecera
    ADD CONSTRAINT proforma_cabecera_cliente_ruc_fkey FOREIGN KEY (cliente_ruc) REFERENCES pedidosbillennium.clientes(ruc);
ALTER TABLE ONLY pedidosbillennium.proforma_cabecera
    ADD CONSTRAINT proforma_cabecera_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES pedidosbillennium.empresas(id);
ALTER TABLE ONLY pedidosbillennium.proforma_cabecera
    ADD CONSTRAINT proforma_cabecera_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES pedidosbillennium.vendedores(id);
ALTER TABLE ONLY pedidosbillennium.proforma_detalle
    ADD CONSTRAINT proforma_detalle_proforma_id_fkey FOREIGN KEY (proforma_id) REFERENCES pedidosbillennium.proforma_cabecera(id) ON DELETE CASCADE;
ALTER TABLE ONLY pedidosbillennium.vendedores
    ADD CONSTRAINT vendedores_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES pedidosbillennium.empresas(id);
ALTER TABLE pedidosbillennium.articulos ENABLE ROW LEVEL SECURITY;
CREATE POLICY articulos_all_policy ON pedidosbillennium.articulos TO authenticated USING ((empresa_id = pedidosbillennium.get_my_empresa_id())) WITH CHECK ((empresa_id = pedidosbillennium.get_my_empresa_id()));
ALTER TABLE pedidosbillennium.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidosbillennium.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidosbillennium.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY clientes_all_policy ON pedidosbillennium.clientes TO authenticated USING (((empresa_id = pedidosbillennium.get_my_empresa_id()) OR (empresa_id IS NULL))) WITH CHECK (((empresa_id = pedidosbillennium.get_my_empresa_id()) OR (empresa_id IS NULL)));
ALTER TABLE pedidosbillennium.empresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY empresas_select_all ON pedidosbillennium.empresas FOR SELECT TO authenticated USING (true);
ALTER TABLE pedidosbillennium.ic_facturacab ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidosbillennium.ic_facturadet ENABLE ROW LEVEL SECURITY;
CREATE POLICY messages_delete_office ON pedidosbillennium.chat_messages FOR DELETE TO authenticated USING ((pedidosbillennium.is_office() AND (EXISTS ( SELECT 1
   FROM pedidosbillennium.chat_rooms r
  WHERE ((r.id = chat_messages.room_id) AND (r.empresa_id = pedidosbillennium.get_my_empresa_id()))))));
CREATE POLICY messages_insert_all ON pedidosbillennium.chat_messages FOR INSERT TO authenticated WITH CHECK ((sender_id = (auth.uid())::text));
CREATE POLICY messages_insert_office ON pedidosbillennium.chat_messages FOR INSERT TO authenticated WITH CHECK ((pedidosbillennium.is_office() AND (EXISTS ( SELECT 1
   FROM pedidosbillennium.chat_rooms r
  WHERE ((r.id = chat_messages.room_id) AND (r.empresa_id = pedidosbillennium.get_my_empresa_id()))))));
CREATE POLICY messages_select_admin ON pedidosbillennium.chat_messages FOR SELECT TO authenticated USING (pedidosbillennium.is_admin());
CREATE POLICY messages_select_all_office ON pedidosbillennium.chat_messages FOR SELECT TO authenticated USING ((pedidosbillennium.is_office() AND (EXISTS ( SELECT 1
   FROM pedidosbillennium.chat_rooms r
  WHERE ((r.id = chat_messages.room_id) AND (r.empresa_id = pedidosbillennium.get_my_empresa_id()))))));
CREATE POLICY messages_select_oficina ON pedidosbillennium.chat_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM pedidosbillennium.chat_rooms r
  WHERE ((r.id = chat_messages.room_id) AND (r.empresa_id = pedidosbillennium.get_my_empresa_id())))));
CREATE POLICY messages_select_vendedor ON pedidosbillennium.chat_messages FOR SELECT TO authenticated USING (((sender_id = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM pedidosbillennium.chat_rooms r
  WHERE ((r.id = chat_messages.room_id) AND (r.vendedor_id = (auth.uid())::text))))));
CREATE POLICY pedido_all_policy ON pedidosbillennium.pedido_cabecera TO authenticated USING ((pedidosbillennium.is_admin() OR (vendedor_id = (auth.uid())::text))) WITH CHECK ((pedidosbillennium.is_admin() OR (vendedor_id = (auth.uid())::text)));
ALTER TABLE pedidosbillennium.pedido_cabecera ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidosbillennium.pedido_detalle ENABLE ROW LEVEL SECURITY;
CREATE POLICY pedido_detalle_all ON pedidosbillennium.pedido_detalle TO authenticated USING ((pedidosbillennium.is_admin() OR (empresa_id = pedidosbillennium.get_my_empresa_id())));
CREATE POLICY pedidos_select_office ON pedidosbillennium.pedido_cabecera FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM pedidosbillennium.vendedores v
  WHERE ((v.id = (auth.uid())::text) AND (v.is_office = true) AND (v.empresa_id = pedido_cabecera.empresa_id)))));
CREATE POLICY proforma_all_policy ON pedidosbillennium.proforma_cabecera TO authenticated USING ((pedidosbillennium.is_admin() OR (vendedor_id = (auth.uid())::text))) WITH CHECK ((pedidosbillennium.is_admin() OR (vendedor_id = (auth.uid())::text)));
ALTER TABLE pedidosbillennium.proforma_cabecera ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidosbillennium.proforma_detalle ENABLE ROW LEVEL SECURITY;
CREATE POLICY proforma_detalle_all ON pedidosbillennium.proforma_detalle TO authenticated USING ((pedidosbillennium.is_admin() OR (empresa_id = pedidosbillennium.get_my_empresa_id())));
CREATE POLICY rooms_insert_oficina ON pedidosbillennium.chat_rooms FOR INSERT TO authenticated WITH CHECK (((empresa_id = pedidosbillennium.get_my_empresa_id()) AND pedidosbillennium.is_office()));
CREATE POLICY rooms_insert_vendedor ON pedidosbillennium.chat_rooms FOR INSERT TO authenticated WITH CHECK ((vendedor_id = (auth.uid())::text));
CREATE POLICY rooms_select_admin ON pedidosbillennium.chat_rooms FOR SELECT TO authenticated USING (pedidosbillennium.is_admin());
CREATE POLICY rooms_select_all_office ON pedidosbillennium.chat_rooms FOR SELECT TO authenticated USING ((pedidosbillennium.is_office() AND (empresa_id = pedidosbillennium.get_my_empresa_id())));
CREATE POLICY rooms_select_oficina ON pedidosbillennium.chat_rooms FOR SELECT TO authenticated USING ((empresa_id = pedidosbillennium.get_my_empresa_id()));
CREATE POLICY rooms_select_vendedor ON pedidosbillennium.chat_rooms FOR SELECT TO authenticated USING ((vendedor_id = (auth.uid())::text));
ALTER TABLE pedidosbillennium.vendedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendedores_delete ON pedidosbillennium.vendedores FOR DELETE TO authenticated USING (pedidosbillennium.is_admin());
CREATE POLICY vendedores_insert ON pedidosbillennium.vendedores FOR INSERT TO authenticated WITH CHECK (pedidosbillennium.is_admin());
CREATE POLICY vendedores_select ON pedidosbillennium.vendedores FOR SELECT TO authenticated USING (true);
CREATE POLICY vendedores_update ON pedidosbillennium.vendedores FOR UPDATE TO authenticated USING (pedidosbillennium.is_admin()) WITH CHECK (pedidosbillennium.is_admin());
