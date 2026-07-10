export interface MisionMeta {
    id:          string
    nombre:      string
    descripcion: string
    modulo:      string
    icono:       string
    ruta:        string
}

export interface MisionPaso {
    id:     string
    orden:  number
    titulo: string
    texto:  string
    target: string
    accion: 'click' | 'fill' | 'observe' | 'navigate'
    ruta?:  string
}

export interface MisionConPasos extends MisionMeta {
    pasos: MisionPaso[]
}

export interface ProgresoMision {
    mision_id:  string
    completada: boolean
    paso_actual: number
}
