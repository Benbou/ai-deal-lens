import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dealId, analysisId } = await req.json();
    
    if (!dealId || !analysisId) {
      throw new Error('dealId and analysisId are required');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('🔍 Starting structured data extraction for deal:', dealId);

    // Get the analysis with the memo
    const { data: analysis, error: analysisError } = await supabaseClient
      .from('analyses')
      .select('result')
      .eq('id', analysisId)
      .single();

    if (analysisError || !analysis?.result?.full_text) {
      throw new Error('Memo not found in analysis');
    }

    const memoText = analysis.result.full_text;

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    const extractionPrompt = `Extract structured data from this investment memo. Return ONLY a valid JSON object with these fields:

{
  "company_name": "string - The company/startup name",
  "sector": "string - The primary sector/industry in French",
  "solution_summary": "string - Brief 1-sentence description of the solution in French (max 150 characters)",
  "amount_raised_cents": number - Amount being raised in euro cents (or null if not mentioned),
  "pre_money_valuation_cents": number - Pre-money valuation in euro cents (or null if not mentioned),
  "current_arr_cents": number - Current ARR/revenue in euro cents (or null if not mentioned),
  "yoy_growth_percent": number - Year-over-year growth percentage (or null if not mentioned),
  "mom_growth_percent": number - Month-over-month growth percentage (or null if not mentioned)
}

Important:
- All monetary values must be in euro cents (multiply euros by 100)
- Growth percentages should be as numbers (e.g., 150 for 150%)
- Use null for missing values
- Ensure JSON is valid and parseable
- **CRITICAL: solution_summary and sector must be in French**

Investment Memo:
${memoText}`;

    console.log('🤖 Calling Claude API for extraction...');

    const extractionResponse = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: extractionPrompt
        }
      ]
    });

    const responseText = extractionResponse.content[0].type === 'text' 
      ? extractionResponse.content[0].text 
      : '';

    console.log('Raw extraction response:', responseText);

    // Parse the JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in extraction response');
    }

    const extractedData = JSON.parse(jsonMatch[0]);

    // Ensure all required fields exist
    const structuredData = {
      company_name: extractedData.company_name || null,
      sector: extractedData.sector || null,
      solution_summary: extractedData.solution_summary || null,
      amount_raised_cents: extractedData.amount_raised_cents || null,
      pre_money_valuation_cents: extractedData.pre_money_valuation_cents || null,
      current_arr_cents: extractedData.current_arr_cents || null,
      yoy_growth_percent: extractedData.yoy_growth_percent || null,
      mom_growth_percent: extractedData.mom_growth_percent || null,
    };

    console.log('✅ Parsed structured data:', structuredData);

    return new Response(
      JSON.stringify({
        success: true,
        extractedData: structuredData
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in extract-structured-data:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
