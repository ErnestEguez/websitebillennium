import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { identificacion } = await req.json();
        if (!identificacion) throw new Error("Identificación requerida");

        // RUC es 13 dígitos, Cédula es 10
        const tipo = identificacion.length === 13 ? "R" : "C";
        const url = `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/Persona/obtenerPorTipoIdentificacion?numeroIdentificacion=${identificacion}&tipoIdentificacion=${tipo}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("No se encontró información en el SRI");

        const data = await res.json();
        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400
        });
    }
});
