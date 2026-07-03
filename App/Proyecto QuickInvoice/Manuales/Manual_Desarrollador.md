# MANUAL DEL DESARROLLADOR — QUICKINVOICE ERP
**Versión 2026**

---

## 1. Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Estilos | Tailwind CSS |
| Iconos | Lucide React |
| Gráficos | Recharts 3 |
| Excel | SheetJS (xlsx) |
| Impresión | react-to-print |
| Backend/DB | Supabase (PostgreSQL) |
| Autenticación | Supabase Auth (JWT) |
| Almacenamiento offline | IndexedDB (via offlineDb.ts) |

---

## 2. Estructura de Carpetas

```
src/
├── components/          # Componentes reutilizables
│   ├── Layout.tsx       # Sidebar + header (navegación principal)
│   └── ...
├── contexts/
│   └── AuthContext.tsx  # Estado global de usuario, empresa y permisos
├── lib/
│   ├── supabase.ts              # Cliente Supabase → schema facturacion
│   ├── supabaseContabilidad.ts  # Cliente Supabase → schema LedgerPro (contabilidad)
│   ├── offlineDb.ts             # Cache IndexedDB para modo offline
│   └── utils.ts                 # Helpers (formatMoneda, cn, etc.)
├── pages/               # Una carpeta por módulo
│   ├── gerencia/        # Resumen Operacional
│   ├── clientes/        # Gestión de Cartera
│   ├── nominas/         # Talento Humano
│   ├── tesoreria/       # Cierre General, Bancos, etc.
│   └── contabilidad/    # Tributario, ATS, etc.
├── services/            # Lógica de negocio (una capa por módulo)
│   ├── carteraGestionService.ts
│   ├── cajaGeneralService.ts
│   ├── gerencia/
│   │   └── resumenOperacionalService.ts
│   ├── finance/
│   │   └── bancosService.ts
│   └── nominas/
│       ├── rolNominaService.ts
│       └── ...
└── types/               # Interfaces TypeScript
    ├── nominas.ts
    └── finance.ts
```

---

## 3. Schemas de Base de Datos

El sistema utiliza **dos schemas PostgreSQL separados**:

### Schema `facturacion` (QuickInvoice)
Contiene todas las tablas operativas. Accedido via `src/lib/supabase.ts`.

**Tablas principales:**
| Tabla | Propósito |
|---|---|
| `empresas` | Multi-tenant: cada empresa es un tenant |
| `profiles` | Perfiles de usuario (email, nombre, rol) |
| `user_permisos` | Permisos granulares por usuario/empresa |
| `clientes` | Catálogo de clientes con scoring y límite de crédito |
| `productos` | Catálogo de productos con precios y costos |
| `subproductos` | Variantes de producto (talla, color, etc.) |
| `bodegas` | Almacenes físicos |
| `kardex` | Movimientos de inventario (ENTRADA/SALIDA) |
| `comprobantes` | Facturas emitidas |
| `comprobante_detalles` | Líneas de cada factura |
| `comprobante_pagos` | Formas de pago de cada factura |
| `notas_credito` | Notas de crédito |
| `cartera_cxc` | Cuentas por cobrar (generadas por ventas a crédito) |
| `cartera_cxc_pagos` | Abonos a cuentas por cobrar |
| `cartera_gestiones` | Historial de gestiones de cobro |
| `cartera_acuerdos` | Planes de pago en cuotas |
| `cartera_acuerdo_cuotas` | Cuotas de cada plan de pago |
| `cartera_score_clientes` | Score crediticio calculado por empresa/cliente |
| `cartera_config` | Configuración de cobros (umbrales, plantillas WA/carta) |
| `cartera_notificaciones` | Centro de alertas de cobros |
| `ingresos_stock` | Compras a proveedores |
| `caja_sesiones` | Sesiones de cajero |
| `caja_general_cierres` | Cierres de caja general |
| `caja_general_movimientos` | Movimientos extra de caja general |
| `caja_general_depositos` | Depósitos bancarios del cierre |
| `gerencia_gastos_manuales` | Gastos manuales para el Resumen Operacional |
| `puntos_emision` | Puntos de venta con secuenciales |
| `vendedores` | Vendedores asignados a facturas |
| `proformas` | Cotizaciones previas a la factura |

**Tablas de Nómina (schema `nominas`):**
| Tabla | Propósito |
|---|---|
| `nominas.empleados` | Datos del empleado y cargo |
| `nominas.periodos_nomina` | Períodos de pago (mes/año) |
| `nominas.rol_cabecera` | Cabecera del rol mensual por empleado |
| `nominas.rol_lineas` | Líneas de conceptos del rol |
| `nominas.conceptos` | Catálogo de conceptos de nómina |
| `nominas.novedades` | Descuentos recurrentes y préstamos |

