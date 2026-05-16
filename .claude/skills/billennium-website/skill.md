---
name: billennium-website
description: Skill para trabajar en la web de Billennium System (websitebillennium/frontend): copy, UX, componentes React y organización de secciones.
when-to-use: Cuando el usuario pida cambios de textos, estructura de páginas o mejoras de componentes en la web de Billennium System.
---

# Contexto técnico

- Frontend basado en Create React App (CRA) ubicado en /frontend.
- Usa React, Tailwind CSS (según tailwind.config.js) y configuración de build/deploy para Vercel (vercel.json).
- Estructura principal de código en /frontend/src (componentes, páginas y estilos).
- El backend y otros servicios pueden estar en carpetas separadas (/backend, etc.), pero este skill se centra en el frontend.

# Objetivos de la web

- Presentar Billennium System como empresa de desarrollo de software y ERP.
- Explicar servicios y productos (ERP, facturación, módulos de negocio) de forma clara para PYMEs.
- Guiar al visitante a:
  - Contactar o solicitar demo.
  - Conocer productos específicos (QuickInvoice, ERP de escritorio, módulos).
  - Entender beneficios concretos (integración SRI, control de inventario, estabilidad de sistemas legacy).

# Guías de estilo de contenido

1. Lenguaje en español neutro, orientado a empresas de Ecuador y Latinoamérica.
2. Frases directas, sin exceso de jerga técnica en las secciones comerciales.
3. Destacar beneficios: velocidad, confiabilidad, integración con sistemas existentes, soporte cercano.
4. Mantener headings cortos y párrafos de 2–4 líneas.
5. Incluir llamadas a la acción claras (por ejemplo: “Solicita una demo”, “Habla con nosotros”).

# Guías de estilo de código

1. Mantener componentes React funcionales, con JSX legible y props bien nombradas.
2. Respetar la estructura actual de /src (carpetas de páginas, componentes compartidos, etc.); cuando propongas cambios, indicar archivos/rutas sugeridas.
3. Usar clases de Tailwind existentes cuando sea posible; si propones nuevas, que sean coherentes con el diseño actual.
4. Evitar introducir dependencias nuevas innecesarias; si se propone una, justificar por qué.
5. Tener presente la configuración de build/deploy de CRA para Vercel (paths relativos, assets en /public, etc.).

# Instrucciones para Claude al usar este skill

Cuando el usuario invoque este skill:

1. Preguntar primero:
   - en qué página o componente está trabajando (por ejemplo: home, servicios, contacto),
   - si va a crear algo nuevo o modificar código/HTML/JSX existente,
   - y qué objetivo tiene (más leads, mejor explicación técnica, mejor SEO, etc.).
2. Si el usuario pega código JSX o un archivo de /src:
   - Mantener la estructura general del componente,
   - Señalar exactamente qué partes cambiar (texto, clases, orden de secciones),
   - Proponer el código revisado completo del componente para copiar/pegar.
3. Si el usuario pide copy o estructura sin mostrar código:
   - Proponer texto y estructura en formato que sea fácil de convertir en JSX (divs, secciones, headings, listas),
   - Indicar sugerencias de nombres de componentes o archivos (por ejemplo: src/components/HeroSection.js, src/pages/Services.js).
4. Si se pide ayuda con SEO:
   - Sugerir títulos, descripciones y contenido ajustado a las rutas existentes,
   - Mantener foco en palabras clave relacionadas con ERP, facturación electrónica, integración con sistemas contables y soluciones a medida.
5. Siempre que se sugieran cambios grandes, proponerlos en pasos:
   - Paso 1: refactor de layout / componentes,
   - Paso 2: mejora de textos y CTAs,
   - Paso 3: ajustes de estilos o responsividad.

# Ejemplos de uso

- "/billennium-website Reescribe el texto principal de la home para enfocarlo en PYMEs de Guayaquil que necesitan facturación electrónica rápida."
- "/billennium-website Propón la estructura de componentes React para una página de servicios con secciones: Desarrollo a medida, ERP, Consultoría."
- "/billennium-website Aquí está el código de mi Hero.jsx, mejóralo en copy y estructura manteniendo Tailwind."uvicorn server:app --reload --host 0.0.0.0 --port 8000


