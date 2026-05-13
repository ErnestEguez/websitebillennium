-- Asegurar que el bucket para XMLs existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprobantes_xml', 'comprobantes_xml', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas para el bucket comprobantes_xml
CREATE POLICY "Permitir lectura de XMLs propios"
ON storage.objects FOR SELECT
USING (bucket_id = 'comprobantes_xml' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Permitir subida de XMLs propios"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'comprobantes_xml' AND (storage.foldername(name))[1] = auth.uid()::text);