### Schema `contabilidad` (LedgerPro)
Sistema contable externo integrado. Accedido via `src/lib/supabaseContabilidad.ts`.

**Tablas clave:**
| Tabla | Propósito |
|---|---|
| `lp_cuentas` | Plan de cuentas |
| `lp_comprobantes` | Asientos contables |
| `lp_comprobante_lineas` | Líneas DEBE/HABER de cada asiento |
| `lp_periodos` | Períodos contables (mes/año) |
| `lp_empresas` | Empresas en LedgerPro (IDs distintos a facturacion.empresas) |
| `lp_usuarios_empresa` | Relación usuario-empresa en LP |

> **IMPORTANTE:** Los IDs de empresa en `facturacion` y `lp_empresas` son DIFERENTES. Siempre resolver el LP empresa_id via `lp_usuarios_empresa` o `lp_get_mis_empresas()` RPC.

---

## 4. Arquitectura de Seguridad (RLS)

### Row Level Security
Toda tabla en `facturacion` usa RLS. La función clave es:

```sql
-- Retorna los IDs de empresa accesibles por el usuario actual
CREATE OR REPLACE FUNCTION facturacion.mis_empresas_ids()
RETURNS SETOF UUID LANGUAGE SQL SECURITY DEFINER AS $$
    SELECT empresa_id FROM facturacion.usuario_empresas
    WHERE user_id = auth.uid() AND activo = true
    UNION
    SELECT empresa_id FROM facturacion.profiles
    WHERE id = auth.uid()
$$;
```

**Patrón estándar de política RLS:**
```sql
CREATE POLICY "nombre_politica" ON facturacion.mi_tabla
    FOR ALL USING (empresa_id IN (SELECT facturacion.mis_empresas_ids()));
```

### Nueva tabla: checklist de seguridad
Cada tabla nueva debe:
1. Incluir columna `empresa_id UUID NOT NULL REFERENCES facturacion.empresas(id)`
2. `ENABLE ROW LEVEL SECURITY`
3. `CREATE POLICY` usando `mis_empresas_ids()`
4. `GRANT ALL ON ... TO authenticated, service_role`
5. Índice en `(empresa_id, ...)` para performance

---

## 5. Sistema de Permisos

### AuthContext (`src/contexts/AuthContext.tsx`)
El objeto `Permisos` define todos los permisos booleanos:

```typescript
interface Permisos {
    perm_dashboard:          boolean
    perm_nueva_factura:      boolean
    perm_comprobantes:       boolean
    perm_notas_credito:      boolean
    perm_anulacion_facturas: boolean
    perm_cierres_caja:       boolean
    perm_consulta_ventas:    boolean
    perm_gerencia:           boolean
    perm_clientes:           boolean
    perm_cartera_cxc:        boolean
    perm_gestion_cartera:    boolean
    perm_consulta_cartera:   boolean
    perm_estado_cuenta:      boolean
    perm_proveedores:        boolean
    perm_compras:            boolean
    perm_cxp:                boolean
    perm_reportes_cxp:       boolean
    perm_bancos:             boolean
    perm_egresos:            boolean
    perm_cheques:            boolean
    perm_movimientos_banc:   boolean
    perm_conciliacion:       boolean
    perm_plan_cuentas:       boolean
    perm_asientos:           boolean
    perm_reportes_cont:      boolean
    perm_tributario:         boolean
    perm_th_empleados:       boolean
    perm_th_estructura:      boolean
    perm_th_rol_nomina:      boolean
    perm_th_conceptos_nomina: boolean
    perm_th_nomina_parametros: boolean
}
```

### Agregar un nuevo permiso — Checklist
1. Agregar campo `perm_NUEVO: boolean` en la interfaz `Permisos` en `AuthContext.tsx`
2. Agregar valor por defecto en `DEFAULT_PERMISOS`
3. Leer desde `permData` con fallback: `permData.perm_NUEVO ?? true`
4. Agregar SQL: `ALTER TABLE facturacion.user_permisos ADD COLUMN IF NOT EXISTS perm_NUEVO BOOLEAN NOT NULL DEFAULT true`
5. Agregar toggle en `AdminPermisosPage.tsx` (sección MODULOS + objeto de mapeo)
6. Agregar a `PERM_RUTAS` en `Layout.tsx`
7. Usar en el sidebar: `disabled={!p.perm_NUEVO}`
8. Usar en la ruta: para acceso, verificar con el contexto

---

## 6. Patrones de Código

### Búsqueda con buscador interactivo (cuenta contable / banco)
Regla: **SIEMPRE** usar buscador interactivo para cuentas contables y cuentas bancarias. Nunca un input libre ni select con lista fija.

```typescript
// Componente tipo SelectorCuenta en CierreGeneralPage.tsx
function SelectorCuenta({ cuentas, value, onChange }) {
    const [open, setOpen] = useState(false)
    const [q, setQ] = useState('')
    // ...filtrar por código y nombre con debounce
}
```

