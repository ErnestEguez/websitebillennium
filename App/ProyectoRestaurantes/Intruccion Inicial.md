Actúa como un desarrollador senior experto en Supabase, PostgreSQL, Next.js/React y arquitectura multi-tenant.

Contexto:
Estas migrando la app de restaurantes al portal Billennium.
La base de datos ya fue migrada.
El proyecto principal ahora debe trabajar desde el portal Billennium.
La app de restaurantes ya no debe ser tratada como proyecto independiente para este flujo; solo debe existir la relación entre:
- usuario del portal
- empresa creada por el admin en la app de restaurantes

Objetivo exacto:
Necesito que desarrolles el formulario de administrador para que el admin pueda relacionar un usuario del portal con una empresa existente creada en la app de restaurantes.

Reglas de negocio:
- El admin del portal Billennium es quien hace la asignación.
- La empresa ya existe; no debes crear empresas nuevas salvo que el flujo actual lo requiera explícitamente.
- La relación debe quedar guardada de forma persistente en la base de datos del portal.
- Un usuario puede estar asociado a una empresa específica según la lógica del sistema.
- El formulario debe permitir buscar/seleccionar el usuario del portal y buscar/seleccionar la empresa de restaurantes.
- El formulario debe validar que no haya relaciones duplicadas o inconsistentes.
- Debe quedar preparado para una arquitectura multi-tenant limpia y profesional.

Restricciones importantes:
- NO rompas nada de las otras apps.
- NO hagas cambios destructivos en tablas existentes.
- NO cambies autenticación global sin pedirme confirmación.
- NO mezcles la lógica del portal con la lógica de otras aplicaciones si no es estrictamente necesario.
- NO asumas nombres de tablas o campos si no estás seguro; primero revisa la estructura real.
- Si detectas riesgo de afectar otra app, detente y explícame el riesgo antes de continuar.
- Si necesitas modificar la base de datos, proponme primero el SQL exacto y espera mi aprobación.
- Trabaja siempre con enfoque profesional, incremental y seguro.

Qué quiero que entregues:
1. Diagnóstico breve de la estructura actual.
3. Formulario de administrador completo.
4. Lógica de validación.
5. Persistencia en Supabase/PostgreSQL.
6. Mensajes de error claros.
7. Código limpio y mantenible.
8. Explicación breve de cómo probarlo.

Instrucciones técnicas:
- Usa buenas prácticas de seguridad y RLS si aplica.
- Usa validaciones del lado cliente y del servidor.
- Separa UI, lógica de negocio y acceso a datos.
- Si hay que consultar usuarios y empresas, hazlo con filtros claros y sin cargar datos innecesarios.
- Si el proyecto ya tiene componentes reutilizables, úsalos.
- Si hay patrones existentes en el portal, respétalos.
- Antes de crear o modificar archivos importantes, explícame qué vas a tocar.

Modo de trabajo:
- Hazlo por fases.
- En cada fase, dime exactamente qué vas a cambiar.
- No avances a la siguiente fase sin que yo lo apruebe si hay impacto en base de datos, autenticación o relaciones críticas.
- Si algo no está claro, haz preguntas concretas antes de inventar la solución.

Criterio de calidad:
- El resultado debe verse y comportarse como una funcionalidad profesional de SaaS.
- Debe ser robusto, limpio, y fácil de mantener.
- No quiero prototipos improvisados ni código experimental.
- Quiero una solución lista para producción o casi lista, con mínima corrección manual.

Primero revisa la estructura actual y dime:
- qué tablas detectas,
- cuál sería la mejor forma de relacionar usuario y empresa, (revisa como lo hace quickinvoice)
- y qué archivos o módulos necesitarías tocar.

No escribas todavía el código final hasta que yo confirme la propuesta.