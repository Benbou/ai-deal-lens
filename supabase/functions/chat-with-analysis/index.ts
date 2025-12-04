import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, dealId } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Get deal and analysis data for context
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: deal } = await supabase
      .from("deals")
      .select("*, deck_files(ocr_markdown)")
      .eq("id", dealId)
      .single();

    const { data: analysis } = await supabase
      .from("analyses")
      .select("*")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const memoText = analysis?.result?.full_text || "";
    const deckOcr = deal?.deck_files?.[0]?.ocr_markdown || "";
    const companyName = deal?.company_name || deal?.startup_name || "l'entreprise";

    const systemPrompt = `Tu es un analyste VC expert qui aide à approfondir l'analyse de ${companyName}.

CONTEXTE DISPONIBLE:

**Mémo d'investissement généré:**
${memoText.substring(0, 15000)}

**Données extraites du deck (OCR):**
${deckOcr.substring(0, 10000)}

**Informations du deal:**
- Entreprise: ${companyName}
- Secteur: ${deal?.sector || "Non spécifié"}
- Stage: ${deal?.stage || "Non spécifié"}
- Montant levé: ${deal?.amount_raised_cents ? `€${(deal.amount_raised_cents / 100 / 1000000).toFixed(1)}M` : "Non spécifié"}
- ARR: ${deal?.current_arr_cents ? `€${(deal.current_arr_cents / 100 / 1000000).toFixed(2)}M` : "Non spécifié"}

INSTRUCTIONS:
- Réponds en français de manière concise et analytique
- Base tes réponses sur les données du mémo et du deck
- Si une information n'est pas disponible, dis-le clairement
- Fournis des insights actionnables pour un investisseur VC
- Tu peux suggérer des questions de due diligence supplémentaires
- Garde un ton professionnel et direct`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("chat-with-analysis error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
