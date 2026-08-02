import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Reemplaza al fetch directo desde el navegador que hacía
// src/services/geminiService.ts (con la API key expuesta en el bundle
// público). Mismo contrato: recibe `parts` de Gemini y devuelve el
// texto de la respuesta, pero ahora también registra el consumo por
// empresa en facturacion.consumo_ia (ver 20260803_consumo_ia.sql).

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_MODEL = "gemini-2.5-flash-lite";

const ORIGENES_VALIDOS = ["compra_inventario", "compra_servicio", "th_screening_cv", "asistente_voz"];

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    let empresaId: string | undefined;
    let origen: string | undefined;

    try {
        const body = await req.json();
        const { parts, maxTokens } = body;
        empresaId = body.empresa_id;
        origen = body.origen;

        if (!parts) throw new Error("Falta 'parts'");
        if (!empresaId) throw new Error("Falta 'empresa_id'");
        if (!origen || !ORIGENES_VALIDOS.includes(origen)) throw new Error("'origen' inválido");

        const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY no configurada");

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens ?? 1500 },
                }),
            }
        );

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Gemini error: ${err}`);
        }

        const geminiData = await response.json();
        const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        const usage = geminiData.usageMetadata ?? {};

        await registrarConsumo(empresaId, origen, usage, true);

        return new Response(JSON.stringify({ text }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (e: any) {
        if (empresaId && origen && ORIGENES_VALIDOS.includes(origen)) {
            await registrarConsumo(empresaId, origen, {}, false);
        }
        return new Response(JSON.stringify({ error: e.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
        });
    }
});

async function registrarConsumo(
    empresaId: string,
    origen: string,
    usage: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number },
    exitoso: boolean,
) {
    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            { db: { schema: "facturacion" } }
        );
        await supabase.from("consumo_ia").insert({
            empresa_id: empresaId,
            origen,
            tokens_entrada: usage.promptTokenCount ?? null,
            tokens_salida: usage.candidatesTokenCount ?? null,
            tokens_total: usage.totalTokenCount ?? null,
            exitoso,
        });
    } catch (e) {
        // Nunca debe tumbar la respuesta al usuario por un fallo de registro.
        console.error("[consumo_ia] no se pudo registrar:", e);
    }
}
