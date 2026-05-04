# Documentación de Conexión desde Visual Basic 6.0 a Supabase

## Introducción

Este documento explica cómo conectar tu aplicación VB6 con la base de datos Supabase en la nube para sincronizar datos de vendedores, artículos y proformas.

## Requisitos Previos

1. **Proyecto VB6** existente
2. **Credenciales de Supabase**:
   - URL del proyecto Supabase (ejemplo: `https://tu-proyecto.supabase.co`)
   - API Key anónima (ejemplo: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)

## Componentes Necesarios en VB6

Para hacer peticiones HTTP desde VB6, necesitas agregar una referencia al componente:

1. En VB6, ve a **Proyecto → Referencias**
2. Marca: **Microsoft WinHTTP Services, version 5.1**

## Código VB6 para Conectar con Supabase

### 1. Módulo de Configuración (modConfig.bas)

```vb
' modConfig.bas - Configuración de conexión a Supabase
Public Const SUPABASE_URL As String = "https://TU-PROYECTO.supabase.co"
Public Const SUPABASE_KEY As String = "TU_CLAVE_ANONIMA_AQUI"
Public Const API_BASE As String = SUPABASE_URL & "/rest/v1"
```

### 2. Módulo de Conexión HTTP (modHTTP.bas)

```vb
' modHTTP.bas - Funciones para realizar peticiones HTTP
Option Explicit

Public Function HttpGet(url As String) As String
    Dim httpReq As Object
    Set httpReq = CreateObject("WinHttp.WinHttpRequest.5.1")

    httpReq.Open "GET", url, False
    httpReq.setRequestHeader "apikey", SUPABASE_KEY
    httpReq.setRequestHeader "Authorization", "Bearer " & SUPABASE_KEY
    httpReq.setRequestHeader "Content-Type", "application/json"

    On Error GoTo ErrorHandler
    httpReq.Send

    HttpGet = httpReq.responseText
    Set httpReq = Nothing
    Exit Function

ErrorHandler:
    MsgBox "Error en petición GET: " & Err.Description, vbCritical
    HttpGet = ""
    Set httpReq = Nothing
End Function

Public Function HttpPost(url As String, jsonData As String) As String
    Dim httpReq As Object
    Set httpReq = CreateObject("WinHttp.WinHttpRequest.5.1")

    httpReq.Open "POST", url, False
    httpReq.setRequestHeader "apikey", SUPABASE_KEY
    httpReq.setRequestHeader "Authorization", "Bearer " & SUPABASE_KEY
    httpReq.setRequestHeader "Content-Type", "application/json"
    httpReq.setRequestHeader "Prefer", "return=representation"

    On Error GoTo ErrorHandler
    httpReq.Send jsonData

    HttpPost = httpReq.responseText
    Set httpReq = Nothing
    Exit Function

ErrorHandler:
    MsgBox "Error en petición POST: " & Err.Description, vbCritical
    HttpPost = ""
    Set httpReq = Nothing
End Function

Public Function HttpPatch(url As String, jsonData As String) As String
    Dim httpReq As Object
    Set httpReq = CreateObject("WinHttp.WinHttpRequest.5.1")

    httpReq.Open "PATCH", url, False
    httpReq.setRequestHeader "apikey", SUPABASE_KEY
    httpReq.setRequestHeader "Authorization", "Bearer " & SUPABASE_KEY
    httpReq.setRequestHeader "Content-Type", "application/json"
    httpReq.setRequestHeader "Prefer", "return=representation"

    On Error GoTo ErrorHandler
    httpReq.Send jsonData

    HttpPatch = httpReq.responseText
    Set httpReq = Nothing
    Exit Function

ErrorHandler:
    MsgBox "Error en petición PATCH: " & Err.Description, vbCritical
    HttpPatch = ""
    Set httpReq = Nothing
End Function
```

### 3. Sincronización de Vendedores (modSyncVendedores.bas)

