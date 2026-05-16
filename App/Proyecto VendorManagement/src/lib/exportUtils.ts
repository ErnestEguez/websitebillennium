import * as XLSX from 'xlsx'

export function imprimirPagina() {
    window.print()
}

export function exportarExcel(
    datos: Record<string, unknown>[],
    nombreArchivo: string,
    columnas?: Record<string, string>   // { campo: 'Título visible' }
) {
    if (!datos.length) { alert('No hay datos para exportar'); return }

    let filas: Record<string, unknown>[] = datos
    if (columnas) {
        filas = datos.map(row => {
            const out: Record<string, unknown> = {}
            Object.entries(columnas).forEach(([campo, titulo]) => {
                out[titulo] = row[campo] ?? ''
            })
            return out
        })
    }

    const ws = XLSX.utils.json_to_sheet(filas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Datos')
    XLSX.writeFile(wb, `${nombreArchivo}.xlsx`)
}
