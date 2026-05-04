/*
  # Agregar campo de impuesto a proforma_cabecera

  ## Cambios
  1. Agrega columna `impuesto` a `proforma_cabecera`
    - Almacena el monto del impuesto (IVA) aplicado
    - Tipo: numeric(18, 2)
    - Default: 0
  
  ## Nota
  El total ahora será: subtotal + impuesto = total
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_cabecera' AND column_name = 'impuesto'
  ) THEN
    ALTER TABLE proforma_cabecera ADD COLUMN impuesto numeric(18, 2) DEFAULT 0;
  END IF;
END $$;