```vb
' modSyncVendedores.bas - Sincroniza vendedores desde el ERP a Supabase
Option Explicit

Public Sub SincronizarVendedores()
    Dim rs As ADODB.Recordset
    Dim conn As ADODB.Connection
    Dim jsonData As String
    Dim url As String

    ' Conectar a tu base de datos SQL Server local
    Set conn = New ADODB.Connection
    conn.ConnectionString = "Provider=SQLOLEDB;Data Source=tu_servidor;Initial Catalog=tu_bd;User ID=usuario;Password=password;"
    conn.Open

    ' Consultar vendedores activos
    Set rs = New ADODB.Recordset
    rs.Open "SELECT codigo, nombre, email FROM vendedores WHERE activo = 1", conn

    ' Borrar vendedores existentes en Supabase
    url = API_BASE & "/vendedores?activo=eq.true"
    Call HttpDelete(url)

    ' Insertar cada vendedor
    Do While Not rs.EOF
        jsonData = "{" & _
                   """id"":""" & rs("codigo") & """," & _
                   """nombre"":""" & EscapeJson(rs("nombre")) & """," & _
                   """email"":""" & IIf(IsNull(rs("email")), "", rs("email")) & """," & _
                   """activo"":true" & _
                   "}"

        url = API_BASE & "/vendedores"
        Call HttpPost(url, jsonData)

        rs.MoveNext
    Loop

    rs.Close
    conn.Close
    Set rs = Nothing
    Set conn = Nothing

    MsgBox "Vendedores sincronizados correctamente", vbInformation
End Sub

Private Function EscapeJson(texto As String) As String
    ' Escapar caracteres especiales para JSON
    texto = Replace(texto, "\", "\\")
    texto = Replace(texto, """", "\""")
    texto = Replace(texto, vbCrLf, "\n")
    texto = Replace(texto, vbCr, "\n")
    texto = Replace(texto, vbLf, "\n")
    EscapeJson = texto
End Function
```

### 3B. Sincronización de Clientes (modSyncClientes.bas)

```vb
' modSyncClientes.bas - Sincroniza clientes desde Supabase al ERP
Option Explicit

Public Sub SincronizarClientesDesdeNube()
    Dim url As String
    Dim response As String
    Dim clientes As Object
    Dim cliente As Object
    Dim i As Long
    Dim conn As ADODB.Connection
    Dim cmd As ADODB.Command

    ' Obtener clientes de Supabase
    url = API_BASE & "/clientes?activo=eq.true"
    response = HttpGet(url)

    If response = "" Then Exit Sub

    ' Parsear JSON (requiere VB-JSON)
    Set clientes = JsonConverter.ParseJson(response)

    Set conn = New ADODB.Connection
    conn.ConnectionString = "Provider=SQLOLEDB;Data Source=tu_servidor;Initial Catalog=tu_bd;User ID=usuario;Password=password;"
    conn.Open

    For i = 1 To clientes.Count
        Set cliente = clientes(i)

        ' Verificar si el cliente existe
        Set cmd = New ADODB.Command
        cmd.ActiveConnection = conn
        cmd.CommandText = "SELECT COUNT(*) FROM Clientes WHERE ruc = ?"
        cmd.Parameters.Append cmd.CreateParameter("ruc", adVarChar, adParamInput, 13, cliente("ruc"))

        Dim existe As Long
        existe = cmd.Execute()(0)

        If existe = 0 Then
            ' Insertar nuevo cliente
            Set cmd = New ADODB.Command
            cmd.ActiveConnection = conn
            cmd.CommandText = "INSERT INTO Clientes (ruc, nombres_completos, correo, telefono) " & _
                              "VALUES (?, ?, ?, ?)"
            cmd.Parameters.Append cmd.CreateParameter("ruc", adVarChar, adParamInput, 13, cliente("ruc"))
            cmd.Parameters.Append cmd.CreateParameter("nombres", adVarChar, adParamInput, 200, cliente("nombres_completos"))
            cmd.Parameters.Append cmd.CreateParameter("correo", adVarChar, adParamInput, 100, IIf(IsNull(cliente("correo")), "", cliente("correo")))
            cmd.Parameters.Append cmd.CreateParameter("telefono", adVarChar, adParamInput, 20, IIf(IsNull(cliente("telefono")), "", cliente("telefono")))
            cmd.Execute

            Debug.Print "Cliente nuevo agregado: " & cliente("ruc") & " - " & cliente("nombres_completos")
        End If
    Next i

    conn.Close
    Set conn = Nothing

    MsgBox "Clientes sincronizados desde la nube", vbInformation
End Sub
```

