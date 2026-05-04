# Código Visual Basic 6 para Sincronizar Artículos del ERP a Supabase

Este código sincroniza automáticamente los artículos desde tu base de datos local del ERP hacia Supabase en la nube.

## Requisitos Previos

1. **Agregar referencia en VB6:**
   - Ve a `Proyecto` → `Referencias`
   - Marca: `Microsoft WinHTTP Services, version 5.1`
   - Marca: `Microsoft ActiveX Data Objects 2.x Library` (ADO)

2. **Configuración de Supabase:**
   - URL: `https://nxcngfxiubexepmintwf.supabase.co`
   - ANON KEY: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54Y25nZnhpdWJleGVwbWludHdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjM5ODgsImV4cCI6MjA4MTYzOTk4OH0.iQtSmiYgAmiWMr1Uo-xhleMEBa8vwVXZVkp8-TbaRWU`

---

## Código VB6 Completo

```vb
Option Explicit

' ============================================
' MÓDULO: ModuloSupabase
' Descripción: Sincroniza artículos del ERP a Supabase
' ============================================

Private Const SUPABASE_URL As String = "https://nxcngfxiubexepmintwf.supabase.co"
Private Const SUPABASE_KEY As String = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54Y25nZnhpdWJleGVwbWludHdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjM5ODgsImV4cCI6MjA4MTYzOTk4OH0.iQtSmiYgAmiWMr1Uo-xhleMEBa8vwVXZVkp8-TbaRWU"

