Option Explicit
Dim gSsql
Dim CodigoUUID

' ============================================
' MÓDULO: ModuloSupabase
' Descripción: Sincroniza artículos del ERP a Supabase (schema pedidosbillennium)
' ============================================

Private SUPABASE_URL As String
Private SUPABASE_KEY As String

' ============================================
' FUNCIÓN PRINCIPAL: Sincronizar Artículos
' ============================================
Public Function SincronizarArticulosASupabase() As Boolean
    On Error GoTo ErrorHandler

    Dim conn As ADODB.Connection
    Dim rs As ADODB.Recordset
    Dim totalArticulos As Long
    Dim articulosExitosos As Long
    Dim articulosConError As Long

    totalArticulos = 0
    articulosExitosos = 0
    articulosConError = 0

    Debug.Print "=========================================="
    Debug.Print "Iniciando sincronización de artículos..."
    Debug.Print "=========================================="

    Set conn = New ADODB.Connection
    conn.ConnectionString = "Provider=MSOLEDBSQL;Server=WIN-JK451I3AKU9;Database=EuroP;Uid=sa;Pwd=Passw0rd;"
    conn.Open
    Debug.Print "Conectado a la base de datos local del ERP"

    Set rs = New ADODB.Recordset

    ' --- Lectura de configuración desde Tasas ---
    ' Codigo Empresa (UUID en Supabase)
    gSsql = "Select Tas_Comentario From Tasas Where Tas_Codigo = 3"
    rs.Open gSsql, conn, adOpenForwardOnly, adLockReadOnly
    CodigoUUID = rs!Tas_Comentario
    rs.Close

    ' SUPABASE_URL
    gSsql = "Select Tas_Comentario From Tasas Where Tas_Codigo = 4"
    rs.Open gSsql, conn, adOpenForwardOnly, adLockReadOnly
    SUPABASE_URL = rs!Tas_Comentario
    rs.Close

    ' SUPABASE_KEY
    gSsql = "Select Tas_Comentario From Tasas Where Tas_Codigo = 5"
    rs.Open gSsql, conn, adOpenForwardOnly, adLockReadOnly
    SUPABASE_KEY = rs!Tas_Comentario
    rs.Close

    Debug.Print "Empresa UUID: " & CodigoUUID
    Debug.Print "Supabase URL: " & SUPABASE_URL

    ' --- Lectura de inventario del ERP ---
    gSsql = "SELECT Inventario.Inv_Codigo, Inventario.Inv_Descripcion, Inventario.Inv_Precio, " & _
            "Item_Bodega.Ite_CostoP, Item_Bodega.Ite_Cantidad, Item_Bodega.Ite_Bodega " & _
            "FROM Inventario INNER JOIN Item_Bodega " & _
            "ON Inventario.Inv_Codigo = Item_Bodega.Ite_Inventario " & _
            "Where (Inventario.Inv_Status = 0) And (Item_Bodega.Ite_Bodega = 1)"

    rs.Open gSsql, conn, adOpenForwardOnly, adLockReadOnly
    Debug.Print "Consultando artículos del inventario..."

    ' --- Paso 1: vaciar artículos en Supabase (schema pedidosbillennium) ---
    Debug.Print "Vaciando artículos en Supabase (empresa " & CodigoUUID & ")..."
    If Not VaciarArticulosSupabaseDirect Then
        Debug.Print "ERROR: No se pudo vaciar la tabla articulos en Supabase."
        SincronizarArticulosASupabase = False
        rs.Close
        conn.Close
        Exit Function
    End If
    Debug.Print "Tabla vaciada exitosamente."

    ' --- Paso 2: insertar artículos uno por uno ---
    Debug.Print "Insertando artículos en Supabase..."

    Do While Not rs.EOF
        Dim codigo As String
        Dim descripcion As String
        Dim precio As Double
        Dim costo As Double
        Dim stock As Double

        codigo = Trim(rs.Fields("Inv_Codigo").Value & "")
        descripcion = Trim(rs.Fields("Inv_Descripcion").Value & "")
        precio = IIf(IsNull(rs.Fields("Inv_Precio").Value), 0, rs.Fields("Inv_Precio").Value)
        costo = IIf(IsNull(rs.Fields("Ite_CostoP").Value), 0, rs.Fields("Ite_CostoP").Value)
        stock = IIf(IsNull(rs.Fields("Ite_Cantidad").Value), 0, rs.Fields("Ite_Cantidad").Value)

        If Len(codigo) > 0 Then
            If InsertarArticuloSupabase(codigo, descripcion, precio, costo, stock) Then
                articulosExitosos = articulosExitosos + 1
                If articulosExitosos Mod 50 = 0 Then
                    Debug.Print "  Insertados: " & articulosExitosos
                End If
            Else
                articulosConError = articulosConError + 1
                Debug.Print "  Error en artículo: " & codigo
            End If
        End If

        totalArticulos = totalArticulos + 1
        rs.MoveNext
    Loop

    rs.Close
    conn.Close

    Debug.Print "=========================================="
    Debug.Print "Sincronización completada."
    Debug.Print "  Total leídos  : " & totalArticulos
    Debug.Print "  Insertados OK : " & articulosExitosos
    Debug.Print "  Con error     : " & articulosConError
    Debug.Print "=========================================="

    SincronizarArticulosASupabase = True
    Exit Function

