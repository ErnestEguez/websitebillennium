import * as XLSX from 'xlsx'

// Extensión de accept para inputs de archivo que aceptan CSV/TXT o Excel.
export const ACCEPT_CSV_EXCEL = '.csv,.txt,.xlsx,.xls'

export function esArchivoExcel(file: File): boolean {
    return /\.xlsx?$/i.test(file.name)
}

function celdaAString(cell: unknown): string {
    if (cell === null || cell === undefined) return ''
    if (cell instanceof Date) {
        // DD/MM/YYYY — mismo formato que ya esperan los parsers de fecha
        // de las pantallas de migración (parseFecha), no ISO.
        const y = cell.getFullYear()
        const m = String(cell.getMonth() + 1).padStart(2, '0')
        const d = String(cell.getDate()).padStart(2, '0')
        return `${d}/${m}/${y}`
    }
    // raw:true en sheet_to_json ya deja los números como number de JS, sin
    // el formato de la celda (que redondearía visualmente) — String() los
    // convierte con toda su precisión real, igual que un CSV nunca los toca.
    return String(cell).trim()
}

// Lee la primera hoja de un Excel y la devuelve como filas de strings, con
// la misma forma que produce un parser CSV (array de filas → array de
// celdas), para que el resto del pipeline de importación de cada pantalla
// no tenga que distinguir el origen del archivo.
export async function leerFilasExcel(file: File): Promise<string[][]> {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as unknown[][]
    return rows.map(row => row.map(celdaAString))
}