' ============================================
' FUNCIÓN PRINCIPAL: Sincronizar Artículos
' ============================================
Public Function SincronizarArticulosASupabase(ByVal empresaUUID As String) As Boolean
    On Error GoTo ErrorHandler

    Dim conn As ADODB.Connection
    Dim rs As ADODB.Recordset
    Dim totalArticulos As Long
    Dim articulosExitosos As Long
    Dim articulosConError As Long

    ' Inicializar contadores
    totalArticulos = 0
    articulosExitosos = 0
    articulosConError = 0

    ' Validar que se proporcionó el UUID
    If Len(empresaUUID) = 0 Then
        Debug.Print "Error: No se proporcionó el UUID de la empresa"
        MsgBox "Error: Debe proporcionar el UUID de la empresa", vbCritical, "Error"
        SincronizarArticulosASupabase = False
        Exit Function
    End If

    ' Mostrar mensaje de inicio
    Debug.Print "=========================================="
    Debug.Print "Iniciando sincronización de artículos..."
    Debug.Print "Empresa UUID: " & empresaUUID
    Debug.Print "=========================================="

    ' PASO 1: Conectar a la base de datos local del ERP
    Set conn = New ADODB.Connection

    ' IMPORTANTE: Modifica esta cadena de conexión según tu base de datos
    ' Ejemplos comunes:

    ' Para SQL Server:
    ' conn.ConnectionString = "Provider=SQLOLEDB;Data Source=TU_SERVIDOR;Initial Catalog=TU_BASE_DATOS;User ID=usuario;Password=contraseña;"

    ' Para Access:
    ' conn.ConnectionString = "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=C:\Ruta\TuBaseDatos.mdb;"

    ' Para MySQL:
    ' conn.ConnectionString = "DRIVER={MySQL ODBC 5.3 Driver};SERVER=localhost;DATABASE=tu_base;USER=usuario;PASSWORD=contraseña;"

    ' MODIFICA ESTA LÍNEA CON TU CONEXIÓN:
    conn.ConnectionString = "Provider=SQLOLEDB;Data Source=localhost;Initial Catalog=ERP_DATABASE;Integrated Security=SSPI;"
    conn.Open

    Debug.Print "Conectado a la base de datos local del ERP"

    ' PASO 2: Leer artículos de la tabla Inventario
    Set rs = New ADODB.Recordset

    ' IMPORTANTE: Modifica esta consulta según los nombres de tus campos
    ' Ajusta los nombres de campos según tu tabla Inventario
    ' rs.Open "SELECT Codigo, Descripcion, Precio, Costo, Stock, TasaIVA FROM Inventario WHERE Activo = 1", conn, adOpenForwardOnly, adLockReadOnly

    Debug.Print "Consultando artículos del inventario..."

    ' Contar total de registros
    If Not rs.EOF Then
        rs.MoveLast
        totalArticulos = rs.RecordCount
        rs.MoveFirst
        Debug.Print "Total de artículos a sincronizar: " & totalArticulos
    Else
        Debug.Print "No hay artículos para sincronizar"
        SincronizarArticulosASupabase = False
        rs.Close
        conn.Close
        Exit Function
    End If

    ' PASO 3: Vaciar la tabla de artículos en Supabase
    Debug.Print "Vaciando tabla de artículos en Supabase..."
    If Not VaciarArticulosSupabase(empresaUUID) Then
        Debug.Print "Error al vaciar tabla en Supabase"
        SincronizarArticulosASupabase = False
        rs.Close
        conn.Close
        Exit Function
    End If
    Debug.Print "Tabla vaciada exitosamente"

    ' PASO 4: Insertar artículos uno por uno en Supabase
    Debug.Print "Insertando artículos en Supabase..."

    Do While Not rs.EOF
        Dim codigo As String
        Dim descripcion As String
        Dim precio As Double
        Dim costo As Double
        Dim stock As Double
        Dim tasaIva As Double

        ' Leer datos del recordset
        codigo = Trim(rs.Fields("Codigo").Value & "")
        descripcion = Trim(rs.Fields("Descripcion").Value & "")
        precio = IIf(IsNull(rs.Fields("Precio").Value), 0, rs.Fields("Precio").Value)
        costo = IIf(IsNull(rs.Fields("Costo").Value), 0, rs.Fields("Costo").Value)
        stock = IIf(IsNull(rs.Fields("Stock").Value), 0, rs.Fields("Stock").Value)
        tasaIva = IIf(IsNull(rs.Fields("TasaIVA").Value), 0, rs.Fields("TasaIVA").Value)

        ' Validar que el código no esté vacío
        If Len(codigo) > 0 Then
            ' Insertar en Supabase
            If InsertarArticuloSupabase(codigo, descripcion, precio, costo, stock, tasaIva, empresaUUID) Then
                articulosExitosos = articulosExitosos + 1
                If articulosExitosos Mod 10 = 0 Then
                    Debug.Print "Procesados: " & articulosExitosos & " de " & totalArticulos
                End If
            Else
                articulosConError = articulosConError + 1
                Debug.Print "Error insertando artículo: " & codigo
            End If
        End If

        rs.MoveNext
    Loop

    ' PASO 5: Cerrar conexiones
    rs.Close
    conn.Close

    ' Mostrar resumen
    Debug.Print "=========================================="
    Debug.Print "Sincronización completada"
    Debug.Print "Total procesados: " & totalArticulos
    Debug.Print "Exitosos: " & articulosExitosos
    Debug.Print "Con errores: " & articulosConError
    Debug.Print "=========================================="

    SincronizarArticulosASupabase = True

    ' Mostrar mensaje al usuario
    MsgBox "Sincronización completada" & vbCrLf & _
           "Total: " & totalArticulos & vbCrLf & _
           "Exitosos: " & articulosExitosos & vbCrLf & _
           "Errores: " & articulosConError, vbInformation, "Sincronización de Artículos"

    Exit Function

ErrorHandler:
    Debug.Print "Error: " & Err.Description
    MsgBox "Error en la sincronización: " & Err.Description, vbCritical, "Error"
    SincronizarArticulosASupabase = False
End Function

