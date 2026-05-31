import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Eres el asistente de facturación de QuickInvoice. Debes interpretar solicitudes de voz en español y extraer datos para una factura.

REGLAS:
1. Tipo de factura: si menciona "servicios" → SERVICIOS. Si menciona "inventario" o "producto" → INVENTARIO. Si no está claro → SERVICIOS.
2. Cliente: busca el nombre en la lista de clientes disponibles. Si coincide, marca existe:true y usa su id. Si no coincide, marca existe:false.
3. Ítem: si es SERVICIOS, busca en la lista de servicios disponibles. Si coincide usa su id y precio. Si no, usa lo que describió el usuario.
4. Precio: extrae el valor numérico mencionado.
5. Cantidad: extrae la cantidad (por defecto 1).
6. IVA: si dice "sin IVA" → 0. Si dice "con IVA" o no especifica → 15.

RESPONDE ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "tipo": "servicios" | "inventario",
  "cliente": { "existe": bool, "id": "uuid o null", "nombre": "string", "identificacion": "string o null" },
  "item": { "existe": bool, "id": "uuid o null", "nombre": "string", "cantidad": number, "precio_unitario": number, "iva_porcentaje": 15 | 0 },
  "datos_faltantes": ["lista de campos que faltan"],
  "accion_siguiente": "mensaje breve para el usuario",
  "requiere_confirmacion": true,
  "resumen": "resumen en una línea para mostrar al usuario"
}`;

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { transcripcion, clientes, servicios } = await req.json();
        if (!transcripcion?.trim()) throw new Error("Transcripción vacía");

        const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY no configurada");

        const clientesResumen = (clientes ?? []).slice(0, 60).map((c: any) => ({
            id: c.id, nombre: c.nombre, identificacion: c.identificacion,
        }));
        const serviciosResumen = (servicios ?? []).slice(0, 60).map((s: any) => ({
            id: s.id, nombre: s.nombre, precio_venta: s.precio_venta, iva_porcentaje: s.iva_porcentaje,
        }));

        const userMessage = `Solicitud de voz: "${transcripcion}"

Clientes en el sistema: ${JSON.stringify(clientesResumen)}
Servicios/Productos en el sistema: ${JSON.stringify(serviciosResumen)}`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                    contents: [{ parts: [{ text: userMessage }] }],
                    generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
                }),
            }
        );

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Gemini API error: ${err}`);
        }

        const geminiData = await response.json();
        const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Respuesta sin JSON válido");

        const resultado = JSON.parse(jsonMatch[0]);

        return new Response(JSON.stringify(resultado), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
        });
    }
});
