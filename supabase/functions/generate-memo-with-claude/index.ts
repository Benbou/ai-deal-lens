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

  try {
    console.log('🚀 Starting memo generation with Claude + Linkup');
    const { dealId, markdownText, analysisId } = await req.json();

    if (!dealId || !markdownText || !analysisId) {
      throw new Error('Missing required parameters: dealId, markdownText, or analysisId');
    }

    // Initialize API keys
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    const LINKUP_API_KEY = Deno.env.get('LINKUP_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
    if (!LINKUP_API_KEY) throw new Error('LINKUP_API_KEY not configured');

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) throw new Error('Unauthorized');

    // Fetch deal details
    const { data: deal, error: dealError } = await supabaseClient
      .from('deals')
      .select('*')
      .eq('id', dealId)
      .eq('user_id', user.id)
      .single();

    if (dealError || !deal) throw new Error('Deal not found or unauthorized');

    console.log('📄 Deal loaded:', deal.startup_name);

    // System prompt with complete analyst methodology
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

    // User message with deck content
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

    // Define tools
    const tools = [
      {
        name: "linkup_search",
        description: "Search the web for up-to-date information about companies, markets, competitors, trends, and benchmarks. Use this to validate claims, find competitors, research founders, and gather market data.",
        input_schema: {
          type: "object" as const,
          properties: {
            query: { 
              type: "string", 
              description: "The search query in English or French" 
            },
            depth: { 
              type: "string", 
              enum: ["standard", "deep"],
              description: "Search depth - use 'deep' for comprehensive market research, 'standard' for quick facts"
            }
          },
          required: ["query"]
        }
      },
      {
        name: "output_memo",
        description: "Output the final investment memo in markdown format along with structured data for the dashboard",
        input_schema: {
          type: "object" as const,
          properties: {
            memo_markdown: { 
              type: "string", 
              description: "Full investment memo in French, formatted in Markdown (800-1000 words)" 
            },
            company_name: { 
              type: "string", 
              description: "Company name" 
            },
            sector: { 
              type: "string", 
              description: "Industry sector in French (e.g., 'FinTech', 'HealthTech', 'SaaS B2B')" 
            },
            solution_summary: { 
              type: "string", 
              description: "Brief solution description in French (max 150 characters)" 
            },
            amount_raised_cents: { 
              type: "number", 
              description: "Amount raised in euro cents (e.g., 100000000 for 1M€), null if not found"
            },
            pre_money_valuation_cents: { 
              type: "number", 
              description: "Pre-money valuation in euro cents, null if not found"
            },
            current_arr_cents: { 
              type: "number", 
              description: "Current ARR in euro cents, null if not found"
            },
            yoy_growth_percent: { 
              type: "number", 
              description: "Year-over-year growth percentage (e.g., 150 for 150%), null if not found"
            },
            mom_growth_percent: { 
              type: "number", 
              description: "Month-over-month growth percentage, null if not found"
            }
          },
          required: ["memo_markdown", "company_name", "sector", "solution_summary"]
        }
      }
    ];

    // Helper function to call Linkup
    async function callLinkupSearch(query: string, depth: string = "standard") {
      console.log(`🔍 [LINKUP] Searching: "${query}" (depth: ${depth})`);
      
      const response = await fetch("https://api.linkup.so/v1/search", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LINKUP_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query,
          depth,
          outputType: "sourcedAnswer"
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [LINKUP] Error:', response.status, errorText);
        return { error: `Linkup search failed: ${errorText}` };
      }

      const data = await response.json();
      console.log(`✅ [LINKUP] Results received (${data.answer?.length || 0} chars)`);
      
      return {
        answer: data.answer,
        sources: data.sources || []
      };
    }

    // Main loop to interact with Claude
    let messages: any[] = [
      {
        role: "user",
        content: userMessage
      }
    ];

    let continueLoop = true;
    let iterationCount = 0;
    const MAX_ITERATIONS = 15;

    while (continueLoop && iterationCount < MAX_ITERATIONS) {
      iterationCount++;
      console.log(`🔄 [CLAUDE] Iteration ${iterationCount}`);

      const response = await anthropic.beta.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4500,
        temperature: 1,
        system: systemPrompt,
        messages: messages,
        tools: tools,
        betas: ["extended-thinking-2025-01-31"]
      });

      console.log(`📊 [CLAUDE] Stop reason: ${response.stop_reason}`);

      // Add Claude's response to messages
      messages.push({
        role: "assistant",
        content: response.content
      });

      // Process content blocks
      let toolResults: any[] = [];
      let memoReady = false;
      let finalData: any = null;

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          console.log(`🔧 [CLAUDE] Tool use: ${block.name}`);
          
          if (block.name === 'linkup_search') {
            const input = block.input as { query: string; depth?: string };
            const searchResult = await callLinkupSearch(
              input.query,
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

      // If we have tool results, add them to messages
      if (toolResults.length > 0 && !memoReady) {
        messages.push({
          role: "user",
          content: toolResults
        });
      }

      // If memo is ready, save and return
      if (memoReady && finalData) {
        const finalDataTyped = finalData as {
          memo_markdown: string;
          company_name: string;
          sector: string;
          solution_summary: string;
          amount_raised_cents?: number;
          pre_money_valuation_cents?: number;
          current_arr_cents?: number;
          yoy_growth_percent?: number;
          mom_growth_percent?: number;
        };
        
        const { error: updateError } = await supabaseClient
          .from('analyses')
          .update({
            result: { 
              full_text: finalDataTyped.memo_markdown
            },
            progress_percent: 85
          })
          .eq('id', analysisId);

        if (updateError) {
          console.error('Error saving memo:', updateError);
          throw new Error('Failed to save memo');
        }

        console.log('💾 Memo saved to database');

        return new Response(
          JSON.stringify({
            success: true,
            memoLength: finalDataTyped.memo_markdown.length,
            extractedData: {
              company_name: finalDataTyped.company_name || null,
              sector: finalDataTyped.sector || null,
              solution_summary: finalDataTyped.solution_summary || null,
              amount_raised_cents: finalDataTyped.amount_raised_cents || null,
              pre_money_valuation_cents: finalDataTyped.pre_money_valuation_cents || null,
              current_arr_cents: finalDataTyped.current_arr_cents || null,
              yoy_growth_percent: finalDataTyped.yoy_growth_percent || null,
              mom_growth_percent: finalDataTyped.mom_growth_percent || null
            }
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // If stop_reason is end_turn without memo, error
      if (response.stop_reason === 'end_turn' && !memoReady) {
        throw new Error('Claude finished without calling output_memo');
      }
    }

    throw new Error('Max iterations reached without completion');

  } catch (error) {
    console.error('Error in generate-memo-with-claude:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