### 4. Sincronización de Artículos (modSyncArticulos.bas)

```vb
' modSyncArticulos.bas - Sincroniza artículos desde el ERP a Supabase
Option Explicit

Public Sub SincronizarArticulos()
    Dim rs As ADODB.Recordset
    Dim conn As ADODB.Connection
    Dim jsonData As String
    Dim url As String
    Dim contador As Long

    Set conn = New ADODB.Connection
    conn.ConnectionString = "Provider=SQLOLEDB;Data Source=tu_servidor;Initial Catalog=tu_bd;User ID=usuario;Password=password;"
    conn.Open

    Set rs = New ADODB.Recordset
    rs.Open "SELECT codigo, descripcion, precio, costo, stock FROM articulos WHERE activo = 1", conn

    contador = 0
    Do While Not rs.EOF
        jsonData = "{" & _
                   """id"":""" & rs("codigo") & """," & _
                   """descripcion"":""" & EscapeJson(rs("descripcion")) & """," & _
                   """precio"":" & Replace(Str(rs("precio")), ",", ".") & "," & _
                   """costo"":" & Replace(Str(rs("costo")), ",", ".") & "," & _
                   """stock"":" & Replace(Str(rs("stock")), ",", ".") & "," & _
                   """activo"":true" & _
                   "}"

        url = API_BASE & "/articulos"
        Call HttpPost(url, jsonData)

        contador = contador + 1
        If contador Mod 100 = 0 Then
            DoEvents ' Permitir que la UI responda
        End If

        rs.MoveNext
    Loop

    rs.Close
    conn.Close
    Set rs = Nothing
    Set conn = Nothing

    MsgBox contador & " artículos sincronizados correctamente", vbInformation
End Sub

Private Function EscapeJson(texto As String) As String
    texto = Replace(texto, "\", "\\")
    texto = Replace(texto, """", "\""")
    texto = Replace(texto, vbCrLf, "\n")
    texto = Replace(texto, vbCr, "\n")
    texto = Replace(texto, vbLf, "\n")
    EscapeJson = texto
End Function
```

### 5. Leer Proformas Pendientes (modSyncProformas.bas)

