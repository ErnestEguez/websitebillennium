-- Normaliza forma_pago en finance.comprobantes_egreso a lowercase
-- y expande el constraint para incluir todos los valores del tipo TypeScript FormasPagoEgreso.
-- La definición original sólo tenía: EFECTIVO, TRANSFERENCIA, CHEQUE, NOTA_DEBITO, OTRO (uppercase).

-- 1. Mapear valores existentes a su equivalente lowercase del tipo TS
UPDATE finance.comprobantes_egreso
SET forma_pago = CASE forma_pago
    WHEN 'EFECTIVO'      THEN 'efectivo'
    WHEN 'TRANSFERENCIA' THEN 'transferencia'
    WHEN 'CHEQUE'        THEN 'cheque'
    WHEN 'NOTA_DEBITO'   THEN 'transferencia'   -- no hay nota_debito en el tipo TS; transferencia es el más cercano
    WHEN 'OTRO'          THEN 'transferencia'   -- fallback
    ELSE LOWER(forma_pago)
END
WHERE forma_pago IN ('EFECTIVO','TRANSFERENCIA','CHEQUE','NOTA_DEBITO','OTRO');

-- 2. Eliminar constraint anterior
ALTER TABLE finance.comprobantes_egreso
    DROP CONSTRAINT IF EXISTS comprobantes_egreso_forma_pago_check;

-- 3. Agregar constraint expandido con valores lowercase del tipo TS
ALTER TABLE finance.comprobantes_egreso
    ADD CONSTRAINT comprobantes_egreso_forma_pago_check
    CHECK (forma_pago IN (
        'efectivo',
        'transferencia',
        'cheque',
        'cheque_postfechado',
        'tarjeta_credito',
        'nota_credito',
        'cruce_contable'
    ));

-- 4. Actualizar DEFAULT a lowercase
ALTER TABLE finance.comprobantes_egreso
    ALTER COLUMN forma_pago SET DEFAULT 'transferencia';
