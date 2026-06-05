import * as XLSX from 'xlsx'

interface ColDef { key: string; label: string; width?: number }

interface ExcelParams {
    empresa: { nombre: string; ruc: string }
    titulo: string
    periodo?: string
    columnas: ColDef[]
    filas: Record<string, string | number | null | undefined>[]
    nombreArchivo: string
    hojaExtra?: { nombre: string; aoa: (string | number)[][] }
}

export function exportarExcelProfesional({
    empresa, titulo, periodo, columnas, filas, nombreArchivo, hojaExtra,
}: ExcelParams) {
    const fechaGen = new Date().toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const labels   = columnas.map(c => c.label)
    const lastCol  = columnas.length - 1

    const aoa: (string | number | null | undefined)[][] = [
        ['', '', '', '', ''],
        [empresa.nombre],
        [`RUC: ${empresa.ruc}`],
        [titulo.toUpperCase()],
        periodo ? [`Período: ${periodo}`] : [`Fecha: ${fechaGen}`],
        [`Generado el: ${fechaGen}`],
        [],
        labels,
        ...filas.map(f => columnas.map(c => f[c.key] ?? '')),
    ]

    const ws = XLSX.utils.aoa_to_sheet(aoa)

    ws['!cols'] = columnas.map(c => ({ wch: c.width ?? 18 }))

    ws['!merges'] = [
        { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: lastCol } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: lastCol } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: lastCol } },
        { s: { r: 5, c: 0 }, e: { r: 5, c: lastCol } },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, titulo.slice(0, 30))

    if (hojaExtra) {
        const ws2 = XLSX.utils.aoa_to_sheet(hojaExtra.aoa)
        XLSX.utils.book_append_sheet(wb, ws2, hojaExtra.nombre.slice(0, 30))
    }

    XLSX.writeFile(wb, `${nombreArchivo}.xlsx`)
}
