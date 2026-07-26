-- ============================================================
-- MÓDULO LOPDP — Fase 4 (parte 1/2): texto configurable del aviso LOPDP
--
-- Vive en lopdp.politicas_privacidad (misma fila por empresa que ya
-- tiene el slug) — no es una tabla nueva. Solo se guarda el MENSAJE
-- legal editable; la URL pública (https://.../p/{slug}) la construye
-- siempre el código en tiempo de generación a partir del slug de esta
-- misma fila — nunca es texto libre que alguien pueda pegar mal.
--
-- Dos versiones porque el XML del SRI tiene un límite de 300
-- caracteres en el valor de <campoAdicional> (mismo límite ya usado en
-- este proyecto para <motivo> de notas de crédito):
--   - aviso_lopdp_corto: XML (campoAdicional) y ticket 80mm
--   - aviso_lopdp_texto: RIDE en PDF y la vista HTML — no pasan por el
--     XSD del SRI, sin restricción de longitud
-- ============================================================

ALTER TABLE lopdp.politicas_privacidad
    ADD COLUMN IF NOT EXISTS aviso_lopdp_texto TEXT NOT NULL DEFAULT
        'Tratamiento de datos personales: conforme al Art. 7 de la Ley Orgánica de Protección de Datos Personales (LOPDP), sus datos se tratan para la ejecución del presente contrato y el cumplimiento de obligaciones tributarias. Política de privacidad:',
    ADD COLUMN IF NOT EXISTS aviso_lopdp_corto TEXT NOT NULL DEFAULT
        'Datos tratados conforme al Art. 7 LOPDP. Política de privacidad:';

-- Nota: los defaults arriba NO incluyen la URL — el código siempre le
-- concatena " {URL}" (con la base configurada + el slug de la empresa)
-- al usarlos. Así, aunque una empresa edite el mensaje, la URL nunca
-- deja de ser la correcta.