' ============================================
' NOTA IMPORTANTE SOBRE EMPRESA_ID
' ============================================
' No uses una constante quemada para EMPRESA_ID
' Debes obtener el UUID dinámicamente desde tu sistema VB6
'
' Por ejemplo:
'   - Desde una variable global: gCodigoUUID, gEmpresaID, etc.
'   - Desde un formulario: frmPrincipal.EmpresaID
'   - Desde tu configuración del ERP
'
' Usa ese valor en las funciones donde se requiere empresaUUID

' ============================================
' FUNCIÓN: Vaciar tabla de artículos en Supabase
' SOLO elimina los artículos de la empresa configurada
' ============================================
Private Function VaciarArticulosSupabase(ByVal empresaUUID As String) As Boolean
    On Error GoTo ErrorHandler

    Dim http As Object
    Dim url As String
    Dim responseText As String
    Dim statusCode As Long

    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")

    ' URL para eliminar SOLO los artículos de esta empresa
    ' empresa_id=eq.UUID filtra por empresa específica
    url = SUPABASE_URL & "/rest/v1/articulos?empresa_id=eq." & empresaUUID

    http.Open "DELETE", url, False
    http.SetRequestHeader "apikey", SUPABASE_KEY
    http.SetRequestHeader "Authorization", "Bearer " & SUPABASE_KEY
    http.SetRequestHeader "Content-Type", "application/json"
    http.SetRequestHeader "Prefer", "return=minimal"

    ' Enviar la petición
    http.Send

    statusCode = http.Status

    ' Status 200, 204 o 206 indican éxito
    If statusCode >= 200 And statusCode < 300 Then
        VaciarArticulosSupabase = True
        Debug.Print "Artículos de la empresa vaciados correctamente. Status: " & statusCode
    Else
        Debug.Print "Error vaciando artículos. Status: " & statusCode
        Debug.Print "Respuesta: " & http.responseText
        VaciarArticulosSupabase = False
    End If

    Set http = Nothing
    Exit Function

ErrorHandler:
    Debug.Print "Error en VaciarArticulosSupabase: " & Err.Description
    VaciarArticulosSupabase = False
End Function

' ============================================
' FUNCIÓN: Solo vaciar artículos (sin sincronizar)
' Elimina SOLO los artículos de la empresa configurada
' PROCESO AUTOMÁTICO - SIN confirmaciones
' ============================================
Public Sub SoloVaciarArticulos(ByVal empresaUUID As String)
    Debug.Print "Iniciando vaciado de artículos de la empresa..."
    Debug.Print "UUID: " & empresaUUID

    If VaciarArticulosSupabase(empresaUUID) Then
        Debug.Print "Artículos vaciados correctamente"
    Else
        Debug.Print "Error al vaciar los artículos"
    End If
End Sub

