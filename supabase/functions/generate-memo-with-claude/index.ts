import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.30.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('🚀 Starting memo generation with Claude + Linkup (streaming)');
  
  // Parse request body
  let dealId: string;
  let markdownText: string;
  let analysisId: string;
  
  try {
    const body = await req.json();
    dealId = body.dealId;
    markdownText = body.markdownText;
    analysisId = body.analysisId;

    if (!dealId || !markdownText || !analysisId) {
      throw new Error('Missing required parameters');
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid request' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Initialize API keys
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  const LINKUP_API_KEY = Deno.env.get('LINKUP_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!ANTHROPIC_API_KEY || !LINKUP_API_KEY) {
    return new Response(
      JSON.stringify({ success: false, error: 'API keys not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

  // Verify authorization
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
  if (userError || !user) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Fetch deal
  const { data: deal, error: dealError } = await supabaseClient
    .from('deals')
    .select('*')
    .eq('id', dealId)
    .eq('user_id', user.id)
    .single();

  if (dealError || !deal) {
    return new Response(
      JSON.stringify({ success: false, error: 'Deal not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('📄 Deal loaded:', deal.startup_name);

  // System prompt
  const systemPrompt = `You are a senior investment analyst specialized in producing ultra-effective investment memos for VC funds. Your mission is to transform complex, messy inputs into decision-ready analyses that can be read in 2–3 minutes (<1000 words) while preserving all substance required for an informed investment decision.

**Output:** French | **Research:** English/French based on relevance

## Mission
VC analyst specialized in ultra-concise investment memos (2 min read). Constructive skepticism, ~90% rejection rate. Binary GO/NO-GO decision.

## Mandatory Method

### Phase 1 - Provide sector benchmarks from public sources (PitchBook, Crunchbase, recent VC reports):
- **Alboknowledge**: sector trends, multiples, competitive insights
- Reference multiples by sector/stage

### Phase 2 - Web Research (3-6 searches):
Validate: market size, founders, competition, model, impact
Systematic triangulation + source every key metric

## Immediate Rejection (any single trigger)
- Unproven model requiring market education
- Pre-revenue without customer validation
- Unsubstantiated impact claims
- Insufficient founder-market fit
- Excessive valuation vs traction
- Vague/replicable competitive advantage
- Critical unsecured dependencies

## Memo Structure (800-1000 words MAX)

### Deal Source (1 line)

### Terms (4-5 lines)
Amount, pre/post-money vs Albo multiples, use of funds %, key milestones, exit scenarios

### Executive Summary (3 lines)
What, why it wins, proof points, top risks, decision

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
- Naturally integrate Albo insights`;

  // User message
  const userMessage = `Tu dois analyser ce pitch deck et produire un mémo d'investissement complet en français.

**FORMAT DE SORTIE REQUIS :**
- Utilise le format Markdown avec une structure claire
- Commence par un titre principal avec #
- Utilise ## pour les sections principales
- Utilise ### pour les sous-sections
- Utilise des listes à puces (-) et du gras (**texte**) pour l'emphase
- Sépare bien les sections avec des lignes vides
- Utilise des tableaux Markdown quand approprié (|---|---|)

**PITCH DECK (OCR MARKDOWN) :**

${markdownText}

**CONTEXTE ADDITIONNEL DE L'INVESTISSEUR :**
${deal.personal_notes || 'Aucun contexte additionnel fourni'}

**INSTRUCTIONS IMPORTANTES :**
1. Utilise l'outil 'linkup_search' pour effectuer 3-6 recherches web ciblées afin de valider le marché, la concurrence, les fondateurs et les métriques clés
2. Une fois tes recherches terminées, produis le mémo en utilisant l'outil 'output_memo'`;

  // Tools
  const tools = [
    {
      name: "linkup_search",
      description: "Search the web for up-to-date information about companies, markets, competitors, trends, and benchmarks.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: { 
            type: "string", 
            description: "A clear, concise search query as a single STRING (not array or object). Example: 'Linkup seed funding 2024'" 
          },
          depth: { 
            type: "string", 
            enum: ["standard", "deep"],
            description: "Search depth - use 'deep' for comprehensive market research"
          }
        },
        required: ["query"]
      }
    },
    {
      name: "output_memo",
      description: "Output the final investment memo in markdown format along with structured data",
      input_schema: {
        type: "object" as const,
        properties: {
          memo_markdown: { 
            type: "string", 
            description: "REQUIRED: Full investment memo in French, formatted in Markdown (800-1000 words). This field MUST contain the complete memo text and cannot be empty." 
          },
          company_name: { type: "string" },
          sector: { type: "string", description: "Industry sector in French" },
          solution_summary: { type: "string", description: "Brief solution (max 150 chars)" },
          amount_raised_cents: { type: "number" },
          pre_money_valuation_cents: { type: "number" },
          current_arr_cents: { type: "number" },
          yoy_growth_percent: { type: "number" },
          mom_growth_percent: { type: "number" }
        },
        required: ["memo_markdown", "company_name", "sector", "solution_summary"]
      }
    }
  ];

  // Helper: Linkup search
  async function callLinkupSearch(query: string, depth: string = "standard") {
    const cleanQuery = String(query).trim();
    
    if (!cleanQuery) {
      console.error('❌ [LINKUP] Empty query after sanitization');
      return { error: 'Empty search query' };
    }
    
    console.log(`🔍 [LINKUP] "${cleanQuery}" (${depth})`);
    
    try {
      const response = await fetch("https://api.linkup.so/v1/search", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LINKUP_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ 
          q: cleanQuery,
          depth, 
          outputType: "sourcedAnswer" 
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [LINKUP] Error:', errorText);
        return { error: `Linkup failed (${response.status}): ${errorText}` };
      }

      const data = await response.json();
      console.log(`✅ [LINKUP] Results (${data.answer?.length || 0} chars)`);
      
      return { 
        answer: data.answer || "No answer received", 
        sources: data.sources || [] 
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('❌ [LINKUP] Exception:', errorMsg);
      return { error: `Linkup exception: ${errorMsg}` };
    }
  }

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      const sendEvent = (event: string, data: any) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        let messages: any[] = [{ role: "user", content: userMessage }];
        let iterationCount = 0;
        const MAX_ITERATIONS = 15;
        let memoReady = false;
        let finalData: any = null;

        while (iterationCount < MAX_ITERATIONS && !memoReady) {
          iterationCount++;
          console.log(`🔄 [CLAUDE] Iteration ${iterationCount}`);

          // ✅ Use native streaming
          const stream = await anthropic.messages.stream({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 4500,
            temperature: 1,
            system: systemPrompt,
            messages: messages,
            tools: tools
          });

          let toolResults: any[] = [];
          
          // ✅ Listen to streaming events in real-time
          stream
            .on('text', (text) => {
              // Token-by-token streaming
              sendEvent('delta', { text });
            })
            .on('contentBlock', (block) => {
              if (block.type === 'tool_use') {
                console.log(`🔧 [CLAUDE] Tool: ${block.name}`);
              }
            })
            .on('message', (message) => {
              console.log(`📊 [CLAUDE] Stop: ${message.stop_reason}`);
            });

          // ✅ Wait for complete response
          const finalMessage = await stream.finalMessage();
          
          // ✅ Add response to conversation
          messages.push({ role: "assistant", content: finalMessage.content });

          // ✅ Process tool_use in final message
          for (const block of finalMessage.content) {
            if (block.type === 'tool_use') {
              if (block.name === 'linkup_search') {
                const input = block.input as { query?: any; depth?: string };
                
                // Validation stricte
                let queryStr: string;
                if (typeof input.query === 'string') {
                  queryStr = input.query.trim();
                } else if (Array.isArray(input.query)) {
                  queryStr = input.query.join(' ').trim();
                } else if (typeof input.query === 'object' && input.query !== null) {
                  queryStr = JSON.stringify(input.query);
                } else {
                  console.error('❌ Invalid query type:', typeof input.query, input.query);
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: JSON.stringify({ error: "Invalid query format - must be a string" })
                  });
                  continue;
                }
                
                if (!queryStr) {
                  console.error('❌ Empty query');
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: JSON.stringify({ error: "Empty query" })
                  });
                  continue;
                }
                
                sendEvent('status', { message: `🔍 Recherche: ${queryStr}` });
                
                const searchResult = await callLinkupSearch(
                  queryStr,
                  input.depth || "standard"
                );
                
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: JSON.stringify(searchResult)
                });
              }
              
              if (block.name === 'output_memo') {
                console.log('✅ [CLAUDE] Memo ready!');
                memoReady = true;
                finalData = block.input;
              }
            }
          }

          // ✅ Continue conversation if tools were called
          if (toolResults.length > 0 && !memoReady) {
            messages.push({ role: "user", content: toolResults });
            continue;
          }

          // ✅ Check if Claude finished without calling output_memo
          if (finalMessage.stop_reason === 'end_turn' && !memoReady) {
            throw new Error('Claude finished without calling output_memo');
          }
        }

        if (!memoReady || !finalData) {
          throw new Error('Max iterations reached without memo');
        }

        // ✅ Logs détaillés pour debug
        console.log('📝 [DEBUG] finalData keys:', Object.keys(finalData));
        console.log('📝 [DEBUG] finalData:', JSON.stringify(finalData, null, 2));

        const typed = finalData as {
          memo_markdown?: string;
          company_name?: string;
          sector?: string;
          solution_summary?: string;
          amount_raised_cents?: number;
          pre_money_valuation_cents?: number;
          current_arr_cents?: number;
          yoy_growth_percent?: number;
          mom_growth_percent?: number;
        };

        // ✅ Validation stricte
        if (!typed.memo_markdown) {
          console.error('❌ Missing memo_markdown in finalData');
          throw new Error('Claude returned output_memo without memo_markdown field');
        }

        const memoText = typed.memo_markdown.trim();
        if (memoText.length < 100) {
          console.error('❌ Memo too short:', memoText.length, 'chars');
          throw new Error('Generated memo is suspiciously short');
        }

        console.log(`✅ Memo validated: ${memoText.length} chars`);

        // ✅ Sauvegarde sécurisée
        const { error: updateError } = await supabaseClient
          .from('analyses')
          .update({
            result: { full_text: memoText },
            progress_percent: 85
          })
          .eq('id', analysisId);

        if (updateError) {
          console.error('❌ Failed to save memo:', updateError);
          throw new Error(`Failed to save memo: ${updateError.message}`);
        }

        console.log('💾 Memo saved');

        // ✅ Événement done avec validation
        sendEvent('done', {
          success: true,
          memoLength: memoText.length,
          extractedData: {
            company_name: typed.company_name || null,
            sector: typed.sector || null,
            solution_summary: typed.solution_summary || null,
            amount_raised_cents: typed.amount_raised_cents || null,
            pre_money_valuation_cents: typed.pre_money_valuation_cents || null,
            current_arr_cents: typed.current_arr_cents || null,
            yoy_growth_percent: typed.yoy_growth_percent || null,
            mom_growth_percent: typed.mom_growth_percent || null
          }
        });

        console.log('✅ Done event sent with extractedData');
        controller.close();

      } catch (error) {
        console.error('❌ Stream error:', error);
        sendEvent('error', { 
          message: error instanceof Error ? error.message : 'Unknown error' 
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
      'Connection': 'keep-alive'
    }
  });
});