========================
ACTUALIZACIÓN PROYECTO 1 – INTEGRACIÓN PORTAL + PEDIDOS BILLENNIUM
========================

Actúa como arquitecto senior de SaaS multi-tenant y desarrollador full stack senior.
Quiero que trabajes de forma responsable, por etapas, sin romper nada existente y siempre expliques cambios sensibles antes de proponer algo destructivo.

Contexto del repositorio
Repo raíz: WEBSITEBILLENNIUM-MAIN.

Dentro hay un proyecto principal: /websitebillennium-main.

Este proyecto es el PORTAL real que se despliega en billenniumsystem.com (via Vercel).

En el PORTAL ya existen:

páginas públicas,

registro/login,

lógica de usuarios y empresas (tenancy básica),

algo de lógica de productos,

enlaces hacia los productos.

Dentro de /websitebillennium-main/App están los diferentes productos:

/websitebillennium-main/App/Billennium-System-main → App de Pedidos Billennium.

/websitebillennium-main/App/Ledger Pro → App contable (LedgerPro).

/websitebillennium-main/App/Proyecto de Importaciones → App de Importaciones.

/websitebillennium-main/App/Proyecto QuickInvoice → App de facturación QuickInvoice.

Arquitectura objetivo (visión general)
Un solo proyecto Supabase central: el proyecto Supabase asociado al PORTAL /websitebillennium-main.

El PORTAL será la única fuente de verdad para:

usuarios (auth),

empresas (tenants),

suscripciones/productos activos por empresa/usuario.

Los productos dentro de /websitebillennium-main/App:

dejarán de manejar Auth independiente (no más login/registro propios),

leerán el usuario y la empresa seleccionada desde el PORTAL,

usarán esquemas separados de base de datos dentro del mismo proyecto Supabase del PORTAL.

Esquemas de BD (en el proyecto Supabase del PORTAL):

quickinvoice

conta

billenniumpedidos (antes “pedidos”)

importaciones

Muy importante:

Ya existe el esquema billenniumpedidos en el proyecto Supabase del PORTAL, con todas las tablas, funciones, triggers y políticas necesarias para la App de Pedidos Billennium.

Los demás esquemas (quickinvoice, conta, importaciones) se trabajarán después.

Cada App (Pedidos, QuickInvoice, Conta, Importaciones) tiene su área de administración interna que permite gestionar catálogos, parámetros, etc.

Regla especial sobre las áreas de administración de cada App
Estas áreas de administración DEBEN seguir existiendo, porque:

permiten gestionar catálogos propios de cada producto (ej. parámetros, configuraciones, catálogos de negocio, etc.),

forman parte de la lógica de negocio de cada App.

Pero hay una excepción importante:

Cualquier funcionalidad de estas áreas que hoy permita crear/gestionar usuarios (auth o tabla de usuarios) debe ser retirada o deshabilitada, porque:

la gestión de usuarios debe centralizarse en el PORTAL,

las Apps ya no deben crear usuarios directamente ni manejar credenciales propios.

En otras palabras:

Mantener y adaptar las pantallas de administración de las Apps para todo lo que no sea usuarios (catálogos, parámetros, etc.).

Eliminar o desactivar la parte de administración de usuarios dentro de cada App, reemplazándola por dependencias del modelo de usuarios del PORTAL.

Reglas globales
No borrar ni tocar los proyectos Supabase antiguos (QuickInvoice, Contabilidad, Pedidos, Importaciones) hasta que todo funcione bien en el nuevo esquema.

No romper la lógica de negocio actual del PORTAL ni de cada producto.

No ejecutar acciones destructivas en la base de datos (DROP, TRUNCATE, DELETE masivos) sin antes:

explicarme claramente el plan,

esperar mi aprobación explícita.

Mantener la estructura de carpetas:

/websitebillennium-main → PORTAL,

/websitebillennium-main/App/... → productos.

Si encuentras problemas o ambigüedades:

detente,

explica el problema y los riesgos,

sugiere opciones,

espera mi decisión antes de cambios grandes.

