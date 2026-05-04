/*
  # Fix proforma number generation to avoid duplicates

  ## Problem
  The current function uses COUNT(*) + 1 which can create duplicate numbers
  when multiple proformas are created simultaneously or when proformas are deleted.

  ## Solution
  Use the maximum existing sequence number + 1 per empresa per day.
  Extract the sequence from existing numbers for today, find the max, and increment.

  ## Impact
  - No more duplicate proforma numbers
  - Each empresa has independent numbering per day
  - Numbers increment correctly even if proformas are deleted
*/

CREATE OR REPLACE FUNCTION generar_numero_proforma(p_empresa_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  nuevo_numero TEXT;
  max_secuencia INTEGER;
  fecha_hoy TEXT;
BEGIN
  -- Get today's date in YYYYMMDD format
  fecha_hoy := TO_CHAR(NOW(), 'YYYYMMDD');
  
  -- Find the maximum sequence number for this empresa and today's date
  SELECT COALESCE(MAX(
    CASE 
      WHEN numero ~ ('^PRO-' || fecha_hoy || '-[0-9]{4}$')
      THEN CAST(SUBSTRING(numero FROM LENGTH(numero) - 3) AS INTEGER)
      ELSE 0
    END
  ), 0) INTO max_secuencia
  FROM proforma_cabecera
  WHERE empresa_id = p_empresa_id;
  
  -- Increment the sequence
  max_secuencia := max_secuencia + 1;
  
  -- Generate number in format PRO-YYYYMMDD-XXXX
  nuevo_numero := 'PRO-' || fecha_hoy || '-' || LPAD(max_secuencia::text, 4, '0');
  
  RETURN nuevo_numero;
END;
$$;
