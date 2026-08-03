import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT = `Eres un sistema experto en lectura de facturas ecuatorianas (SRI).
Analiza el documento y extrae los datos con precisión. Si un campo no es visible, usa null.

RESPONDE ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "estab": "3 dígitos del establecimiento (ej: 001)",
  "pto_emi": "3 dígitos del punto de emisión (ej: 001)",
  "secuencial": "9 dígitos del secuencial (ej: 000000123)",
  "fecha_emision": "fecha en formato YYYY-MM-DD",
  "ruc_proveedor": "RUC del emisor (13 dígitos)",
  "razon_social": "Razón social o nombre del emisor",
  "clave_acceso": "49 dígitos si aparece, o null",
  "base_cero": número con decimales (base imponible 0%),
  "base_iva": número con decimales (base imponible IVA),
  "iva": número con decimales (valor del IVA),
  "total": número con decimales (valor total),
  "items": [
    {
      "descripcion": "descripción completa del ítem o servicio",
      "cantidad": número,
      "precio_unitario": número con decimales,
      "aplica_iva": true o false
    }
  ]
}

El número de factura ecuatoriano tiene formato: 001-001-000000123 (estab-pto_emi-secuencial).
Separa correctamente esos 3 grupos.`;

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    let empresaId: string | undefined;
    try {
        const { content, mimeType, empresa_id } = await req.json();
        empresaId = empresa_id;
        if (!content) throw new Error("Contenido vacío");
        if (!empresaId) throw new Error("Falta 'empresa_id'");

        if (!(await featureHabilitada(empresaId, "compras_enabled"))) {
            throw new Error("Esta función de IA no está habilitada para tu empresa. Contacta a Billennium si la necesitas.");
        }

        const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY no configurada");

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                inline_data: {
                                    mime_type: mimeType,
                                    data: content,
                                }
                            },
                            { text: PROMPT }
                        ]
                    }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        temperature: 0.1,
                    },
                }),
            }
        );

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Gemini error: ${err}`);
        }

        const geminiData = await response.json();
        const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Sin JSON en la respuesta");

        const resultado = JSON.parse(jsonMatch[0]);

        if (empresaId) await registrarConsumo(empresaId, geminiData.usageMetadata ?? {}, true);

        return new Response(JSON.stringify(resultado), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (e: any) {
        if (empresaId) await registrarConsumo(empresaId, {}, false);
        return new Response(JSON.stringify({ error: e.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
        });
    }
});

async function registrarConsumo(
    empresaId: string,
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
            origen: "compra_servicio",
            tokens_entrada: usage.promptTokenCount ?? null,
            tokens_salida: usage.candidatesTokenCount ?? null,
            tokens_total: usage.totalTokenCount ?? null,
            exitoso,
        });
    } catch (e) {
        console.error("[consumo_ia] no se pudo registrar:", e);
    }
}

async function featureHabilitada(empresaId: string, columna: string): Promise<boolean> {
    const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { db: { schema: "facturacion" } }
    );
    const { data } = await supabase
        .from("ia_features_config")
        .select(columna)
        .eq("empresa_id", empresaId)
        .maybeSingle();
    return !!(data as any)?.[columna];
}
