# MANUAL DEL DESARROLLADOR: RESTOFLOW

## 1. Stack Tecnológico
- **Frontend:** React + TypeScript + Vite.
- **Backend/DB:** Supabase (PostgreSQL) para datos y autenticación.
- **Estilos:** Tailwind CSS.
- **Protocolo Auth:** JWT gestionado mediante `@supabase/supabase-js`.

## 2. Arquitectura de Seguridad (RLS)
El corazón de la seguridad Multi-Tenant reside en las **Políticas de Row Level Security (RLS)**.

### A. Prevención de Recursión
Se utilizan funciones `SECURITY DEFINER` para evitar que las políticas de la tabla `profiles` consulten la misma tabla en un bucle infinito:
- `public.is_platform_admin()`: Verifica si el usuario es Superadmin.
- `public.is_oficina()`: Verifica si el usuario es administrador local.
- `public.get_my_empresa_id()`: Retorna el UUID de la empresa del usuario actual.

### B. Estructura de Permisos
Cualquier tabla nueva **debe** incluir la columna `empresa_id` y activar RLS para asegurar que los datos no se mezclen entre clientes.

## 3. Lógica de Negocio Crítica

### A. Módulo de Pedidos (`pedidoService.ts`)
- Las cabeceras (`pedidos`) y detalles (`pedido_detalles`) se insertan secuencialmente.
- El cambio de estado a `facturado` dispara automáticamente la liberación de la mesa vinculada.

### B. Facturación Electrónica (`facturacionService.ts`)
- El sistema simula la integración con SRI (Ecuador).
- Genera Claves de Acceso de 49 dígitos siguiendo el estándar técnico.
- Realiza el descuento automático de stock vía `kardexService.ts`.

### C. Protección Antifraude
En el frontend (`OrdersPage.tsx` y `MesaGrid.tsx`), los botones de cancelación están ocultos condicionalmente usando lógica de roles:
```tsx
{profile?.rol !== 'mesero' && (
   <button onClick={handleResetMesa}>...</button>
)}
```

## 4. Guía de Soporte
1. **Error "new row violates RLS":** Verificar que el usuario tenga un `empresa_id` asignado y que la política de INSERT de la tabla permita ese rol.
2. **Huelga de Auth (Hangs):** `AuthContext.tsx` tiene un timeout de 10s. Si el perfil tarda más en cargar (usualmente por recursión RLS o latencia), se forzará la salida para proteger la estabilidad.
3. **Persistencia:** No se deben borrar empresas directamente sin antes vaciar las tablas dependientes (mesas, pedidos, comprobantes) debido a las restricciones de clave foránea.

---
**Desarrollado con rigor técnico para Billennium Restaurantes.**