' ============================================
' FUNCIÓN: Insertar un artículo en Supabase
' IMPORTANTE: Ahora incluye el empresa_id
' ============================================
Private Function InsertarArticuloSupabase(ByVal codigo As String, _
                                          ByVal descripcion As String, _
                                          ByVal precio As Double, _
                                          ByVal costo As Double, _
                                          ByVal stock As Double, _
                                          ByVal tasaIva As Double, _
                                          ByVal empresaUUID As String) As Boolean
    On Error GoTo ErrorHandler

    Dim http As Object
    Dim url As String
    Dim jsonData As String

    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")

    ' URL de la API de Supabase
    url = SUPABASE_URL & "/rest/v1/articulos"

    ' Limpiar descripción de caracteres especiales para JSON
    descripcion = Replace(descripcion, """", """""")
    descripcion = Replace(descripcion, vbCrLf, " ")
    descripcion = Replace(descripcion, vbCr, " ")
    descripcion = Replace(descripcion, vbLf, " ")

    ' Crear JSON con los datos del artículo
    ' IMPORTANTE: Ahora incluye empresa_id
    jsonData = "{" & _
        """id"":""" & codigo & """," & _
        """descripcion"":""" & descripcion & """," & _
        """precio"":" & Replace(Format(precio, "0.00"), ",", ".") & "," & _
        """costo"":" & Replace(Format(costo, "0.00"), ",", ".") & "," & _
        """stock"":" & Replace(Format(stock, "0.00"), ",", ".") & "," & _
        """tasa_iva"":" & Replace(Format(tasaIva, "0.00"), ",", ".") & "," & _
        """activo"":true," & _
        """empresa_id"":""" & empresaUUID & """" & _
        "}"

    ' Configurar petición HTTP
    http.Open "POST", url, False
    http.SetRequestHeader "apikey", SUPABASE_KEY
    http.SetRequestHeader "Authorization", "Bearer " & SUPABASE_KEY
    http.SetRequestHeader "Content-Type", "application/json"
    http.SetRequestHeader "Prefer", "return=representation"

    ' Enviar datos
    http.Send jsonData

    ' Verificar respuesta
    If http.Status = 201 Then
        InsertarArticuloSupabase = True
    Else
        Debug.Print "Error insertando " & codigo & ". Status: " & http.Status
        Debug.Print "JSON enviado: " & jsonData
        Debug.Print "Respuesta: " & http.responseText
        InsertarArticuloSupabase = False
    End If

    Set http = Nothing
    Exit Function

ErrorHandler:
    Debug.Print "Error en InsertarArticuloSupabase: " & Err.Description
    InsertarArticuloSupabase = False
End Function

' ============================================
' FUNCIÓN: Ejecutar sincronización desde un botón
' ============================================
Public Sub EjecutarSincronizacion()
    Dim resultado As Boolean
    Dim empresaUUID As String

    ' IMPORTANTE: Obtén el UUID de tu empresa desde tu sistema VB6
    ' Ejemplo: empresaUUID = gCodigoUUID
    ' O desde un formulario: empresaUUID = frmPrincipal.EmpresaID
    ' Reemplaza esta línea con tu lógica:
    empresaUUID = "TU_EMPRESA_UUID_AQUI"

    If Len(empresaUUID) = 0 Then
        MsgBox "Error: No se encontró el UUID de la empresa", vbCritical, "Error"
        Exit Sub
    End If

    ' Preguntar al usuario si desea sincronizar
    If MsgBox("¿Desea sincronizar los artículos con la nube?" & vbCrLf & _
              "Este proceso vaciará la tabla de artículos en Supabase" & vbCrLf & _
              "y la llenará con los datos actuales del ERP.", _
              vbQuestion + vbYesNo, "Confirmar Sincronización") = vbYes Then

        resultado = SincronizarArticulosASupabase(empresaUUID)

        If resultado Then
            Debug.Print "Sincronización completada exitosamente"
        Else
            Debug.Print "Sincronización finalizada con errores"
        End If
    End If
End Sub
```

---

## Cómo Usar el Código

### 1. Crear un Módulo en VB6

1. En tu proyecto VB6, ve a `Proyecto` → `Agregar Módulo`
2. Nombra el módulo: `ModuloSupabase`
3. Copia y pega el código completo

### 2. Modificar la Cadena de Conexión

Busca esta línea en el código:

```vb
conn.ConnectionString = "Provider=SQLOLEDB;Data Source=localhost;Initial Catalog=ERP_DATABASE;Integrated Security=SSPI;"
```

**Reemplázala** con tu cadena de conexión real. Ejemplos:

**SQL Server con autenticación de Windows:**
```vb
conn.ConnectionString = "Provider=SQLOLEDB;Data Source=NOMBRE_SERVIDOR;Initial Catalog=NOMBRE_BASE_DATOS;Integrated Security=SSPI;"
```

**SQL Server con usuario y contraseña:**
```vb
conn.ConnectionString = "Provider=SQLOLEDB;Data Source=NOMBRE_SERVIDOR;Initial Catalog=NOMBRE_BASE_DATOS;User ID=usuario;Password=contraseña;"
```

**Access:**
```vb
conn.ConnectionString = "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=C:\Ruta\Completa\BaseDatos.mdb;"
```

### 3. Modificar la Consulta SQL

Busca esta línea:

```vb
rs.Open "SELECT Codigo, Descripcion, Precio, Costo, Stock FROM Inventario WHERE Activo = 1", conn
```

**Ajusta los nombres de campos** según tu tabla:
- Si tu campo de código se llama diferente (ej: `CodigoArticulo`, `IdArticulo`), cámbialo
- Si tu tabla se llama diferente (ej: `Articulos`, `Productos`), cámbiala
- Si no tienes el campo `Activo`, quita esa condición: `WHERE Activo = 1`

### 4. Crear un Botón en tu Formulario

Agrega un botón a tu formulario principal y en el evento `Click`:

```vb
Private Sub btnSincronizar_Click()
    Call EjecutarSincronizacion
End Sub
```

### 5. Automatizar la Sincronización

**Para ejecutar automáticamente al inicio del día:**

Opción A - En el evento `Form_Load` de tu formulario principal:
```vb
Private Sub Form_Load()
    ' Verificar si ya se sincronizó hoy
    Dim ultimaSinc As Date
    ultimaSinc = GetSetting("MiApp", "Sincronizacion", "UltimaFecha", "1/1/1900")

    If Date > ultimaSinc Then
        ' Sincronizar automáticamente
        Call SincronizarArticulosASupabase

        ' Guardar fecha de sincronización
        SaveSetting "MiApp", "Sincronizacion", "UltimaFecha", Date
    End If
End Sub
```

Opción B - Crear un Timer para sincronizar cada X horas:
```vb
Private Sub Timer1_Timer()
    ' Timer configurado en 14400000 milisegundos = 4 horas
    Call SincronizarArticulosASupabase
End Sub
```

---

## Notas Importantes

1. **Primera Prueba**: Ejecuta manualmente desde el botón primero para verificar que todo funciona
2. **Logs**: Todos los mensajes se muestran en la ventana `Immediate` (Ctrl+G en VB6)
3. **Errores**: Si hay errores, revisa:
   - La cadena de conexión a tu base de datos
   - Los nombres de campos en la consulta SQL
   - Que las referencias de VB6 estén agregadas
4. **Rendimiento**: Si tienes muchos artículos (más de 1000), considera insertar en lotes
5. **Internet**: El proceso requiere conexión a internet para comunicarse con Supabase

---

## Solución de Problemas Comunes

### Error: "Provider cannot be found"
- Verifica que la cadena de conexión tenga el Provider correcto
- Instala los drivers ODBC/OLEDB necesarios

### Error: "Object required"
- Verifica que agregaste la referencia `Microsoft WinHTTP Services`

### Error: "Field not found"
- Los nombres de campos en tu consulta SQL no coinciden con tu tabla
- Revisa y ajusta los nombres de campos

### Error 401 o 403 en Supabase
- Verifica que las políticas RLS estén configuradas correctamente
- El ANON_KEY tiene permisos limitados por diseño

---

## Para Ejecutar Múltiples Veces al Día

Opción recomendada: Usar un Timer

```vb
' En el formulario principal
Private Sub Form_Load()
    ' Configurar timer para 4 horas (14400000 ms)
    Timer1.Interval = 14400000
    Timer1.Enabled = True

    ' Sincronizar inmediatamente al cargar
    Call SincronizarArticulosASupabase
End Sub

Private Sub Timer1_Timer()
    Call SincronizarArticulosASupabase
End Sub
```

---

## Contacto y Soporte

Si necesitas ayuda para:
- Ajustar la cadena de conexión a tu base de datos específica
- Modificar los nombres de campos
- Optimizar el rendimiento
- Programar sincronizaciones automáticas

Solo avísame y te ayudaré con tu caso específico.
