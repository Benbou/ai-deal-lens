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

    console.log('Starting streaming analysis for deal:', dealId, 'user:', user.id);

    // Return SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        const sendEvent = (event: string, data: any) => {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        try {
          await streamAnalysis(supabaseClient, dealId, sendEvent);
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          sendEvent('error', { 
            message: error instanceof Error ? error.message : 'Analysis failed' 
          });
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });
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

async function streamAnalysis(
  supabaseClient: any, 
  dealId: string, 
  sendEvent: (event: string, data: any) => void
) {
  let analysisId: string | null = null;
  
  try {
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    const mistralApiKey = Deno.env.get('MISTRAL_API_KEY');
    
    if (!anthropicApiKey || !mistralApiKey) {
      throw new Error('API keys not configured');
    }

    sendEvent('status', { message: 'Initialisation de l\'analyse...' });

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
    analysisId = analysis.id;

    sendEvent('status', { message: 'Récupération du deck...' });

    // Get deck file
    const { data: deckFile, error: fileError } = await supabaseClient
      .from('deck_files')
      .select('storage_path, file_name')
      .eq('deal_id', dealId)
      .single();

    if (fileError) throw new Error('Deck file not found');

    // Download file
    const { data: fileData, error: downloadError } = await supabaseClient.storage
      .from('deck-files')
      .download(deckFile.storage_path);

    if (downloadError) throw new Error('Failed to download file');

    sendEvent('status', { message: 'Extraction OCR avec Mistral...' });

    // Step 1: Upload PDF to Mistral Files API
    console.log('Uploading PDF to Mistral Files API...');
    const arrayBuffer = await fileData.arrayBuffer();
    const pdfBlob = new Blob([arrayBuffer], { type: 'application/pdf' });
    
    const formData = new FormData();
    formData.append('file', pdfBlob, deckFile.file_name);
    formData.append('purpose', 'ocr');

    const uploadResponse = await fetch('https://api.mistral.ai/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mistralApiKey}`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Mistral upload error:', uploadResponse.status, errorText);
      throw new Error('Failed to upload PDF to Mistral');
    }

    const uploadData = await uploadResponse.json();
    const mistralFileId = uploadData.id;
    console.log('PDF uploaded to Mistral, file ID:', mistralFileId);

    // Step 2: Get signed URL from Mistral
    console.log('Getting signed URL from Mistral...');
    const signedUrlResponse = await fetch(`https://api.mistral.ai/v1/files/${mistralFileId}/url`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${mistralApiKey}`,
      },
    });

    if (!signedUrlResponse.ok) {
      const errorText = await signedUrlResponse.text();
      console.error('Mistral signed URL error:', signedUrlResponse.status, errorText);
      throw new Error('Failed to get signed URL from Mistral');
    }

    const signedUrlData = await signedUrlResponse.json();
    const mistralSignedUrl = signedUrlData.url;
    console.log('Got signed URL from Mistral');

    // Step 3: Process OCR with Mistral dedicated OCR API
    console.log('Processing OCR with Mistral...');
    const ocrResponse = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-ocr-latest',
        document: {
          type: 'document_url',
          document_url: mistralSignedUrl,
        },
      }),
    });

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      console.error('Mistral OCR error:', ocrResponse.status, errorText);
      throw new Error('Mistral OCR processing failed');
    }

    const ocrData = await ocrResponse.json();
    console.log('OCR response structure:', JSON.stringify(ocrData, null, 2));

    // Step 4: Extract text from pages array
    let extractedMarkdown = '';

    if (ocrData.pages && Array.isArray(ocrData.pages)) {
      extractedMarkdown = ocrData.pages
        .map((page: any) => page.markdown || '')
        .join('\n\n');
    } else if (ocrData.content) {
      extractedMarkdown = ocrData.content;
    } else if (ocrData.text) {
      extractedMarkdown = ocrData.text;
    }

    console.log('OCR completed, extracted', extractedMarkdown.length, 'characters');
    console.log('First 500 characters:', extractedMarkdown.substring(0, 500));
    
    if (!extractedMarkdown || extractedMarkdown.trim().length === 0) {
      throw new Error('No content extracted from PDF');
    }

    // Step 5 (optional): Cleanup uploaded file from Mistral
    try {
      await fetch(`https://api.mistral.ai/v1/files/${mistralFileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mistralApiKey}`,
        },
      });
      console.log('Cleaned up Mistral uploaded file');
    } catch (cleanupError) {
      console.error('Failed to cleanup Mistral file (non-critical):', cleanupError);
    }

    sendEvent('status', { message: 'Analyse en cours par Claude Haiku...' });

    const systemPrompt = `You are a senior investment analyst specialized in producing ultra-effective investment memos for VC funds. Your mission is to transform complex, messy inputs into decision-ready analyses that can be read in 3–4 minutes while preserving all substance required for an informed investment decision.

**Output:** French | **Research:** English/French based on relevance

## Mission
VC analyst specialized in ultra-concise investment memos (2 min read). Constructive skepticism, ~90% rejection rate. Binary GO/NO-GO decision.

## Mandatory Method

### Phase 1 - Alboknowledge Internal Research:
- **Alboknowledge**: sector trends, multiples, competitive insights
- **"ratio de valorisation" database**: reference multiples by sector/stage

### Phase 2 - Web Research (5-8 searches):
Validate: market size, founders, competition, model, impact
Systematic triangulation + source every key metric

### Phase 3 - Validation:
Seek contradictions, benchmark vs Albo data, note uncertainties

## Immediate Rejection (any single trigger)
- Unproven model requiring market education
- Pre-revenue without customer validation
- Unsubstantiated impact claims
- Insufficient founder-market fit
- Excessive valuation vs traction AND Albo database
- Vague/replicable competitive advantage
- Critical unsecured dependencies

## CRITICAL FORMATTING RULES - MUST FOLLOW EXACTLY:

### Markdown Structure (MANDATORY):
- Use **EXACTLY ONE** # for main title (TL;DR)
- Use **## for all section headers** (Équipe Fondatrice, Marché, etc.)
- Use **### for subsections only if needed**
- Use **---** horizontal rule to separate TL;DR from detailed analysis
- Use **bold** for key terms: **montant levé**, **ARR**, **CAC/LTV**
- Use **- bullet lists** for all enumerations
- Use tables for metrics (| header | header |)

### Spacing Rules (CRITICAL):
- Add **2 blank lines** before each ## section header
- Add **1 blank line** after each ## section header
- Add **1 blank line** between paragraphs
- Add **1 blank line** before and after tables
- Add **1 blank line** before and after bullet lists

### Example of PERFECT formatting:
\`\`\`
# TL;DR

Thesis en 2-3 phrases...

**Forces:**
- Force 1
- Force 2

**Risques:**
- Risque 1
- Risque 2

**Recommandation:** NO-GO car...

---


## 1. Équipe Fondatrice

Background: Les fondateurs ont...

- Fondateur A: **serial entrepreneur**
- Fondateur B: expertise **deep tech**


## 2. Marché & Opportunité

TAM: **€500M** (source: Gartner 2024)

Le marché...
\`\`\`

## Memo Structure (800-1000 words MAX)

### TL;DR (3 lignes max)
What, why it wins, proof points, top risks, decision

### Deal Source (1 line)

### Terms (4-5 lines)
Amount, pre/post-money vs Albo multiples, use of funds %, key milestones, exit scenarios

### Context (4 lines)
Sourced market, pain points, adoption drivers, Alboknowledge insights

### Solution (5-6 lines)
Product, differentiators vs Albo comparables, quantified ROI, defensibility

### Why Now? (2 lines)
Market trends validated by Alboknowledge, competitive timing

### Key Metrics (table format if possible)
Revenue/growth vs Albo benchmark, CAC/LTV/payback, burn/runway, multiples vs ratios database

### Market (4 lines)
Sourced TAM/SAM + Alboknowledge, CAGR, realistic penetration, expansion vectors

### Business Model (4 lines)
Revenue streams, unit economics vs Albo, operating leverage, 3-5y outlook

### Competition (4 lines)
2-3 main competitors + Albo insights, alternatives, entry barriers, differentiation

### Traction (4 lines)
Growth vs Albo benchmark, PMF (retention/NPS), partnerships, customer logos

### Team (3 lines)
Track record, founder-market fit, gaps, relevant advisors

### Risks (5 lines)
3-4 major risks + concrete mitigations, valuation vs Albo, downside/base/upside scenarios

### Recommendation (2 lines)
GO/NO-GO + rationale integrating Albo insights. If GO: ticket, conditions, DD. If NO-GO: reconsideration milestones.

## Writing Principles
- Extreme concision: every sentence = decision-relevant
- Quantify systematically
- Source or note "Missing: [what]"
- No repetition or superfluous jargon
- Naturally integrate Albo insights

## Sources (end of memo)
**Albo:** [X Alboknowledge queries, sector Y multiples]
**Web:** [5-8 key URLs]`;

    const prompt = `Here is the OCR-extracted content from the pitch deck in markdown format:

${extractedMarkdown}

Analyze this content and provide a comprehensive investment memo following the structured format with PERFECT markdown formatting (proper headers, bold, lists, spacing).`;

    // Call Claude Haiku API with tool calling for structured data extraction
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 8192,
        stream: true,
        system: systemPrompt,
        tools: [
          {
            name: 'web_search',
            type: 'web_search_20250305',
          },
          {
            name: 'extract_deal_data',
            description: 'Extract structured deal data from the investment memo analysis',
            input_schema: {
              type: 'object',
              properties: {
                company_name: {
                  type: 'string',
                  description: 'The actual company name (not PDF filename)',
                },
                sector: {
                  type: 'string',
                  description: 'Main sector/industry (e.g., FinTech, HealthTech, SaaS)',
                },
                amount_raised_cents: {
                  type: 'integer',
                  description: 'Amount raised in cents (e.g., 500000 for €5,000)',
                },
                pre_money_valuation_cents: {
                  type: 'integer',
                  description: 'Pre-money valuation in cents',
                },
                solution_summary: {
                  type: 'string',
                  description: 'Brief 2-3 sentence summary of the solution',
                },
              },
              required: ['company_name', 'sector', 'solution_summary'],
            },
          },
        ],
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      throw new Error('Claude API error');
    }

    // Stream the response
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    let structuredData: any = null;

    if (!reader) throw new Error('No response body');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || line.startsWith(':')) continue;
        if (!line.startsWith('data: ')) continue;

        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          
          if (parsed.type === 'content_block_delta') {
            const delta = parsed.delta;
            if (delta.type === 'text_delta' && delta.text) {
              fullText += delta.text;
              sendEvent('delta', { text: delta.text });
            }
          } else if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
            // Tool use started - will capture structured data
            console.log('Tool use started:', parsed.content_block.name);
          } else if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta') {
            // Accumulate tool input (structured data)
            if (!structuredData) structuredData = '';
            structuredData += parsed.delta.partial_json;
          }
        } catch (e) {
          console.error('Failed to parse SSE line:', e, line);
        }
      }
    }

    sendEvent('status', { message: 'Finalisation de l\'analyse...' });

    // Parse accumulated structured data
    if (structuredData && typeof structuredData === 'string') {
      try {
        structuredData = JSON.parse(structuredData);
        console.log('Parsed structured data:', structuredData);
      } catch (e) {
        console.error('Failed to parse structured data:', e);
        structuredData = null;
      }
    }

    // Update analysis
    await supabaseClient
      .from('analyses')
      .update({
        status: 'completed',
        result: { full_text: fullText },
        completed_at: new Date().toISOString(),
      })
      .eq('id', analysisId);

    // Update deal with structured data
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

    sendEvent('done', { message: 'Analyse terminée' });
  } catch (error) {
    console.error('Error in streamAnalysis:', error);
    
    if (analysisId) {
      await supabaseClient
        .from('analyses')
        .update({ 
          status: 'failed', 
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString()
        })
        .eq('id', analysisId);
    }
    
    throw error;
  }
}