```vb
' modSyncProformas.bas - Lee proformas desde Supabase y las importa al ERP
Option Explicit

Public Sub ImportarProformasPendientes()
    Dim url As String
    Dim response As String
    Dim proformas As Object
    Dim proforma As Object
    Dim i As Long

    ' Obtener proformas no sincronizadas
    url = API_BASE & "/proforma_cabecera?sincronizada=eq.false&select=*"
    response = HttpGet(url)

    If response = "" Then Exit Sub

    ' Aquí debes parsear el JSON
    ' Para VB6 se recomienda usar una librería como VB-JSON
    ' https://github.com/VBA-tools/VBA-JSON

    ' Ejemplo simplificado (requiere librería JSON):
    ' Set proformas = JsonConverter.ParseJson(response)
    '
    ' For i = 1 To proformas.Count
    '     Set proforma = proformas(i)
    '     Call InsertarProformaEnERP(proforma)
    '     Call MarcarProformaComoSincronizada(proforma("id"))
    ' Next i

    MsgBox "Proformas importadas correctamente", vbInformation
End Sub

Private Sub InsertarProformaEnERP(proforma As Object)
    Dim conn As ADODB.Connection
    Dim cmd As ADODB.Command
    Dim rs As ADODB.Recordset
    Dim url As String
    Dim detalles As String

    Set conn = New ADODB.Connection
    conn.ConnectionString = "Provider=SQLOLEDB;Data Source=tu_servidor;Initial Catalog=tu_bd;User ID=usuario;Password=password;"
    conn.Open

    conn.BeginTrans

    On Error GoTo ErrorHandler

    ' Insertar cabecera de proforma en tu base local
    Set cmd = New ADODB.Command
    cmd.ActiveConnection = conn
    cmd.CommandText = "INSERT INTO ProformaCabecera (numero, ruc_cliente, nombre_cliente, vendedor_id, total) " & _
                      "VALUES (?, ?, ?, ?, ?)"
    cmd.Parameters.Append cmd.CreateParameter("numero", adVarChar, adParamInput, 50, proforma("numero"))
    cmd.Parameters.Append cmd.CreateParameter("ruc", adVarChar, adParamInput, 20, proforma("ruc_cliente"))
    cmd.Parameters.Append cmd.CreateParameter("nombre", adVarChar, adParamInput, 200, proforma("nombre_cliente"))
    cmd.Parameters.Append cmd.CreateParameter("vendedor", adVarChar, adParamInput, 10, proforma("vendedor_id"))
    cmd.Parameters.Append cmd.CreateParameter("total", adNumeric, adParamInput, , proforma("total"))
    cmd.Execute

    ' Obtener detalles
    url = API_BASE & "/proforma_detalle?proforma_id=eq." & proforma("id")
    detalles = HttpGet(url)

    ' Insertar detalles (requiere parsear JSON)
    ' ... código para insertar detalles ...

    conn.CommitTrans
    conn.Close
    Set conn = Nothing
    Exit Sub

ErrorHandler:
    conn.RollbackTrans
    conn.Close
    Set conn = Nothing
    MsgBox "Error al insertar proforma: " & Err.Description, vbCritical
End Sub

Private Sub MarcarProformaComoSincronizada(proformaId As String)
    Dim url As String
    Dim jsonData As String

    jsonData = "{""sincronizada"":true}"
    url = API_BASE & "/proforma_cabecera?id=eq." & proformaId
    Call HttpPatch(url, jsonData)
End Sub
```

### 6. Función DELETE (agregar a modHTTP.bas)

```vb
Public Function HttpDelete(url As String) As String
    Dim httpReq As Object
    Set httpReq = CreateObject("WinHttp.WinHttpRequest.5.1")

    httpReq.Open "DELETE", url, False
    httpReq.setRequestHeader "apikey", SUPABASE_KEY
    httpReq.setRequestHeader "Authorization", "Bearer " & SUPABASE_KEY
    httpReq.setRequestHeader "Content-Type", "application/json"

    On Error GoTo ErrorHandler
    httpReq.Send

    HttpDelete = httpReq.responseText
    Set httpReq = Nothing
    Exit Function

ErrorHandler:
    MsgBox "Error en petición DELETE: " & Err.Description, vbCritical
    HttpDelete = ""
    Set httpReq = Nothing
End Function
```

## Proceso de Sincronización Recomendado

### 1. Sincronización Diaria (Desde ERP a Nube)

Crear un **Timer** o **Tarea Programada** que ejecute cada noche:

```vb
Private Sub TimerSync_Timer()
    ' Ejecutar a las 2:00 AM
    If Hour(Now) = 2 And Minute(Now) = 0 Then
        Call SincronizarVendedores
        Call SincronizarArticulos
        ' NO sincronizar clientes hacia la nube (solo desde la nube al ERP)
    End If
End Sub
```

### 2. Monitoreo de Proformas y Clientes (Cada 5 minutos)

