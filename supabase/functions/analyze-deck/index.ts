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

    console.log('Starting analysis for deal:', dealId, 'user:', user.id);

    // Start background analysis (don't await - let it run in background)
    analyzeInBackground(supabaseClient, dealId).catch(error => {
      console.error('Background analysis failed:', error);
    });

    return new Response(
      JSON.stringify({ success: true, message: 'Analysis started' }),
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

async function analyzeInBackground(supabaseClient: any, dealId: string) {
  let analysisId: string | null = null;
  
  try {
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    
    if (!anthropicApiKey) {
      console.error('API key not configured');
      throw new Error('API key not configured');
    }

    console.log('Creating analysis record for deal:', dealId);

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

    if (analysisError) {
      console.error('Failed to create analysis:', analysisError);
      throw analysisError;
    }

    analysisId = analysis.id;
    console.log('Analysis record created:', analysisId);

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

const systemPrompt = `You are a senior investment analyst specialized in producing ultra-effective investment memos for VC funds. Your mission is to transform complex, messy inputs into decision-ready analyses that preserve all substance required for an informed investment decision.

Output: All memos and analyses must be written in French with appropriate business terminology.

Default stance: Constructive skepticism with a high rejection rate (~90%). Evidence over promises; proven execution over narrative potential. Binary decisions (GO/NO-GO) with clear rationale.

Expected Inputs: Pitch deck and data room (if available), website, key metrics, round terms. Explicit founder hypotheses to be tested/invalidated. Sector context (regulation, competition, sales cycles).

Mandatory Pre-Analysis Method:

Phase 1: Think Step-by-Step Approach
For each section of the memo, follow this systematic approach:
- Gather Data: Research and verify information through web searches
- Analyze Critically: Identify strengths, weaknesses, inconsistencies
- Benchmark: Compare against sector standards, comparables
- Synthesize: Summarize into clear decision-relevant points
- Validate: Check consistency with your constructive skepticism stance

Phase 2: Systematic Web Research (5–8 distinct searches minimum)
Perform targeted web research to validate:
- Market size, structure, and dynamics
- Founders' background and execution track record (prior scale, exits, relevant builds)
- Competitive landscape (direct, indirect, status quo/Excel, substitutes)
- Business model viability via sector benchmarks and comparables
- Impact claims (if applicable): independent, peer-reviewed or equivalent validation

Research Strategy:
- Use English for: global market research, technology benchmarks, international competitors, sector reports
- Use French for: French market specifics, local regulations, French competitors, French business context
- Always prioritize the language that will yield the most relevant and recent results

Validation, Contradiction, and Sourcing:
- Triangulate every material claim with independent sources
- Actively look for contradictory evidence to company claims
- Cite a source for every critical metric/statement or mark "Missing data: [what]" and propose what would resolve it
- Benchmark every metric against sector standards, closest comparables
- If uncertain about information: Clearly state your uncertainty and indicate what would resolve it

STRUCTURE YOUR RESPONSE AS FOLLOWS:

# TL;DR (30-40 secondes de lecture)
Provide a concise executive summary covering:
- Investment thesis in 2-3 sentences
- Key strengths (2-3 bullet points)
- Critical risks (2-3 bullet points)  
- Recommendation: GO / NO-GO with brief justification

---

# Analyse Détaillée

## 1. Équipe Fondatrice
- Background and relevant experience
- Track record and execution capability
- Completeness and balance of the team

## 2. Marché & Opportunité
- Market size (TAM/SAM/SOM with sources)
- Market dynamics and trends
- Target customer profile and pain points

## 3. Solution & Proposition de Valeur
- Product/service description
- Unique value proposition
- Competitive differentiation
- Technology/innovation assessment

## 4. Traction & Métriques
- Revenue and growth metrics
- Customer acquisition and retention
- Unit economics
- Key performance indicators

## 5. Concurrence & Positionnement
- Direct and indirect competitors
- Competitive advantages
- Market positioning strategy

## 6. Modèle Économique
- Revenue model
- Cost structure
- Path to profitability
- Scalability assessment

## 7. Levée & Utilisation des Fonds
- Funding amount and terms
- Use of proceeds
- Runway and milestones
- Cap table insights (if available)

## 8. Risques & Points d'Attention
- Market risks
- Execution risks
- Competitive risks
- Other material concerns

## 9. Recommandation Finale
- Clear GO/NO-GO decision
- Investment rationale
- Key conditions or next steps
- Deal scorecard or rating

After your analysis, you MUST also extract and provide the following structured data in a JSON block at the very end of your response, labeled as "STRUCTURED_DATA:":
{
  "company_name": "actual company name (not PDF filename)",
  "sector": "main sector/industry",
  "amount_raised_cents": number in cents (e.g., 500000 for €5k),
  "pre_money_valuation_cents": number in cents,
  "solution_summary": "brief 2-3 sentence summary of the solution"
}

Write your full investment memo following the structure above in markdown format, then add the JSON block at the end.`;

    const prompt = `Analyze this pitch deck and provide a comprehensive investment memo following the structured format. Include all critical analysis sections.

Use markdown formatting for:
- Headers (# ## ###)
- Bold for key terms (**important**)
- Bullet lists
- Tables where appropriate

At the very end, provide the structured data JSON block labeled "STRUCTURED_DATA:".`;

    console.log('Preparing to call Claude API...');
    console.log('PDF size (base64):', base64.length, 'characters');
    console.log('Model:', 'claude-sonnet-4-5-20250929');

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
        system: systemPrompt,
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

    console.log('Claude API response status:', response.status);

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
    console.log('Claude API response received, processing result...');

    // Extract text from all content blocks
    let analysisText = '';
    if (result.content && Array.isArray(result.content)) {
      analysisText = result.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n\n');
      console.log('Extracted analysis text, length:', analysisText.length);
    } else {
      console.error('Unexpected result format:', JSON.stringify(result).substring(0, 500));
      throw new Error('Unexpected API response format');
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
    console.log('Updating analysis record to completed...');
    const { error: updateError } = await supabaseClient
      .from('analyses')
      .update({
        status: 'completed',
        result: { full_text: analysisText },
        completed_at: new Date().toISOString(),
      })
      .eq('id', analysisId);

    if (updateError) {
      console.error('Failed to update analysis:', updateError);
      throw updateError;
    }

    console.log('Analysis record updated successfully');

    // Update deal with structured data if extracted
    if (structuredData) {
      console.log('Updating deal with structured data:', structuredData);
      const dealUpdate: any = {};
      if (structuredData.company_name) dealUpdate.company_name = structuredData.company_name;
      if (structuredData.sector) dealUpdate.sector = structuredData.sector;
      if (structuredData.amount_raised_cents) dealUpdate.amount_raised_cents = structuredData.amount_raised_cents;
      if (structuredData.pre_money_valuation_cents) dealUpdate.pre_money_valuation_cents = structuredData.pre_money_valuation_cents;
      if (structuredData.solution_summary) dealUpdate.solution_summary = structuredData.solution_summary;

      if (Object.keys(dealUpdate).length > 0) {
        const { error: dealUpdateError } = await supabaseClient
          .from('deals')
          .update(dealUpdate)
          .eq('id', dealId);

        if (dealUpdateError) {
          console.error('Failed to update deal:', dealUpdateError);
          // Don't throw here, analysis is already complete
        } else {
          console.log('Deal updated successfully with structured data');
        }
      }
    }

    console.log('Analysis completed successfully for deal:', dealId);
  } catch (error) {
    console.error('CRITICAL ERROR in background analysis:', error);
    console.error('Error details:', error instanceof Error ? error.message : String(error));
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    
    // Try to update analysis status to failed
    if (analysisId) {
      try {
        console.log('Updating analysis status to failed for:', analysisId);
        await supabaseClient
          .from('analyses')
          .update({ 
            status: 'failed', 
            error_message: error instanceof Error ? error.message : 'Unknown error occurred',
            error_details: { 
              error: String(error),
              stack: error instanceof Error ? error.stack : undefined 
            },
            completed_at: new Date().toISOString()
          })
          .eq('id', analysisId);
        console.log('Analysis status updated to failed');
      } catch (updateError) {
        console.error('Failed to update analysis status:', updateError);
      }
    }
  }
}