FOCO ACTUAL: PORTAL + App Pedidos Billennium
Quiero que trabajes solo en estos dos puntos por ahora:

Ajustar el PORTAL para que sea el punto de entrada oficial a la App de Pedidos Billennium.

Adaptar la App Pedidos Billennium (/App/Billennium-System-main) para que use:

el Auth del PORTAL,

la empresa activa del PORTAL,

el esquema billenniumpedidos del proyecto Supabase del PORTAL,

y sus áreas de administración internas (menos la parte de usuarios propios).

No quiero que toques todavía QuickInvoice, Conta ni Importaciones (solo puedes leer código para entender el contexto).

ETAPA 1 – Analizar y ajustar el PORTAL
1. Análisis del PORTAL (/websitebillennium-main)
Recorre el código del PORTAL y dime, con referencias de archivos concretos:

Cómo está implementado hoy el Auth (Supabase, etc.).

Dónde se manejan:

usuarios (tabla, modelo, hooks, contextos),

empresas (tenants),

relación usuario–empresa.

Si existe ya alguna lógica de productos/suscripciones (qué productos tiene cada empresa/usuario) y dónde está.

Cómo se enlaza actualmente a los productos (QuickInvoice, Conta, Pedidos, Importaciones) vía rutas / links / Vercel.

Antes de proponer cambios, señala cualquier punto confuso o peligroso:

duplicación de Auth,

lugares donde se usa directamente Supabase sin pasar por helpers,

posibles conflictos entre PORTAL y apps de /App/....

2. Modelo de datos unificado en el PORTAL (solo PORTAL, sin tocar productos)
Diseña o ajusta el modelo de BD en el proyecto Supabase del PORTAL para:

usuarios (auth.users + tablas auxiliares si las hay),

empresas (tenants),

relación usuario–empresa,

relación usuario–empresa–producto (qué productos tiene cada empresa/usuario).

El modelo debe soportar al menos estos productos:

QuickInvoice → schema quickinvoice,

Contabilidad / LedgerPro → schema conta,

Pedidos Billennium → schema billenniumpedidos,

Importaciones → schema importaciones.

Propón tablas y relaciones concretas (nombres de tablas/columnas) pero:

no ejecutes SQL ni borres data sin mostrarme antes el diseño,

genera solo migraciones o scripts SQL no destructivos (ADD COLUMN, CREATE TABLE, etc.) y explícame su efecto.

3. Contexto de sesión en el PORTAL
Define cómo el PORTAL va a determinar y almacenar:

usuario autenticado (user_id),

empresa activa (empresa_id),

lista de productos activos para esa empresa.

Implementa o organiza helpers internos en el PORTAL (por ejemplo en /websitebillennium-main/lib):

lib/auth → para recuperar el usuario actual, sesión, etc.

lib/tenancy → para recuperar empresa_id activa y productos activos para esa empresa.

Estos helpers deben ser reutilizables por /App/Billennium-System-main.

4. Punto de entrada a la App Pedidos desde el PORTAL
En el PORTAL, implementa rutas o componentes que sean el “puente” hacia Pedidos Billennium, por ejemplo:

/app/pedidos o ruta similar.

Esa ruta debe:

Verificar que el usuario está autenticado.

Resolver la empresa activa.

Verificar que Pedidos Billennium está activo para esa empresa (según el modelo de productos del PORTAL).

Cargar la App que vive en /websitebillennium-main/App/Billennium-System-main con ese contexto (user_id, empresa_id, producto activo).

No borres todavía rutas antiguas; si hace falta, márcalas claramente como “legacy” en comentarios.

ETAPA 2 – Integrar App Pedidos Billennium con el PORTAL
Ahora trabajamos en /websitebillennium-main/App/Billennium-System-main.

Recordatorio importante:

En el proyecto Supabase del PORTAL ya existe el esquema billenniumpedidos con tablas, índices, triggers y políticas diseñadas especialmente para esta App. No cambies el nombre del esquema ni de las tablas salvo que lo discutamos antes.

5. Análisis de Auth, administración y Supabase dentro de la App Pedidos
Identifica todo el código de Billennium-System-main que maneja Auth propio:

uso local de supabase.auth,

