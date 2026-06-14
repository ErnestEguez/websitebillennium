// ============================================================
// Tipos TypeScript — Puntos de Emisión SRI (schema public)
// ============================================================

export interface PuntoEmision {
    id: string
    empresa_id: string
    establecimiento: string   // 3 dígitos, ej. '001'
    punto_emision: string     // 3 dígitos, ej. '001'
    nombre: string
    direccion?: string | null
    descripcion?: string | null
    // Secuencial actual por tipo de comprobante, ej. { FACTURA: 1500, NOTA_CREDITO: 12 }
    secuenciales: Record<string, number>
    bodega_id?: string | null
    es_principal: boolean
    activo: boolean
    created_at?: string
    updated_at?: string
    // join
    bodega?: { nombre: string; codigo?: string | null }
}