### Búsqueda de productos (server-side con ILIKE)
Para catálogos > 1000 registros, la búsqueda debe ser siempre del lado del servidor:

```typescript
useEffect(() => {
    if (texto.length < 2) { setResults([]); return }
    const timer = setTimeout(async () => {
        const pattern = '%' + texto.split(/[*]+/).filter(Boolean).join('%') + '%'
        const { data } = await supabase
            .from('productos')
            .select('*')
            .eq('empresa_id', empresa!.id)
            .or(`nombre.ilike.${pattern},codigo.ilike.${pattern}`)
            .limit(50)
        setResults(data ?? [])
    }, 300)
    return () => clearTimeout(timer)
}, [texto])
```

### Paginación para catálogos grandes (> 1000 registros)
Supabase limita a 1000 filas por defecto. Usar `.range()`:

```typescript
async function fetchProductos(empresaId: string): Promise<any[]> {
    const PAGE = 1000
    let all: any[] = []
    let from = 0
    while (true) {
        const { data, error } = await supabase.from('productos')
            .select('*, subproductos(*)')
            .eq('empresa_id', empresaId)
            .range(from, from + PAGE - 1)
        if (error) throw error
        all = all.concat(data ?? [])
        if (!data || data.length < PAGE) break
        from += PAGE
    }
    return all
}
```

### Formateo de moneda
```typescript
import { formatMoneda } from '../lib/utils'
formatMoneda(1234.56) // → "$1.234,56"
```

### Exportar Excel con header empresa
```typescript
import * as XLSX from 'xlsx'

function exportarExcel(filas: any[], empresaNombre: string) {
    const header = [
        [empresaNombre],
        ['TÍTULO DEL REPORTE'],
        [`Fecha: ${new Date().toLocaleDateString('es-EC')}`],
        [],
        ['Col1', 'Col2', 'Col3'],  // encabezados de columna
    ]
    const rows = filas.map(f => [f.campo1, f.campo2, +f.valor.toFixed(2)])
    const ws = XLSX.utils.aoa_to_sheet([...header, ...rows])
    ws['!cols'] = [30, 14, 12].map(w => ({ wch: w }))
    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },  // merge empresa
        { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },  // merge título
        { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },  // merge fecha
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Hoja1')
    XLSX.writeFile(wb, `reporte_${new Date().toISOString().split('T')[0]}.xlsx`)
}
```

### Auto-guardado en BD (patron para formularios que deben persistir)
```typescript
const lastSavedRef = useRef<string>('[]')

useEffect(() => {
    const serialized = JSON.stringify(data)
    if (serialized === lastSavedRef.current) return  // sin cambios, no guardar
    const timer = setTimeout(async () => {
        await supabase.from('mi_tabla').upsert({ ...data, updated_at: new Date().toISOString() })
        lastSavedRef.current = serialized
    }, 800)
    return () => clearTimeout(timer)
}, [data])
```

---

## 7. Facturación Electrónica SRI

### Flujo de autorización
1. `facturaDirectaService.generarFacturaDirecta()` inserta el comprobante con `estado_sri = 'PENDIENTE'`
2. El edge function `sri-signer` firma el XML con la firma p12 del cliente
3. Se envía al webservice del SRI
4. La respuesta actualiza `estado_sri` a `AUTORIZADO` o `ERROR`

### Firma electrónica (PKCS12)
```typescript
// Parsing del archivo .p12 con node-forge (en edge function)
const p12Asn1 = forge.asn1.fromDer(p12Der, { strict: false, parseAllBytes: false })
const p12 = forge.pkcs12.pkiFromPfx(p12Asn1, password)
```

> El parámetro `{ strict: false, parseAllBytes: false }` es obligatorio para certificados del BCE ecuatoriano que no siguen estrictamente el estándar DER.

### Número secuencial atómico
```sql
-- Función PostgreSQL para evitar duplicados con concurrencia
CREATE OR REPLACE FUNCTION facturacion.qi_next_secuencial_punto(
    p_punto_emision_id UUID,
    p_tipo_comprobante TEXT
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_next INTEGER;
BEGIN
    SELECT secuenciales->>p_tipo_comprobante INTO v_next
    FROM facturacion.puntos_emision WHERE id = p_punto_emision_id FOR UPDATE;
    -- incrementar y guardar
    UPDATE facturacion.puntos_emision
    SET secuenciales = secuenciales || jsonb_build_object(p_tipo_comprobante, v_next + 1)
    WHERE id = p_punto_emision_id;
    RETURN v_next + 1;
END;$$;
```

---

## 8. Módulos Clave: Referencia de Servicios

