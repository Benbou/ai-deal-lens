import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Anthropic } from "https://esm.sh/@anthropic-ai/sdk@0.30.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dealId, ocrText } = await req.json();
    
    console.log(`[QUICK-EXTRACT] Starting quick extraction for deal ${dealId}`);
    
    const anthropic = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY') || ''
    });

    const quickPrompt = `Analyse rapide du pitch deck suivant et extrais UNIQUEMENT ces 6 données essentielles :

1. company_name (string) - nom de l'entreprise
2. sector (string parmi : SaaS, Fintech, HealthTech, E-commerce, DeepTech, CleanTech, EdTech, Autre)
3. solution_summary (string, 1 phrase max 150 caractères décrivant la solution)
4. funding_stage (string parmi : Pre-Seed, Seed, Series A, Series B, Series B+)
5. funding_amount_eur (number | null, montant levé demandé en euros)
6. team_size (number | null, taille de l'équipe)

PITCH DECK OCR :
${ocrText.substring(0, 10000)}

Réponds UNIQUEMENT en JSON valide, aucun texte supplémentaire, aucun markdown.
Format exact : { "company_name": "...", "sector": "...", "solution_summary": "...", "funding_stage": "...", "funding_amount_eur": 123456, "team_size": 5 }`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 600,
      temperature: 0,
      messages: [{ role: "user", content: quickPrompt }]
    });

    const contentBlock = response.content[0];
    if (contentBlock.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    let quickData;
    try {
      // Extract JSON from potential markdown code blocks
      let jsonText = contentBlock.text.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '');
      }
      quickData = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('[QUICK-EXTRACT] JSON parse error:', parseError);
      console.error('[QUICK-EXTRACT] Raw response:', contentBlock.text);
      throw new Error(`Failed to parse Claude response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    console.log('[QUICK-EXTRACT] Extracted data:', quickData);

    // Save to database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const { error: updateError } = await supabase
      .from('analyses')
      .update({
        quick_context: quickData,
        status: 'context_ready',
        progress_percent: 40,
        current_step: 'Contexte disponible, génération du mémo...'
      })
      .eq('deal_id', dealId);

    if (updateError) {
      console.error('[QUICK-EXTRACT] DB update error:', updateError);
      throw updateError;
    }

    console.log(`[QUICK-EXTRACT] Successfully extracted and saved context for deal ${dealId}`);

    return new Response(
      JSON.stringify({ quickData }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('[QUICK-EXTRACT] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
