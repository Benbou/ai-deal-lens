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
      return new Response(
        JSON.stringify({ error: 'Invalid request' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get authenticated user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify deal ownership
    const { data: deal, error: ownershipError } = await supabaseClient
      .from('deals')
      .select('user_id')
      .eq('id', dealId)
      .single();

    if (ownershipError || !deal) {
      console.error('Deal not found:', dealId, ownershipError?.message);
      return new Response(
        JSON.stringify({ error: 'Deal not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (deal.user_id !== user.id) {
      console.error('Unauthorized access attempt:', user.id, 'to deal:', dealId);
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    
    if (!anthropicApiKey) {
      console.error('API key not configured');
      return new Response(
        JSON.stringify({ error: 'Service temporarily unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting analysis for deal:', dealId, 'user:', user.id);

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

    if (fileError) {
      console.error('Deck file not found:', fileError.message);
      return new Response(
        JSON.stringify({ error: 'File not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Download file
    const { data: fileData, error: downloadError } = await supabaseClient.storage
      .from('deck-files')
      .download(deckFile.storage_path);

    if (downloadError) {
      console.error('File download failed:', downloadError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to access file' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert to base64 and validate PDF
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Validate PDF magic number (%PDF-)
    const isPDF = uint8Array[0] === 0x25 && uint8Array[1] === 0x50 && 
                  uint8Array[2] === 0x44 && uint8Array[3] === 0x46 && 
                  uint8Array[4] === 0x2D;
    
    if (!isPDF) {
      console.error('Invalid PDF file detected for deal:', dealId);
      await supabaseClient
        .from('analyses')
        .update({ 
          status: 'failed', 
          error_message: 'Invalid file format',
          completed_at: new Date().toISOString()
        })
        .eq('id', analysis.id);
      
      return new Response(
        JSON.stringify({ error: 'Invalid file format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Convert to base64 in chunks to avoid stack overflow
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64 = btoa(binary);

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

    // Call Claude API with correct beta header
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
            name: 'web_search',
            type: 'web_search_20250305',
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
      console.error('External API error:', response.status, errorText);
      
      await supabaseClient
        .from('analyses')
        .update({ 
          status: 'failed', 
          error_message: 'Analysis service error',
          completed_at: new Date().toISOString()
        })
        .eq('id', analysis.id);
      
      return new Response(
        JSON.stringify({ error: 'Analysis failed. Please try again later.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      JSON.stringify({ error: 'An unexpected error occurred. Please try again.' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});