ErrorHandler:
    Debug.Print "ERROR GENERAL: " & Err.Description
    MsgBox "Error en la sincronización: " & Err.Description, vbCritical, "Error"
    SincronizarArticulosASupabase = False
End Function

' ============================================
' Vaciar artículos por empresa en schema pedidosbillennium
' FIX: WinHttp (TLS 1.2) + Content-Profile para DELETE
' ============================================
Function VaciarArticulosSupabaseDirect() As Boolean
    Dim http As Object
    Dim url As String
    Dim statusCode As Long
    Dim responseText As String

    On Error GoTo ErrorHandler

    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")

    url = SUPABASE_URL & "/rest/v1/articulos?empresa_id=eq." & CodigoUUID

    http.Open "DELETE", url, False
    http.SetRequestHeader "apikey", SUPABASE_KEY
    http.SetRequestHeader "Authorization", "Bearer " & SUPABASE_KEY
    http.SetRequestHeader "Content-Profile", "pedidosbillennium"
    http.SetRequestHeader "Prefer", "return=minimal"

    http.Send

    statusCode = http.Status
    responseText = http.responseText

    Debug.Print "  DELETE articulos → Status: " & statusCode
    If Len(responseText) > 0 Then
        Debug.Print "  Respuesta: " & responseText
    End If

    VaciarArticulosSupabaseDirect = (statusCode >= 200 And statusCode < 300)

    Set http = Nothing
    Exit Function

ErrorHandler:
    Debug.Print "Error en VaciarArticulosSupabaseDirect: " & Err.Description
    VaciarArticulosSupabaseDirect = False
End Function

' ============================================
' Insertar un artículo en Supabase (schema pedidosbillennium)
' FIX: merge-duplicates para PK compuesta (id, empresa_id)
' ============================================
Private Function InsertarArticuloSupabase(ByVal codigo As String, _
                                          ByVal descripcion As String, _
                                          ByVal precio As Double, _
                                          ByVal costo As Double, _
                                          ByVal stock As Double) As Boolean
    On Error GoTo ErrorHandler

    Dim http As Object
    Dim url As String
    Dim jsonData As String

    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")

    url = SUPABASE_URL & "/rest/v1/articulos"

    ' Sanitizar descripción
    descripcion = Replace(descripcion, """", "'")
    descripcion = Replace(descripcion, vbCrLf, " ")
    descripcion = Replace(descripcion, vbCr, " ")
    descripcion = Replace(descripcion, vbLf, " ")

    jsonData = "{" & _
        """id"":""" & codigo & """," & _
        """descripcion"":""" & descripcion & """," & _
        """precio"":" & Replace(Format(precio, "0.00"), ",", ".") & "," & _
        """costo"":" & Replace(Format(costo, "0.00"), ",", ".") & "," & _
        """stock"":" & Replace(Format(stock, "0.00"), ",", ".") & "," & _
        """activo"":true," & _
        """empresa_id"":""" & CodigoUUID & """" & _
        "}"

    http.Open "POST", url, False
    http.SetRequestHeader "apikey", SUPABASE_KEY
    http.SetRequestHeader "Authorization", "Bearer " & SUPABASE_KEY
    http.SetRequestHeader "Content-Type", "application/json"
    http.SetRequestHeader "Content-Profile", "pedidosbillennium"
    http.SetRequestHeader "Prefer", "resolution=merge-duplicates,return=minimal"

    http.Send jsonData

    If http.Status = 201 Or http.Status = 200 Then
        InsertarArticuloSupabase = True
    Else
        Debug.Print "  Error " & codigo & " → Status: " & http.Status & " | " & Left(http.responseText, 150)
        InsertarArticuloSupabase = False
    End If

    Set http = Nothing
    Exit Function

ErrorHandler:
    Debug.Print "Error en InsertarArticuloSupabase: " & Err.Description
    InsertarArticuloSupabase = False
End Function
