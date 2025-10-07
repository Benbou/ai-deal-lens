import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const updateProgress = async (client: any, analysisId: string, status: string, step: string, percent: number) => {
  await client
    .from('analyses')
    .update({
      status,
      current_step: step,
      progress_percent: percent
    })
    .eq('id', analysisId);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dealId } = await req.json();
    
    if (!dealId) {
      throw new Error('dealId is required');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    console.log('Starting analysis for deal:', dealId);

    // Create analysis record
    const { data: analysis, error: analysisError } = await supabaseClient
      .from('analyses')
      .insert({
        deal_id: dealId,
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (analysisError) throw analysisError;

    // Get deck file
    const { data: deckFile, error: fileError } = await supabaseClient
      .from('deck_files')
      .select('storage_path, file_name')
      .eq('deal_id', dealId)
      .single();

    if (fileError) throw fileError;

    // Download file
    const { data: fileData, error: downloadError } = await supabaseClient.storage
      .from('deck-files')
      .download(deckFile.storage_path);

    if (downloadError) throw downloadError;

    // Convert to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    const systemPrompt = `You are a senior investment analyst specialized in producing ultra-effective investment memos for VC funds. 

Output: All memos and analyses must be written in French with appropriate business terminology.

After your analysis, you MUST also extract and provide the following structured data in a JSON block at the very end of your response, labeled as "STRUCTURED_DATA:":
{
  "company_name": "actual company name (not PDF filename)",
  "sector": "main sector/industry",
  "amount_raised_cents": number in cents (e.g., 500000 for €5k),
  "pre_money_valuation_cents": number in cents,
  "solution_summary": "brief 2-3 sentence summary of the solution"
}

Write your full investment memo first in markdown format, then add the JSON block at the end.`;

    const prompt = `Analyze this pitch deck and provide a comprehensive investment memo following the structured format. Include all critical analysis sections.

Use markdown formatting for:
- Headers (# ## ###)
- Bold for key terms (**important**)
- Bullet lists
- Tables where appropriate

At the very end, provide the structured data JSON block labeled "STRUCTURED_DATA:".`;

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 20000,
        temperature: 1,
        system: systemPrompt,
        thinking: {
          type: 'enabled',
          budget_tokens: 8000,
        },
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
          },
        ],
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const result = await response.json();
    console.log('Claude API response received');

    // Extract text from all content blocks
    let analysisText = '';
    if (result.content && Array.isArray(result.content)) {
      analysisText = result.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n\n');
    }

    // Extract structured data
    let structuredData: any = null;
    const jsonMatch = analysisText.match(/STRUCTURED_DATA:\s*({[\s\S]*?})/);
    if (jsonMatch) {
      try {
        structuredData = JSON.parse(jsonMatch[1]);
        // Remove the JSON block from the analysis text
        analysisText = analysisText.replace(/STRUCTURED_DATA:\s*{[\s\S]*?}/, '').trim();
      } catch (e) {
        console.error('Failed to parse structured data:', e);
      }
    }

    // Update analysis
    await supabaseClient
      .from('analyses')
      .update({
        status: 'completed',
        result: { full_text: analysisText },
        completed_at: new Date().toISOString(),
      })
      .eq('id', analysis.id);

    // Update deal with structured data if extracted
    if (structuredData) {
      const dealUpdate: any = {};
      if (structuredData.company_name) dealUpdate.company_name = structuredData.company_name;
      if (structuredData.sector) dealUpdate.sector = structuredData.sector;
      if (structuredData.amount_raised_cents) dealUpdate.amount_raised_cents = structuredData.amount_raised_cents;
      if (structuredData.pre_money_valuation_cents) dealUpdate.pre_money_valuation_cents = structuredData.pre_money_valuation_cents;
      if (structuredData.solution_summary) dealUpdate.solution_summary = structuredData.solution_summary;

      if (Object.keys(dealUpdate).length > 0) {
        await supabaseClient
          .from('deals')
          .update(dealUpdate)
          .eq('id', dealId);
      }
    }

    console.log('Analysis completed successfully');

    return new Response(
      JSON.stringify({ success: true, analysis: analysisText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in analyze-deck:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});