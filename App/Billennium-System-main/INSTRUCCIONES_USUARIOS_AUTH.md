# INSTRUCCIONES: Recrear Usuarios de Autenticación

## Contexto

Durante la migración, se migraron los registros de la tabla `vendedores`, pero los usuarios en el sistema de autenticación de Supabase (Auth) **NO se pueden migrar automáticamente** entre instancias.

Esto significa que aunque los vendedores existen en la tabla `vendedores`, **no podrán hacer login** hasta que sus cuentas sean recreadas en el sistema Auth de la nueva instancia.

---

## 🔑 Vendedores a Recrear

Los siguientes vendedores necesitan ser recreados en Auth:

### 1. Ernesto Eguez Ruiz
- **ID:** `325b9727-5f81-4932-b585-f1158216043e`
- **Email:** admin@billennium.com
- **Empresa:** Billennium System
- **Es Admin:** Sí
- **Teléfono:** 809-555-0100

### 2. Jackson Macias
- **ID:** `89332517-4448-4b1c-a372-5c947c994f7e`
- **Email:** jackson1@hotmail.com
- **Empresa:** FERRE +
- **Es Admin:** No
- **Teléfono:** 593980136389

### 3. Admin Billennium
- **ID:** `2a323bfb-ad12-4a4d-8315-d67138e762cc`
- **Email:** admin@billennium.com
- **Empresa:** Billennium
- **Es Admin:** Sí
- **Teléfono:** 099-999-9999

---

## ⚠️ PROBLEMA: IDs de Usuarios

Los IDs de usuarios en Auth son generados automáticamente por Supabase y **NO SE PUEDEN especificar manualmente**.

Esto significa que al recrear los usuarios, tendrán **IDs diferentes**, lo que **romperá las relaciones** con:
- Tabla `vendedores` (el ID es la clave primaria)
- Tabla `proforma_cabecera` (campo `vendedor_id`)
- Tabla `pedido_cabecera` (campo `vendedor_id`)
- Todas las políticas RLS que usan `auth.uid()`

---

## 🛠️ OPCIONES DE SOLUCIÓN

### Opción 1: Recrear Todo Desde Cero (RECOMENDADO)

Esta es la opción más limpia y recomendada:

1. **Eliminar todos los datos** de las tablas actuales
2. **Usar la Edge Function `setup-admin`** para crear el primer admin y empresa
3. **Usar la Edge Function `create-vendedor`** para crear los demás vendedores
4. **Recrear las proformas y pedidos** con los nuevos IDs

**Ventajas:**
- Sistema completamente funcional
- Sin problemas de IDs inconsistentes
- Todas las relaciones correctas

**Desventajas:**
- Pierdes los datos históricos (si es importante)

### Opción 2: Actualizar los IDs Manualmente

Si necesitas preservar los datos existentes:

#### Paso 1: Eliminar foreign keys temporalmente
```sql
-- Deshabilitar temporalmente las foreign keys
ALTER TABLE proforma_cabecera DROP CONSTRAINT IF EXISTS proforma_cabecera_vendedor_id_fkey;
ALTER TABLE proforma_cabecera DROP CONSTRAINT IF EXISTS proforma_cabecera_autorizada_por_fkey;
ALTER TABLE pedido_cabecera DROP CONSTRAINT IF EXISTS pedido_cabecera_vendedor_id_fkey;
ALTER TABLE pedido_cabecera DROP CONSTRAINT IF EXISTS pedido_cabecera_autorizada_por_fkey;
```

#### Paso 2: Crear usuarios usando la Edge Function
```bash
# Ejemplo para crear el primer usuario
curl -X POST 'https://nxcngfxiubexepmintwf.supabase.co/functions/v1/create-vendedor' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer TU_ANON_KEY_AQUI' \
  -d '{
    "email": "admin@billennium.com",
    "password": "TU_PASSWORD_AQUI",
    "nombre": "Ernesto Eguez Ruiz",
    "telefono": "809-555-0100",
    "empresa_id": "8767d078-5aa7-4ea0-bb2b-804cea750308",
    "is_admin": true
  }'
```

Esto creará un NUEVO registro en `vendedores` con un NUEVO ID.

#### Paso 3: Actualizar todos los registros que referencian al viejo ID

```sql
-- Supongamos que el nuevo ID es 'abc123-nuevo-id'
-- Y el viejo ID era '325b9727-5f81-4932-b585-f1158216043e'

-- Actualizar proformas
UPDATE proforma_cabecera
SET vendedor_id = 'abc123-nuevo-id'
WHERE vendedor_id = '325b9727-5f81-4932-b585-f1158216043e';

UPDATE proforma_cabecera
SET autorizada_por = 'abc123-nuevo-id'
WHERE autorizada_por = '325b9727-5f81-4932-b585-f1158216043e';

-- Actualizar pedidos
UPDATE pedido_cabecera
SET vendedor_id = 'abc123-nuevo-id'
WHERE vendedor_id = '325b9727-5f81-4932-b585-f1158216043e';

UPDATE pedido_cabecera
SET autorizada_por = 'abc123-nuevo-id'
WHERE autorizada_por = '325b9727-5f81-4932-b585-f1158216043e';
```

#### Paso 4: Eliminar el registro viejo
```sql
DELETE FROM vendedores WHERE id = '325b9727-5f81-4932-b585-f1158216043e';
```

#### Paso 5: Restaurar foreign keys
```sql
-- Restaurar las foreign keys
ALTER TABLE proforma_cabecera
  ADD CONSTRAINT proforma_cabecera_vendedor_id_fkey
  FOREIGN KEY (vendedor_id) REFERENCES vendedores(id);

ALTER TABLE proforma_cabecera
  ADD CONSTRAINT proforma_cabecera_autorizada_por_fkey
  FOREIGN KEY (autorizada_por) REFERENCES vendedores(id);

ALTER TABLE pedido_cabecera
  ADD CONSTRAINT pedido_cabecera_vendedor_id_fkey
  FOREIGN KEY (vendedor_id) REFERENCES vendedores(id);

ALTER TABLE pedido_cabecera
  ADD CONSTRAINT pedido_cabecera_autorizada_por_fkey
  FOREIGN KEY (autorizada_por) REFERENCES vendedores(id);
```

**Ventajas:**
- Preservas los datos históricos

**Desventajas:**
- Proceso complejo y propenso a errores
- Debes repetir para cada vendedor
- Puede romper la sincronización con VB6 si depende de IDs específicos

---

## 🎯 RECOMENDACIÓN FINAL

**Para un sistema productivo nuevo:** Usa la **Opción 1** y empieza desde cero. Es más limpio y evita problemas futuros.

**Para un sistema con datos históricos importantes:** Usa la **Opción 2**, pero hazlo con mucho cuidado y haz un backup primero.

---

## 📞 Contacto para Soporte

Si necesitas ayuda con cualquiera de estas opciones, puedes:
1. Hacer un backup completo de la base de datos antes de cualquier cambio
2. Probar en un ambiente de desarrollo primero
3. Documentar todos los pasos que realizas
