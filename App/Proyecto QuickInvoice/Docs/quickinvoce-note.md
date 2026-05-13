Stack
Capa	Tecnología
Frontend framework	React 19 + TypeScript 5.9
Build tool	Vite 7
Routing	React Router DOM 7
Estilos	Tailwind CSS 4 (PostCSS)
Backend / DB	Supabase (Auth, PostgreSQL, Storage, Edge Functions)
Edge Functions	Deno (Supabase Functions)
Iconos	lucide-react
Fechas	date-fns
Impresión	react-to-print
Utilerías CSS	clsx + tailwind-merge
Estructura de carpetas clave

src/
├── App.tsx                  # Router principal + guards de rol
├── main.tsx                 # Entry point
├── lib/
│   └── supabase.ts          # Cliente Supabase (lee VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
├── contexts/
│   └── AuthContext.tsx      # Auth, perfil, empresa, sesión de caja
├── components/
│   ├── Layout.tsx           # Shell / sidebar
│   ├── ProtectedRoute.tsx   # Guard por rol
│   ├── BillingModal.tsx     # Modal de facturación desde mesa
│   ├── InvoiceTicketPOS.tsx # Ticket 80 mm
│   ├── CierreCajaModal.tsx / CierreCajaTicket.tsx
│   ├── SplitCheckModal.tsx
│   └── mobile/              # Vistas móvil para meseros
├── pages/
│   ├── Dashboard.tsx
│   ├── MesaGrid.tsx         # Vista de mesas
│   ├── OrderTake.tsx        # Toma de pedido en mesa
│   ├── InvoicingPage.tsx    # Historial de facturas
│   ├── FacturaDirectaPage.tsx # Factura directa (rol oficina)
│   ├── InvoicePrint.tsx     # RIDE A4 para impresión
│   ├── TicketPrint.tsx      # Ticket POS 80 mm
│   ├── KitchenOrderPrint.tsx
│   ├── ProductsPage.tsx / ClientsPage.tsx
│   ├── ProveedoresPage.tsx / InventarioPage.tsx / KardexPage.tsx
│   ├── CierresPage.tsx
│   └── ConfigurationPage.tsx
└── services/
    ├── facturacionService.ts  # Emisión SRI (RIDE, XML, firma)
    ├── sriService.ts          # Comunicación con SRI
    ├── facturaDirectaService.ts
    ├── pedidoService.ts / mesaService.ts
    ├── productoService.ts / categoriaService.ts
    ├── inventarioService.ts / kardexService.ts
    ├── proveedoresService.ts
    ├── cajaService.ts
    ├── staffService.ts / reservaService.ts
    ├── emailService.ts
    └── seedService.ts

supabase/
├── migrations/              # SQL de migraciones (orden cronológico)
│   ├── 20260226_sri_electronico_completo.sql
│   ├── 20260227_storage_xml.sql
│   └── 20260217_cierre_caja.sql
└── functions/
    ├── sri-signer/          # Edge Function: firma XML con certificado P12
    │   ├── index.ts
    │   ├── xmlGenerator.ts
    │   └── .env.example
    └── sri-lookup/          # Edge Function: consulta RUC al SRI
        └── index.ts
Roles del sistema

admin_plataforma → acceso global (config, cierres, dashboard)
oficina          → facturación, productos, clientes, inventario, proveedores
mesero           → mesas, pedidos (mobile-first)
cocina           → vista cocina (impresión comandas)