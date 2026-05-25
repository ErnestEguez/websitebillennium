Actúa como arquitecto senior de ERP financiero y desarrollador full stack experto en Supabase (Postgres + RLS), Next.js/React y aplicaciones multi-tenant.

Contexto de la plataforma:
- Tengo un portal central llamado Billennium System (billenniumsystem.com) que funciona como ERP en la nube y portal SaaS.
- El portal usa autenticación centralizada y asignación de productos por empresa/usuario (multi-tenant).
- Ya tengo desarrollado el módulo de Proveedores dentro del portal.
- El código está organizado por apps/módulos (Pedidos, Importaciones, Contabilidad, etc.), todos compartiendo el Auth y la base de datos del portal.
- Ahora voy a agregar un nuevo módulo financiero llamado “Finance Suite”.
- Este nuevo modulo tendra un esquema en supabase llamado "finance"
en es crearas las nuevas tablas inherentes a la app, y el resto de tablas relacionadas se mantendran en los esquemas actuales de ffacturacion y contabilidad

Alcance de este trabajo:
Diseñar y desarrollar el módulo “Finance Suite” para el ERP del portal Billennium, enfocado en:
- Administración de bancos y cuentas bancarias.
- Pagos a proveedores (transferencias, cheques, tarjetas, notas de crédito, cruces contables).
- Movimientos bancarios (depósitos, notas de débito/crédito, otros).
- Conciliación bancaria.
- Reportería básica financiera relacionada a bancos.
- Todo esto integrado contablemente con la empresa de contabilidad ya abierta (misma empresa que usa el módulo contable y de proveedores).

Importante:
- La empresa (tenant) es la misma que la de contabilidad y proveedores.
- Una vez que el usuario abre la empresa en contabilidad, puede entrar a Finance Suite usando ese mismo contexto de empresa.
- Debes respetar el modelo multi-empresa/tenant actual (empresa_id o el identificador que ya use el portal).

Funcionalidades principales de “Finance Suite”:

1) Bancos y cuentas bancarias
- Creación y mantenimiento de Bancos:
  - Índice de bancos del Ecuador (permite CRUD: crear, actualizar, eliminar, listar).
  - Campos típicos: código de banco, nombre, RUC si aplica, abreviatura, país, activo/inactivo.
- Creación y mantenimiento de Cuentas de Banco:
  - Asociación a:
    - Empresa (tenant actual).
    - Banco.
  - Campos típicos: número de cuenta, tipo de cuenta (corriente/ahorros), moneda, descripción, estado (activa/bloqueada), saldo inicial, fecha apertura, etc.
  - Soporte para marcar si la cuenta participa en conciliación bancaria.

2) Pagos a proveedores (Cuentas por Pagar)
- Integración con el módulo de CxP del portal.
- “Cancelación de deudas de proveedores” con comprobante de egreso contabilizado.
- Formas de pago soportadas, al menos:
  - Transferencia bancaria.
  - Cheque al día.
  - Cheque post-fechado (a fecha).
  - Tarjeta de crédito (T/C).
  - Nota de crédito (N/C).
  - Cruce contable (pago por compensación con otra cuenta contable).
- Debe existir un formulario para:
  - Seleccionar proveedor y facturas pendientes.
  - Elegir forma de pago.
  - Si es transferencia: seleccionar cuenta bancaria origen, registrar número de comprobante, fecha y monto.
  - Si es cheque: seleccionar cuenta bancaria origen, definir número de cheque, fecha de emisión, fecha de cobro (si es post-fechado), beneficiario y monto.
  - Si es T/C o N/C: registrar datos mínimos necesarios.
  - Si es cruce contable: seleccionar cuenta contable contrapartida.
- Debe generar un “Comprobante de Egreso” con:
  - Numeración, fecha, proveedor, detalle, forma de pago, usuario, empresa.
- Dependiendo de un “switch” de enlace contable:
  - O bien solo registra el pago en el módulo financiero (modo operativo).
  - O genera además el asiento contable correspondiente en el módulo contable (modo integrado).

3) Anticipos a proveedores
- Permitir registrar anticipos a proveedores:
  - transferencias o cheques de anticipo.
- Esos anticipos deben quedar disponibles luego para aplicar contra facturas futuras del proveedor.

4) Movimientos bancarios
- “Transacciones bancarias” sobre las cuentas de banco:
  - Depósitos.
  - Notas de débito.
  - Notas de crédito.
  - Cargos automáticos, comisiones, intereses, etc.
- Cada movimiento:
  - Debe afectar el saldo de la cuenta bancaria correspondiente.
  - Debe poder vincularse o no a un asiento contable dependiendo del switch de enlace contable.

5) Gestión de cheques
- Emisión de cheques:
  - Generar registros de cheques emitidos, con estado (emitido, cobrado, anulado, post-fechado).
