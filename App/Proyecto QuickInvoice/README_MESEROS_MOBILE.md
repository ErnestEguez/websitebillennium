# Optimización Móvil para Meseros - RestoFlow

## Objetivo
Mejorar la experiencia de usuario (UX) para el rol de `mesero` en dispositivos móviles. La interfaz actual es funcional pero densa (tablas y grids pequeños). Se busca una interfaz "Mobile First" con botones grandes, tipografía legible y flujos simplificados.

## Alcance
*   **Roles afectados**: Únicamente `mesero`.
*   **Vistas afectadas**:
    1.  `MesaGrid` (Listado de mesas).
    2.  `OrderTake` (Toma de pedidos).
*   **Lógica de Negocio**: NO SE ALTERA. Se reutilizan los servicios y contextos existentes (`mesaService`, `pedidoService`, `AuthContext`).

## Componentes Implementados (Completado: 09/02/2026)

### 1. Listado de Mesas (`WaiterTableListMobile.tsx`)
*   **Diseño**: Lista vertical de tarjetas grandes.
*   **Interacciones**: Filtros tipo "pills" pegajosos (sticky) en la parte superior.
*   **Información**: Número de mesa grande, estado claro (Libre/Ocupada) y próxima reserva visible.

### 2. Toma de Pedidos (`WaiterOrderTakeMobile.tsx`)
*   **Navegación**: Categorías en carrusel horizontal superior.
*   **Buscador**: Visible y de fácil acceso.
*   **Lista de Productos**: Tarjetas con imagen y botones grandes de +/-.
*   **Carrito (Sticky Footer)**:
    *   Barra inferior fija que muestra el total y cantidad de ítems.
    *   Al tocar, abre un "Drawer" o Modal con el detalle del pedido para confirmar.

## Integración
La lógica condicional se agregó en las páginas principales:
```typescript
// MesaGrid.tsx y OrderTake.tsx
if (profile?.rol === 'mesero') {
    return <MobileComponent ...props />
}
```

## Verificación y Pruebas
1.  **Login como Mesero**:
    *   Verificar que `MesaGrid` cargue el nuevo componente de lista vertical.
    *   Probar los filtros de estado (Libres/Ocupadas).
2.  **Toma de Pedido**:
    *   Seleccionar una mesa y verificar que cargue `OrderTake` móvil.
    *   Agregar productos y ver que el footer se actualice.
    *   Abrir el carrito (modal) desde el footer.
    *   Confirmar el pedido y verificar que redirija correctamente.
3.  **Roles Admin/Oficina**:
    *   Verificar que sigan viendo la interfaz de escritorio original.
