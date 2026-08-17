// Repara texto que se importó asumiendo Windows-1252 pero en realidad
// venía en CP437/CP850 (codepage de DOS) — típico de sistemas viejos tipo
// Clipper/FoxPro migrados a QuickInvoice. Ver la migración
// 20260817_fn_correccion_codificacion.sql para el contexto completo.
//
// Ejemplo real: "CEDEÑO" (con Ñ = byte 0xA5 en CP437) se decodificó como
// Windows-1252, donde ese mismo byte 0xA5 es "¥" — quedó guardado como
// "CEDE¥O".

// Windows-1252 en el rango 0x80-0x9F tiene símbolos propios que NO
// coinciden con su código Unicode (a diferencia de 0xA0-0xFF, que sí
// coincide con Latin-1). Mapa inverso: carácter -> byte Windows-1252.
const WIN1252_ESPECIALES_A_BYTE: Record<string, number> = {
    '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
    'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E,
    '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94,
    '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99,
    'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F,
}

// Tabla CP437/CP850 para el bloque 0x80-0xAF — cubre letras acentuadas y
// símbolos de moneda/puntuación usados en español. CP437 y CP850
// coinciden en este bloque (por eso no hace falta distinguir cuál de las
// dos fue el origen real). El resto de CP437 (0xB0+) son caracteres de
// dibujo de líneas o letras griegas, que no deberían aparecer en un
// nombre de cliente o producto — fuera de alcance a propósito.
const CP437_0x80_0xAF: Record<number, string> = {
    0x80: 'Ç', 0x81: 'ü', 0x82: 'é', 0x83: 'â', 0x84: 'ä', 0x85: 'à', 0x86: 'å', 0x87: 'ç',
    0x88: 'ê', 0x89: 'ë', 0x8A: 'è', 0x8B: 'ï', 0x8C: 'î', 0x8D: 'ì', 0x8E: 'Ä', 0x8F: 'Å',
    0x90: 'É', 0x91: 'æ', 0x92: 'Æ', 0x93: 'ô', 0x94: 'ö', 0x95: 'ò', 0x96: 'û', 0x97: 'ù',
    0x98: 'ÿ', 0x99: 'Ö', 0x9A: 'Ü', 0x9B: '¢', 0x9C: '£', 0x9D: '¥', 0x9E: '₧', 0x9F: 'ƒ',
    0xA0: 'á', 0xA1: 'í', 0xA2: 'ó', 0xA3: 'ú', 0xA4: 'ñ', 0xA5: 'Ñ', 0xA6: 'ª', 0xA7: 'º',
    0xA8: '¿', 0xA9: '⌐', 0xAA: '¬', 0xAB: '½', 0xAC: '¼', 0xAD: '¡', 0xAE: '«', 0xAF: '»',
}

function byteWindows1252(char: string): number | null {
    const code = char.codePointAt(0)!
    if (code >= 0xA0 && code <= 0xFF) return code
    return WIN1252_ESPECIALES_A_BYTE[char] ?? null
}

// Revierte cada carácter recuperable. Devuelve null si no encontró nada
// que corregir (para que la pantalla lo marque como "revisar a mano" en
// vez de proponer un cambio vacío/idéntico).
export function repararTextoCP437(texto: string): string | null {
    let out = ''
    let cambios = 0
    for (const ch of texto) {
        const byte = byteWindows1252(ch)
        const original = byte !== null ? CP437_0x80_0xAF[byte] : undefined
        if (original !== undefined) {
            out += original
            cambios++
        } else {
            out += ch
        }
    }
    return cambios > 0 ? out : null
}
