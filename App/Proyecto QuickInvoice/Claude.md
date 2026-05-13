# QuickInVoice – Contexto para Claude

## Resumen del proyecto
QuickInVoice es un ERP / SaaS de facturación electrónica integrado con el SRI para empresas pequeñas y medianas.  
La aplicación gestiona clientes, productos, ventas, inventario, caja e integración con el SRI usando Supabase como backend (BaaS).

---

## Stack técnico real

- Frontend:
  - React 19 + TypeScript
  - Vite
  - Tailwind CSS
- Backend:
  - Supabase como BaaS
  - Supabase Edge Functions (Deno runtime) para lógica de negocio sensible al servidor
  - RPCs y funciones en PostgreSQL (Supabase) para lógica compleja
- Base de datos:
  - PostgreSQL (Supabase) con RLS (Row Level Security) activado
- Auth:
  - Supabase Auth
- Integraciones externas:
  - SRI (Ecuador) vía servicios SOAP:
    - RecepcionComprobantesOffline
    - AutorizacionComprobantesOffline
  - Email: Resend API (REST)
  - PDF: jsPDF
  - Firma electrónica: node-forge (XAdES-BES)
- Storage:
  - Buckets Supabase:
    - `firmas_electronicas` (.p12)
    - `logos`

> Nota: QuickInVoice no tiene backend propio en .NET ni Next.js API routes. Todo el “servidor” se basa en Supabase + Edge Functions.

---

## Arquitectura de backend

### 1. Supabase Edge Functions (Deno)

Único backend “real” del proyecto:

- `supabase/functions/sri-signer/index.ts`
  - Firma XML XAdES-BES con .p12
  - Envía comprobante al SRI (recepción + autorización)
  - Genera RIDE PDF (jsPDF)
  - Envía correo con adjuntos (Resend)
  - Actualiza estado SRI en la tabla de comprobantes

- `supabase/functions/sri-lookup/index.ts`
  - Consulta datos de contribuyente en SRI por RUC/cédula

Estas funciones se invocan desde el frontend con:
```ts
supabase.functions.invoke('sri-signer', { body: { ... } })
supabase.functions.invoke('sri-lookup', { body: { ... } })
```

### 2. Servicios de frontend (lógica de negocio en cliente)

Viven en `src/services` y coordinan toda la lógica usando el Supabase SDK.

- `facturacionService.ts`
  - Flujo completo de facturación:
    - Crea comprobante (cabecera, detalles, pagos)
    - Genera clave de acceso módulo 11
    - Actualiza secuencial en `config_sri`
    - Actualiza estado de pedido y mesa
    - Registra movimientos de inventario (Kardex)
    - Invoca `sri-signer` para firmar y autorizar

- `sriService.ts`
  - CRUD de comprobantes
  - Generación de clave de acceso
  - Upload de firma .p12 y logo a Supabase Storage
  - Descarga de XML / RIDE

- `cajaService.ts`
  - Gestión de sesiones de caja (aperturas, cierres, movimientos)

- `kardexService.ts`
  - Movimientos de inventario por venta / devolución

- `pedidoService.ts`
  - Gestión de pedidos, mesas, estados de atención

### 3. Capa de datos (Supabase / PostgreSQL)

- Cliente Supabase central: `src/lib/supabase.ts`
  - `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)`

- Auth y contexto:
  - `src/contexts/AuthContext.tsx` maneja sesión de usuario y roles.

- RPCs / funciones Postgres (en `supabase/migrations`):
  - Split de cuenta
  - Cierre de caja
  - Ordenamiento y estados de pedidos
  - Otras operaciones complejas ejecutadas dentro de la base

---

## Módulos ya implementados

- **Facturación**
  - Emisión de comprobantes electrónicos
  - Integración completa con SRI (recepción + autorización)
- **Comprobantes**
  - Listado / consulta de comprobantes
- **Clientes**
  - ABM de clientes
- **Productos**
  - ABM de productos
- **Proveedores**
  - ABM de proveedores
  **Inventario**
  - Control básico de existencias
- **Kardex**
  - Movimientos por venta
- **Cierre de Caja**
  - Flujo de apertura / cierre y resumen
- **Configuración**
  - Parámetros SRI, empresa, puntos de emisión, etc.

---

## Backlog / funcionalidades pendientes

La prioridad es mantener integridad contable y coherencia con SRI / ERP.

1. **Inventario**
   - Ajustes adicionales de inventario (entradas/salidas manuales, ajustes por pérdida/daño).
   - Asegurar que todas las operaciones de venta y devolución impacten correctamente Kardex y stock.

2. **Cartera CxC (clientes)**
   - Al facturar a crédito:
     - Registrar automáticamente en tabla `cartera_cxc` el saldo por cliente / comprobante.
   - Crear formulario para:
     - Registrar pagos / abonos.
     - Dar de baja / cancelar cartera (pagos completos, condonaciones, notas de crédito).

3. **Cartera CxP (proveedores)**
   - Al registrar factura de proveedor a crédito:
     - Registrar automáticamente en tabla `cartera_cxp`.
   - Crear formulario para:
     - Registrar pagos a proveedores.
     - Dar de baja / cancelar cartera.

4. **Vendedores y comisiones / estadísticas**
   - Crear tabla de vendedores:
     - `id`, `id_empresa`, `nombre_vendedor`, `iniciales`, `estado`, etc.
   - Asociar facturas con vendedor.
   - Consulta de ventas por período (AAAAMM) por vendedor, con totales:
     - `no_factura`, `fecha`, `cliente`, `base_cero`, `base_iva`, `iva`, `neto`,
       `efectivo`, `cheque`, `credito`, `nota_credito`, `retencion_fuente`,
       `cheque_fecha`, `tarjeta_credito`, etc.

5. **Dashboard por empresa y período**
   - Indicadores:
     - Total de ventas
     - Ventas por vendedor
     - Ventas por producto
     - Top mejores vendedores
     - Top productos
   - Filtro por empresa y período (rango de fechas o AAAAMM).

6. **Gestión de comprobantes**
   - Permitir **anular factura**:
     - Modelar estados de comprobante y su impacto en inventario / cartera.
   - Permitir **devolución de productos** de una factura:
     - Generar Nota de Crédito electrónica correspondiente (nuevo flujo SRI).
     - Actualizar Kardex e inventario.
     - Ajustar cartera CxC.

7. **Otros (a implementar progresivamente)**
   - Listados / reportes adicionales.
   - Mejoras de UX.
   - Optimización de consultas Supabase.
   - Endurecer validaciones de negocio y seguridad.

---

## Convenciones y reglas para Claude

- Mantener nombres de tablas y columnas existentes en Supabase.  
- No modificar lógica tributaria (SRI, impuestos, cálculo de módulo 11) sin instrucción explícita.  
- Priorizar:
  - Integridad de datos (inventario, cartera, caja).
  - Seguridad (RLS, auth, multiempresa).
- Siempre que se agregue nueva funcionalidad:
  - Diseñar primero flujo de datos (tablas / RPC / Edge Functions / services).
  - Luego implementar código en pequeñas unidades revisables (PRs / diffs pequeños).