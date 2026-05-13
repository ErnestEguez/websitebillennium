-- RLS para la tabla subproductos
ALTER TABLE public.subproductos ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado de la misma empresa
CREATE POLICY "subproductos_select"
ON public.subproductos FOR SELECT
TO authenticated
USING (empresa_id = public.get_my_empresa_id());

-- Inserción: usuarios de la empresa
CREATE POLICY "subproductos_insert"
ON public.subproductos FOR INSERT
TO authenticated
WITH CHECK (empresa_id = public.get_my_empresa_id());

-- Actualización: usuarios de la empresa
CREATE POLICY "subproductos_update"
ON public.subproductos FOR UPDATE
TO authenticated
USING (empresa_id = public.get_my_empresa_id())
WITH CHECK (empresa_id = public.get_my_empresa_id());

-- Eliminación: usuarios de la empresa
CREATE POLICY "subproductos_delete"
ON public.subproductos FOR DELETE
TO authenticated
USING (empresa_id = public.get_my_empresa_id());