- Anulación/eliminación de cheques:
  - Debe registrar la anulación (no desaparecerlos de la historia).
  - Ajustar saldos bancarios y, si aplica, asientos contables.
- “Actualización de mis cheques a fecha”:
  - Vista/reporte que muestre todos los cheques a fecha (post-fechados) por empresa, cuenta, proveedor, rango de fechas, estado.
  - Permitir marcar cheques como cobrados y reflejar el movimiento en la cuenta bancaria.

6) Reversos y recuperación de deudas
- “Recuperar deudas pagadas” (reverso de pagos):
  - Permitir revertir un pago aplicado a un proveedor (por error o devolución), reabriendo la deuda.
  - Invertir el efecto del movimiento bancario y contable, dejando trazabilidad.

7) Conciliación bancaria
- Módulo de conciliación bancaria por cuenta, empresa y periodo:
  - Poder importar o registrar movimientos de extracto bancario (resumen).
  - Poder marcar en pantalla qué movimientos del sistema están conciliados con el banco.
  - Mostrar:
    - Movimientos conciliados.
    - Pendientes (en tránsito, cheques no cobrados, cargos bancarios sin registrar, etc.).
  - Generar un estado de conciliación en el que el saldo del banco y el saldo contable se puedan comparar, explicando las diferencias.
- Diseñar la conciliación inspirándote en buenas prácticas de ERP (por ejemplo, ERPNext u Oracle Financials), pero simplificada a mi realidad (PyMEs en Ecuador) y sin sobrecomplicar [1].

8) Reportería
Incluir al menos:
- Movimientos bancarios emitidos por periodo:
  - Filtros por empresa, cuenta bancaria, banco, tipo de movimiento, estado (conciliado o no).
  - Indicar en cada movimiento si está conciliado, con qué conciliación, y su fecha.
- Estado de cuenta bancario:
  - Por cuenta de banco y periodo.
  - Con saldos iniciales, movimientos y saldo final.
- Cheques a fecha:
  - Listado por empresa, cuenta, proveedor, fecha, estado.
- (Opcional) Resumen de pagos a proveedores por periodo, forma de pago y proveedor.

9) Integración contable
- Todo este módulo debe estar preparado para “enlace contable”:
  - Existirá una opción en el administrador del sistema (configuración por empresa) donde se define si:
    - Finance Suite solo registra movimientos operativos (sin asiento).
    - Finance Suite genera automáticamente los asientos contables al módulo de contabilidad.
  - En modo integrado:
    - Pagos a proveedores → asientos a cuentas por pagar, bancos, impuestos si aplica.
    - Movimientos bancarios → asientos a la cuenta de banco y cuenta contrapartida.
    - Anulación/reverso → asientos inversos con trazabilidad (referencia al documento original).
- No diseñes el plan de cuentas desde cero; asume que ya existe un módulo contable con cuentas definidas y que usas referencias a esas cuentas.

Requisitos de arquitectura y calidad:
- Respeta el multi-tenant actual: cada tabla nueva debe tener empresa_id (o el campo equivalente que ya use mi portal) y respetar RLS por empresa.
- No rompas nada de los módulos existentes (Proveedores, Pedidos, Importaciones, Contabilidad).
- No borres ni cambies tablas existentes sin proponer primero el SQL y esperar mi aprobación.
- Usa buenas prácticas de Supabase:
  - RLS activado en tablas financieras.
  - Operaciones sensibles canalizadas por Edge Functions o backend seguro si es necesario.
- Código limpio y mantenible:
  - Separar UI, lógica de negocio y acceso a datos.
  - Reutilizar componentes existentes del portal (tablas, filtros, formularios) cuando sea posible.
- Trabaja por fases:
  1) Diseño del modelo de datos (tablas, relaciones, campos, índices) de Finance Suite.
  2) Diseño de pantallas principales (bancos/cuentas, pagos a proveedores, movimientos bancarios, cheques, conciliación, reportes).
  3) Implementación de la primera versión funcional, empresa por empresa.
  4) Activación del enlace contable automático.
- En cada fase:
  - Primero describe claramente qué vas a hacer.
  - Luego propones el SQL, las interfaces y la lógica.
  - Esperas mi confirmación antes de hacer cambios que afecten otros módulos.

Salida esperada ahora:
- Primero, proponme:
  - El modelo de datos (tablas principales y relaciones) para Finance Suite dentro de mi esquema actual de portal.
  - La lista de pantallas/flows de usuario con un pequeño resumen de qué hace cada una.
  - Cómo se amarra la empresa/tenant y la integración con Proveedores y Contabilidad.
- No escribas todavía todo el código final hasta que yo apruebe el modelo de datos y los flows.