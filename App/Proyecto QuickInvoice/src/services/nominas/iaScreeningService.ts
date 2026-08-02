import { supabase } from '../../lib/supabase'
import { geminiService } from '../geminiService'
import { storageService } from '../storageService'
import type { Candidato, Vacante, IARecomendacion } from '../../types/nominas'

const nominas = () => supabase.schema('nominas')

export interface IAAnalisis {
    score: number
    recomendacion: IARecomendacion
    resumen: string
    fortalezas: string[]
    alertas: string[]
    habilidades: string[]
    preguntas_entrevista: string[]
}

const PROMPT_SISTEMA = `Eres un experto en Recursos Humanos para empresas ecuatorianas.
Analiza el CV del candidato en relación a la vacante descrita y devuelve ÚNICAMENTE un objeto JSON válido, sin texto adicional, sin bloques de código markdown.`

function buildPrompt(vacante: Vacante, nombreCandidato: string): string {
    return `${PROMPT_SISTEMA}

VACANTE:
- Título: ${vacante.titulo}
- Descripción: ${vacante.descripcion ?? 'No especificada'}
- Cargo: ${vacante.cargo?.nombre ?? 'No especificado'}
- Sección: ${vacante.seccion?.nombre ?? 'No especificada'}
- Sueldo referencial: ${vacante.sueldo_referencial ? `$${vacante.sueldo_referencial}` : 'No especificado'}
- Tipo de contrato: ${vacante.tipo_contrato ?? 'No especificado'}

CANDIDATO: ${nombreCandidato}

Analiza el CV adjunto y devuelve ÚNICAMENTE este JSON:
{
  "score": <número entero 0-100 que indica el ajuste del candidato a la vacante>,
  "recomendacion": "<exactamente uno de: Altamente recomendado, Recomendado, A evaluar, No apto>",
  "resumen": "<2-3 oraciones evaluando al candidato para esta vacante específica>",
  "fortalezas": ["<fortaleza 1>", "<fortaleza 2>", "<fortaleza 3>"],
  "alertas": ["<alerta o brecha 1>", "<alerta o brecha 2>"],
  "habilidades": ["<skill o competencia encontrada en el CV>", "..."],
  "preguntas_entrevista": ["<pregunta enfocada en una brecha o punto clave 1>", "<pregunta 2>", "<pregunta 3>"]
}

Criterios de puntuación:
- 80-100: Perfil muy alineado a la vacante
- 60-79: Buen candidato con aspectos a profundizar
- 40-59: Candidato que requiere evaluación adicional
- 0-39: Perfil poco alineado a la vacante`
}

function parsearRespuesta(texto: string): IAAnalisis {
    // Limpiar markdown si Gemini lo envuelve en ```json ... ```
    const limpio = texto.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(limpio)
    return {
        score:                Math.min(100, Math.max(0, parseInt(parsed.score) || 0)),
        recomendacion:        parsed.recomendacion ?? 'A evaluar',
        resumen:              parsed.resumen ?? '',
        fortalezas:           Array.isArray(parsed.fortalezas) ? parsed.fortalezas : [],
        alertas:              Array.isArray(parsed.alertas) ? parsed.alertas : [],
        habilidades:          Array.isArray(parsed.habilidades) ? parsed.habilidades : [],
        preguntas_entrevista: Array.isArray(parsed.preguntas_entrevista) ? parsed.preguntas_entrevista : [],
    }
}

export const iaScreeningService = {

    async evaluarCandidato(candidato: Candidato, vacante: Vacante): Promise<IAAnalisis> {
        if (!candidato.cv_url) throw new Error('El candidato no tiene CV cargado')

        // 1. Obtener URL descargable del CV
        const cvUrl = storageService.isStoragePath(candidato.cv_url)
            ? await storageService.getSignedUrl(candidato.cv_url, 300)
            : candidato.cv_url

        // 2. Convertir CV a base64 para enviar a Gemini
        const { data, mime_type } = await geminiService.urlToBase64(cvUrl)

        // 3. Construir el prompt y llamar a Gemini con el CV adjunto
        const nombreCandidato = `${candidato.nombres} ${candidato.apellidos}`
        const texto = await geminiService.generateContent([
            { text: buildPrompt(vacante, nombreCandidato) },
            { inline_data: { mime_type, data } },
        ], vacante.empresa_id, 'th_screening_cv')

        // 4. Parsear la respuesta JSON
        return parsearRespuesta(texto)
    },

    async guardarAnalisis(candidatoId: string, analisis: IAAnalisis): Promise<void> {
        const { error } = await nominas()
            .from('candidatos')
            .update({
                ia_score:         analisis.score,
                ia_recomendacion: analisis.recomendacion,
                ia_resumen:       analisis.resumen,
                ia_fortalezas:    analisis.fortalezas,
                ia_alertas:       analisis.alertas,
                ia_habilidades:   analisis.habilidades,
                ia_preguntas:     analisis.preguntas_entrevista,
                ia_evaluado_at:   new Date().toISOString(),
            })
            .eq('id', candidatoId)
        if (error) throw error
    },

    // Evalúa todos los candidatos con CV de una vacante en paralelo
    async evaluarTodos(
        candidatos: Candidato[],
        vacante: Vacante,
        onProgress?: (actual: number, total: number, nombre: string) => void
    ): Promise<{ ok: number; errores: string[] }> {
        const conCV = candidatos.filter(c => c.cv_url)
        let ok = 0
        const errores: string[] = []

        for (let i = 0; i < conCV.length; i++) {
            const c = conCV[i]
            onProgress?.(i + 1, conCV.length, `${c.nombres} ${c.apellidos}`)
            try {
                const analisis = await iaScreeningService.evaluarCandidato(c, vacante)
                await iaScreeningService.guardarAnalisis(c.id, analisis)
                ok++
            } catch (e: any) {
                errores.push(`${c.nombres} ${c.apellidos}: ${e.message}`)
            }
            // Pausa pequeña para no saturar la API (free tier: 30 req/min)
            if (i < conCV.length - 1) await new Promise(r => setTimeout(r, 1000))
        }
        return { ok, errores }
    },
}
