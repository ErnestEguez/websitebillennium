/*
  # Agregar campo fecha_procesado a proforma_cabecera
  
  1. Cambios
    - Agregar campo `fecha_procesado` (timestamptz) a la tabla proforma_cabecera
    - Este campo registra cuándo la proforma fue procesada/sincronizada al ERP
*/

-- Agregar campo fecha_procesado si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_cabecera' AND column_name = 'fecha_procesado'
  ) THEN
    ALTER TABLE proforma_cabecera ADD COLUMN fecha_procesado timestamptz;
  END IF;
END $$;