import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Eres el asistente por voz de QuickInvoice en billenniumsystem.com.
La facturación ya existe en el sistema; tu única función es convertir la solicitud hablada del usuario en datos ordenados para llenar la factura existente.

REGLAS:
1. Determina el tipo de factura:
   - Si el usuario dice o implica "factura de servicios", clasifica como SERVICIOS.
   - Si el usuario dice "factura de inventarios" o "inventario", clasifica como INVENTARIO.
   - Si no está claro, pregunta una sola vez.

2. Verifica el cliente con la lista proporcionada:
   - Si el cliente ya existe (coincidencia por nombre o cédula/RUC), úsalo con su id.
   - Si no existe, marca cliente_existe: false e incluye los datos que el usuario mencionó.

3. Si es SERVICIOS:
   - Busca si la descripción coincide con algún servicio existente de la lista.
   - Si coincide, úsalo con su id y precio.
   - Si no coincide, usa los datos que el usuario proporcionó.

4. Si es INVENTARIO:
   - No pidas datos del producto. Indica que el usuario debe seleccionar del inventario.

5. Extrae: cantidad, precio_unitario, y si tiene IVA (con_iva: true/false).
   - IVA porcentaje: 15 si tiene IVA, 0 si no tiene.
   - Si el usuario dice "sin IVA" → iva_porcentaje: 0
   - Si el usuario dice "con IVA" o no especifica → iva_porcentaje: 15

DEVUELVE SIEMPRE un JSON válido con esta estructura exacta (sin texto adicional fuera del JSON):
{
  "tipo": "servicios" | "inventario" | "desconocido",
  "cliente": {
    "existe": true/false,
    "id": "uuid o null",
    "nombre": "nombre del cliente",
    "identificacion": "cedula/ruc si fue mencionada o null"
  },
  "item": {
    "existe": true/false,
    "id": "uuid o null",
    "nombre": "descripción del ítem",
    "cantidad": número,
    "precio_unitario": número,
    "iva_porcentaje": 15 o 0
  },
  "datos_faltantes": ["campo1", "campo2"],
  "accion_siguiente": "texto breve para el usuario",
  "requiere_confirmacion": true/false,
  "resumen": "texto del resumen para mostrar al usuario"
}`;

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { transcripcion, clientes, servicios } = await req.json();

        if (!transcripcion?.trim()) {
            throw new Error("Transcripción vacía");
        }

        const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
        if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada");

        const clientesResumen = (clientes ?? []).slice(0, 50).map((c: any) => ({
            id: c.id,
            nombre: c.nombre,
            identificacion: c.identificacion,
        }));

        const serviciosResumen = (servicios ?? []).slice(0, 50).map((s: any) => ({
            id: s.id,
            nombre: s.nombre,
            precio_venta: s.precio_venta,
            iva_porcentaje: s.iva_porcentaje,
        }));

        const userMessage = `Transcripción de voz: "${transcripcion}"

Clientes disponibles en el sistema:
${JSON.stringify(clientesResumen, null, 2)}

Servicios/Productos disponibles en el sistema:
${JSON.stringify(serviciosResumen, null, 2)}`;

        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model: "claude-sonnet-4-6",
                max_tokens: 1024,
                system: SYSTEM_PROMPT,
                messages: [{ role: "user", content: userMessage }],
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Anthropic API error: ${err}`);
        }

        const anthropicData = await response.json();
        const rawText = anthropicData.content?.[0]?.text ?? "";

        // Extraer JSON del texto (por si Claude agrega texto alrededor)
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Respuesta de IA sin JSON válido");

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