pantallas de login/registro internas,

cualquier lógica que asuma que maneja su propio Supabase o su propio proyecto.

Identifica también su área de administración interna:

qué pantallas permiten gestionar usuarios,

qué pantallas gestionan otros catálogos o parámetros propios de Pedidos.

Reglas para esta área de administración:

La parte de administración de usuarios debe ser eliminada o deshabilitada (solo lectura si hace falta), porque los usuarios se gestionan en el PORTAL.

El resto de la administración (catálogos, parámetros, etc.) debe mantenerse y adaptarse para seguir funcionando contra el esquema billenniumpedidos del Supabase del PORTAL.

No borres todavía el código de Auth antiguo ni la UI vieja de administración:

Propón un plan de retirada controlada (marcar como legacy, esconder tras feature flag, etc.).

6. Adaptar App Pedidos para usar Auth + Tenancy del PORTAL
Cambia la App Billennium-System-main para que:

No haga login propio:

Asuma que el usuario ya viene autenticado por el PORTAL.

Obtenga el usuario actual mediante los helpers del PORTAL (lib/auth).

Obtenga la empresa activa mediante los helpers de tenancy (lib/tenancy).

Use el proyecto Supabase del PORTAL:

Configura el cliente Supabase de la App para apuntar al mismo proyecto Supabase del PORTAL (no al proyecto antiguo).

Todas las consultas deben apuntar al esquema billenniumpedidos.

Use el esquema billenniumpedidos:

Asegúrate de que las consultas SQL o RPC usan las tablas/funciones del esquema billenniumpedidos que ya existen en el proyecto del PORTAL (no crees tablas nuevas duplicadas).

No cambies nombres de tablas ni columnas en el esquema billenniumpedidos salvo que sea imprescindible y siempre explicando el impacto.

Área de administración:

La UI de administración debe seguir permitiendo gestionar catálogos y parámetros propios de Pedidos (tablas de billenniumpedidos).

Cualquier acción de creación/edición/borrado de usuarios dentro de la App debe ser eliminada o sustituida por consumo del modelo de usuarios del PORTAL (por ejemplo, solo mostrar los usuarios existentes, sin crearlos ahí).

Verifique permisos:

Antes de renderizar la App, verificar que el producto Pedidos Billennium está activo para la empresa actual.

En caso de que no esté activo, mostrar un mensaje claro o redirigir de forma segura.

7. Pruebas y puntos de rollback
Propón una estrategia para poder probar:

un usuario real del PORTAL,

una empresa de prueba,

el flujo completo: login en PORTAL → selección de empresa → entrar a /app/pedidos → usar la App Pedidos Billennium con datos vacíos o de prueba en billenniumpedidos.

Indica claramente:

qué cambios son fáciles de revertir (por ejemplo, cambios en código),

qué cambios no son triviales de deshacer (por ejemplo, migraciones de BD),

cómo mantener funcionando el comportamiento antiguo mientras pruebas el nuevo (feature flags, rutas paralelas, etc.).

ETAPAS FUTURAS (NO HACER AHORA, SOLO TENER EN CUENTA)
Más adelante repetiremos el mismo patrón para:

/websitebillennium-main/App/Proyecto QuickInvoice → schema quickinvoice.

/websitebillennium-main/App/Ledger Pro → schema conta.

/websitebillennium-main/App/Proyecto de Importaciones → schema importaciones.

En cada uno:

Leerán user_id, empresa_id y productos activos desde el PORTAL.

Trabajarán contra su propio schema en el proyecto Supabase del PORTAL.

No tendrán login propio.

Mantendrán sus áreas de administración interna para catálogos y parámetros, pero sin crear/gestionar usuarios propios.

Pero por ahora NO hagas cambios en esos productos; solo enfócate en el PORTAL + App Pedidos Billennium con el esquema billenniumpedidos.

Con este contexto, empieza por ETAPA 1 y ETAPA 2 tal como las describí.
Antes de proponer cualquier cambio grande en BD, Auth o administración de usuarios, explícame claramente:

qué archivos tocarías,

qué comportamiento cambiaría,

y cómo podríamos volver atrás si algo sale mal.