```vb
Private Sub TimerProformas_Timer()
    ' Revisar cada 5 minutos si hay proformas nuevas o clientes nuevos
    Call ImportarProformasPendientes
    Call SincronizarClientesDesdeNube
End Sub
```

**IMPORTANTE**: Los clientes se sincronizan **desde la nube al ERP** únicamente. Cuando un vendedor crea una proforma con un cliente nuevo en la tablet:
1. El cliente se crea automáticamente en Supabase
2. El ERP detecta el cliente nuevo cada 5 minutos
3. El cliente se agrega al SQL Server local
4. Esto permite que los clientes nuevos estén disponibles inmediatamente en la tablet y se integren al ERP sin intervención manual

## Librería JSON para VB6

Para trabajar con JSON en VB6, se recomienda usar **VB-JSON**:

1. Descargar: https://github.com/VBA-tools/VBA-JSON
2. Importar el módulo `JsonConverter.bas` a tu proyecto VB6
3. Usar para parsear las respuestas de Supabase

## Ejemplo de Parseo de JSON

```vb
Dim json As Object
Dim response As String

response = HttpGet(API_BASE & "/vendedores")
Set json = JsonConverter.ParseJson(response)

' Iterar sobre los resultados
Dim i As Long
For i = 1 To json.Count
    Debug.Print json(i)("nombre")
Next i
```

## Consideraciones Importantes

1. **Manejo de Errores**: Siempre implementar manejo de errores robusto
2. **Logging**: Guardar logs de sincronizaciones en archivo de texto
3. **Performance**: Para 5000 artículos, la sincronización puede tardar varios minutos
4. **Transacciones**: Usar transacciones al insertar proformas en el ERP
5. **Codificación**: Asegurarse de escapar caracteres especiales en JSON

## Configuración en Supabase

1. Ir a: https://app.supabase.com
2. Crear un nuevo proyecto (gratuito)
3. Copiar la **URL** y **anon key** desde Settings → API
4. Las tablas ya están creadas con las migraciones

## Soporte

Para más información sobre la API de Supabase:
- Documentación: https://supabase.com/docs/guides/api
- REST API: https://supabase.com/docs/guides/api/rest

## Resumen del Flujo de Sincronización

### Flujo de Datos

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   ERP VB6   │◄───────►│   SUPABASE   │◄───────►│   TABLET    │
│ SQL Server  │         │  (En la nube)│         │  (Vendedor) │
└─────────────┘         └──────────────┘         └─────────────┘
       │                        │                        │
       │  Vendedores/Art        │                        │
       │──────────────►         │                        │
       │                        │   Buscar Vendedores    │
       │                        │◄───────────────────────│
       │                        │   Buscar Artículos     │
       │                        │◄───────────────────────│
       │                        │   Buscar Clientes      │
       │                        │◄───────────────────────│
       │                        │                        │
       │                        │   Crear Cliente Nuevo  │
       │                        │◄───────────────────────│
       │                        │                        │
       │                        │   Crear Proforma       │
       │                        │◄───────────────────────│
       │   Clientes Nuevos      │                        │
       │◄──────────────         │                        │
       │   Proformas Nuevas     │                        │
       │◄──────────────         │                        │
```

### Sincronización por Tipo de Datos

1. **Vendedores**: ERP → Nube (Diario, 2:00 AM)
2. **Artículos**: ERP → Nube (Diario, 2:00 AM)
3. **Clientes**: Nube → ERP (Cada 5 minutos, automático cuando vendedor crea cliente nuevo)
4. **Proformas**: Nube → ERP (Cada 5 minutos)

### Beneficios del Sistema

- Los vendedores pueden trabajar desde cualquier lugar con internet
- Los clientes nuevos se agregan automáticamente al ERP
- Las proformas se integran al sistema central sin intervención manual
- El stock y precios están siempre actualizados para los vendedores
- Sincronización bidireccional inteligente