### carteraGestionService.ts
| Función | Descripción |
|---|---|
| `getCartera(empresaId, opts)` | Lista CxC pendientes con filtros (vendedor, estado, cliente, antigüedad) |
| `getKPIs(empresaId, fechaCorte)` | 6 KPIs de cartera incluyendo índice de rotación |
| `getGestiones(carteraId)` | Historial timeline de una CxC |
| `registrarGestion(data)` | Guarda nueva gestión y actualiza estado desnormalizado en cartera_cxc |
| `recalcularScore(empresaId, clienteId)` | Score 0-100 con 4 factores ponderados |
| `getAgingData(empresaId, fechaCorte)` | Datos para Aging Report (antigüedad de saldos) |
| `exportarAgingExcel(rows, empresa, fecha)` | Genera .xlsx Aging con columnas 0-30/31-60/61-90/91-180/+180 |
| `exportarPorVendedorExcel(...)` | R2: cartera por vendedor |
| `exportarEfectividadExcel(...)` | R3: efectividad del cobrador |
| `exportarPromesasExcel(...)` | R4: promesas de pago |
| `exportarAcuerdosExcel(...)` | R5: acuerdos en cuotas |
| `exportarComparativoExcel(...)` | R6: comparativo 12 meses |
| `exportarAltoRiesgoExcel(...)` | R7: clientes alto riesgo |
| `generarLinkWA(telefono, plantilla, vars)` | Genera URL `wa.me/593...?text=...` |

### resumenOperacionalService.ts
| Función | Descripción |
|---|---|
| `getResumenCompleto(empresaId, tipo, valor)` | Orquesta todos los datos del Resumen Gerencial |
| `detectarContabilidad()` | Verifica si hay empresa LP activa → `{tiene, lpEmpresaId}` |
| `getVentasNetas(empresaId, desde, hasta)` | Facturas - Notas de Crédito |
| `getCostoVentasKardex(empresaId, desde, hasta)` | SALIDAS de kardex en el período |
| `getCostoVentasLP(lpEmpresaId, desde, hasta)` | Cuentas grupo 5.01 en LedgerPro |
| `getGastosLP(lpEmpresaId, desde, hasta)` | Cuentas grupo 5.02 en LedgerPro |
| `getGastosManuales / guardarGastosManuales` | CRUD para empresas sin contabilidad |
| `getTopClientes / getTopProductos` | Top 5 por ingresos del período |
| `getUmbrales / guardarUmbrales` | Umbrales del semáforo (guardados en empresas.config_gerencia) |

### cajaGeneralService.ts
| Función | Descripción |
|---|---|
| `getBaseCaja / setBaseCaja` | Monto base de caja (en empresas.config_caja) |
| `getCierreDelDia / crearCierre` | Borrador del cierre diario |
| `getMovimientosDia / crearMovimiento` | Movimientos extra de caja |
| `getDatosConsolidados` | Ventas y cobros del día (por fecha via created_at) |
| `guardarDepositos / getDepositosCierre` | Depósitos bancarios del cierre |
| `ejecutarCierre / reversarCierre` | Cierre definitivo y reverso |
| `actualizarBorrador` | Guarda obs/detalle sin cerrar |

---

## 9. Configuración de Entorno

### Variables de entorno (`.env`)
```
VITE_SUPABASE_URL=https://ietsocfibsoclienqafq.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_SUPABASE_CONT_URL=https://[proyecto-contabilidad].supabase.co
VITE_SUPABASE_CONT_KEY=...
```

### Instalación local
```bash
npm install
npm run dev
```

### Build para producción
```bash
npm run build
```
El deploy se realiza automáticamente en **Vercel** tras cada `git push` a `main`.

---

## 10. Guía de Soporte y Debugging

### Error: "new row violates RLS"
1. Verificar que el usuario tenga un `empresa_id` en `profiles` o `usuario_empresas`
2. Verificar que la tabla tenga política RLS que use `mis_empresas_ids()`
3. Verificar que la columna `empresa_id` del INSERT coincida con la empresa del usuario

### Error: "column X does not exist in schema cache"
La columna fue agregada via SQL pero el schema cache de Supabase no se actualizó. Solución: en el dashboard de Supabase → Settings → API → **Reload schema cache**.

### Error: "failed to connect as temp role" (supabase db push)
El CLI no puede conectarse. Alternativa: ejecutar el SQL directamente en **Supabase → SQL Editor**.

### Error de firma SRI: "DER bytes error"
Usar `{ strict: false, parseAllBytes: false }` en `forge.asn1.fromDer()`.

### Supabase limite de 1000 filas
Usar `.range(from, from + 999)` en un loop hasta recibir menos de 1000 filas.

### Commit + Push
Siempre hacer `git push` inmediatamente después del commit. Vercel dispara el deploy automático con cada push.

---

*Manual actualizado: Julio 2026 · QuickInvoice ERP · Billennium*
