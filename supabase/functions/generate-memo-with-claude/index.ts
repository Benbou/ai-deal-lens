import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.30.1";
import { corsHeaders } from '../_shared/cors.ts';
import { sanitizeExtractedData } from '../_shared/data-validators.ts';

serve(async (req) => {
  try {
    console.log('[MEMO-GEN] [INIT] === FUNCTION STARTED ===');
    
    if (req.method === 'OPTIONS') {
      console.log('[MEMO-GEN] [INIT] OPTIONS request, returning CORS');
      return new Response(null, { headers: corsHeaders });
    }

    console.log('[MEMO-GEN] [INIT] POST request received');
    const functionStartTime = Date.now();
    
    // Parse request body
    let dealId: string;
    let markdownText: string;
    let analysisId: string;
    
    try {
      console.log('[MEMO-GEN] [INIT] Parsing request body...');
      const body = await req.json();
      console.log('[MEMO-GEN] [INIT] Body parsed successfully');
      
      dealId = body.dealId;
      markdownText = body.markdownText;
      analysisId = body.analysisId;

      if (!dealId || !markdownText || !analysisId) {
        console.error('[MEMO-GEN] [ERROR] Missing parameters:', {
          dealId: !!dealId,
          markdownText: !!markdownText,
          analysisId: !!analysisId
        });
        throw new Error('Missing required parameters');
      }
      console.log('[MEMO-GEN] [INIT] Parameters validated');
    } catch (error) {
      console.error('[MEMO-GEN] [ERROR] Body parsing failed:', error);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize API keys
    console.log('[MEMO-GEN] [INIT] Checking API keys...');
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    const LINKUP_API_KEY = Deno.env.get('LINKUP_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('[MEMO-GEN] [INIT] API keys status:', {
      anthropic: !!ANTHROPIC_API_KEY,
      linkup: !!LINKUP_API_KEY,
      supabaseUrl: !!supabaseUrl,
      supabaseServiceKey: !!supabaseServiceKey
    });

    if (!ANTHROPIC_API_KEY || !LINKUP_API_KEY) {
      console.error('[MEMO-GEN] [ERROR] API keys missing');
      return new Response(
        JSON.stringify({ success: false, error: 'API keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[MEMO-GEN] [INIT] Initializing Anthropic client...');
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    console.log('[MEMO-GEN] [INIT] Anthropic client initialized');
    
    console.log('[MEMO-GEN] [INIT] Creating Supabase client...');
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    console.log('[MEMO-GEN] [INIT] Supabase client created');

    // Verify authorization - SIMPLIFIED (decode JWT directly)
    console.log('[MEMO-GEN] [INIT] Verifying auth...');
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[MEMO-GEN] [ERROR] No auth header');
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[MEMO-GEN] [INIT] Auth header present, extracting user ID from JWT...');
    const token = authHeader.replace('Bearer ', '');
    
    let userId: string;
    try {
      // Decode JWT to extract user_id without calling auth.getUser()
      const payload = JSON.parse(atob(token.split('.')[1]));
      userId = payload.sub;
      console.log('[MEMO-GEN] [INIT] User ID extracted from JWT:', userId);
    } catch (error) {
      console.error('[MEMO-GEN] [ERROR] Failed to decode JWT:', error);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch deal to verify ownership
    console.log('[MEMO-GEN] [INIT] Fetching deal...');
    const { data: deal, error: dealError } = await supabaseClient
      .from('deals')
      .select('*')
      .eq('id', dealId)
      .eq('user_id', userId)
      .single();

    if (dealError) {
      console.error('[MEMO-GEN] [ERROR] Deal fetch failed:', dealError);
      return new Response(
        JSON.stringify({ success: false, error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!deal) {
      console.error('[MEMO-GEN] [ERROR] Deal not found or access denied');
      return new Response(
        JSON.stringify({ success: false, error: 'Deal not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[MEMO-GEN] [START] Starting memo generation with Claude + Linkup');
    console.log('[MEMO-GEN] [INFO] Deal loaded:', deal.startup_name);

  // System prompt
  const systemPrompt = `Tu es un analyste senior en capital-risque d'un fonds early-stage français (pre-seed à série A).

Ton rôle : analyser un pitch deck avec l'esprit critique d'un investisseur professionnel et générer un mémo structuré utilisable pour :
- Une présentation au comité d'investissement
- Une discussion argumentée avec les cofondateurs
- Une comparaison avec d'autres opportunités du pipeline

**Format de sortie attendu** : markdown bien structuré avec sections H2 claires (## Titre).

**IMPORTANT - Délimiteurs structurels** : Pour faciliter le parsing automatique, utilise ces délimiteurs :
- Sections principales : toujours utiliser ## pour H2
- Labels standardisés dans les listes : **Ticket**, **Pré-money**, **Usage des fonds**, **Jalons clés**, **Scénarios de sortie**
- Décision : toujours formatter comme "**Décision** : **[GO/NO-GO/GO conditionnel]**"

**CRITICAL DATA TYPING RULES:**
- For numeric fields (amount_raised_cents, yoy_growth_percent, mom_growth_percent, pre_money_valuation_cents, current_arr_cents):
  - If the value is known, provide it as a NUMBER: { "yoy_growth_percent": 45 }
  - If the value is unknown, use the literal null value: { "yoy_growth_percent": null }
  - NEVER use the string "null": { "yoy_growth_percent": "null" } ❌ WRONG
  - NEVER use empty string: { "yoy_growth_percent": "" } ❌ WRONG
- Example correct outputs:
  ✅ { "amount_raised_cents": 300000000, "yoy_growth_percent": null }
  ✅ { "current_arr_cents": 50000000, "mom_growth_percent": 37 }
  ❌ { "amount_raised_cents": "null", "yoy_growth_percent": "unknown" }

**Structure complète du mémo** :
1. **Titre** : # Mémo d'Investissement : [Nom de l'entreprise]
   - En-tête : **Source du deal** : [Préciser origine/canal]

2. **## Terms** : Résumé des conditions financières et stratégiques
   - **Ticket** : [montant en k€ ou M€]
   - **Pré-money** : [valuation ou "Inconnu"]
   - **Usage des fonds** : [description 3-5 lignes]
   - **Jalons clés 2025-2026** : [liste séparée par points-virgules]
   - **Scénarios de sortie** : [liste séparée par points-virgules]

3. **## Synthèse exécutive** : Condensé en 4-6 paragraphes couvrant :
   - **Quoi** : Produit/service en 2-3 phrases concrètes
   - **Pourquoi ça gagne** : Positionnement unique + catalyseurs marché
   - **Preuves** : Traction mesurable (clients, revenus, croissance)
   - **Risques majeurs** : (1) Premier risque ; (2) Deuxième risque ; (3) Troisième risque
   - **Décision** : **GO** / **NO-GO** / **GO conditionnel** (avec ticket et conditions DD)

4. **## Contexte marché** :
   - TAM/SAM estimé (avec sources si disponibles dans le deck)
   - Drivers d'adoption (réglementaires, technologiques, comportementaux)
   - CAGR marché et pénétration réaliste

5. **## Solution** :
   - Description produit (pas un copier-coller du deck, ton analyse)
   - ROI client quantifié si données disponibles
   - Différenciation vs. alternatives (avec benchmark si pertinent)
   - Défensibilité (tech, réseau, marque) et moats

6. **## Why Now?** :
   - 2-3 tendances macros (ex: remote work, réglementation, nouvelle techno)
   - Timing de la fenêtre d'opportunité

7. **## Métriques clés** : Tableau markdown avec benchmark si pertinent
   Exemple :
   | Métrique | 2024 | 2025 (projection) | Benchmark |
   |----------|------|------------------|-----------|
   | **ARR (M€)** | 1.2  | 3.5          | 2-4M @ série A |
   | **Croissance YoY** | 15% | 12% | 10-20% |
   | **CAC (€)** | 350 | 280 | 200-500€ |
   | **LTV/CAC** | 2.1x | 3.5x | >3x |

8. **## Marché** :
   - TAM addressable (géographies, segments)
   - CAGR et pénétration réaliste horizon 5 ans
   - Vecteurs d'expansion (nouveaux segments, géo, produits)

9. **## Business Model** :
   - Structure revenus (SaaS, transactionnel, mixte)
   - Unit economics détaillés (CAC, LTV, payback, churn)
   - Operating leverage et path to profitability
   - Outlook 3-5 ans

10. **## Concurrence** :
    - 2-3 acteurs directs (forces/faiblesses)
    - Alternatives (substituts, status quo)
    - Barriers à l'entrée et risque de commoditisation

11. **## Équipe** :
    - Backgrounds fondateurs (expertises clés, expériences notables)
    - Gaps dans l'équipe (recrutements critiques)
    - Cohésion et répartition equity

12. **## Traction** :
    - Résultats mesurables (clients, ARR, croissance)
    - Preuves de product-market fit (retention, NPS, case studies)
    - Jalons atteints vs. plan initial

13. **## Risques** : Top 5 des risques par ordre de criticité
    - Pour chacun : description + probabilité + mitigation proposée

14. **## Benchmarks** : Comparaison avec deals similaires (portfolio ou marché)
    - Multiples (ARR, revenus, croissance)
    - Cap table structure
    - Fundraising trajectory

**Ton** :
- Factuel et data-driven (citations du deck quand pertinent)
- Critique mais constructif
- Pas de bullshit marketing : si le deck manque de données, signale-le
- Utilise des chiffres concrets plutôt que des généralités
- Limite les émojis (maximum 2-3 dans tout le mémo)

**Contraintes de longueur** :
- Mémo complet : 2000-3000 mots minimum
- Chaque section majeure : 150-400 mots
- Synthèse exécutive : 200-300 mots max

**Recherches web via Linkup** :
- Tu peux faire des recherches pour valider des données marché, trouver des benchmarks, vérifier des infos fondateurs
- Limite : 3 recherches par itération
- Cite tes sources quand tu utilises des données web

**Important** :
- Si le deck manque de données critiques (ex: pas de métriques financières), mentionne-le explicitement dans les sections concernées
- Ne fais PAS d'hypothèses chiffrées non fondées
- Termine TOUJOURS par une recommandation claire (GO/NO-GO/GO conditionnel) avec ticket suggéré et conditions DD`;

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
          amount_raised_cents: { 
            type: "number", 
            description: "Amount raised in cents as NUMBER (not string). Use null (not 'null' string) if unknown." 
          },
          pre_money_valuation_cents: { 
            type: "number", 
            description: "Pre-money valuation in cents as NUMBER (not string). Use null (not 'null' string) if unknown." 
          },
          current_arr_cents: { 
            type: "number", 
            description: "Current ARR in cents as NUMBER (not string). Use null (not 'null' string) if unknown." 
          },
          yoy_growth_percent: { 
            type: "number", 
            description: "Year-over-year growth as NUMBER percentage (not string). Use null (not 'null' string) if unknown." 
          },
          mom_growth_percent: { 
            type: "number", 
            description: "Month-over-month growth as NUMBER percentage (not string). Use null (not 'null' string) if unknown." 
          }
        },
        required: ["memo_markdown", "company_name", "sector", "solution_summary"]
      }
    }
  ];

  // Note: sanitizeValue is now imported from _shared/data-validators.ts

  // Helper: Linkup search
  async function callLinkupSearch(query: string, depth: string = "standard") {
    const searchStartTime = Date.now();
    const cleanQuery = String(query).trim();
    
    if (!cleanQuery) {
      console.error(`[${new Date().toISOString()}] [LINKUP] [ERROR] Empty query after sanitization`);
      return { error: 'Empty search query' };
    }
    
    console.log(`[${new Date().toISOString()}] [LINKUP] [START] Query: "${cleanQuery}" (${depth})`);
    
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
        const duration = Date.now() - searchStartTime;
        console.error(`[${new Date().toISOString()}] [LINKUP] [ERROR] Failed in ${duration}ms: ${errorText}`);
        return { error: `Linkup failed (${response.status}): ${errorText}` };
      }

      const data = await response.json();
      const duration = Date.now() - searchStartTime;
      console.log(`[${new Date().toISOString()}] [LINKUP] [SUCCESS] Completed in ${duration}ms (${data.answer?.length || 0} chars)`);
      
      return { 
        answer: data.answer || "No answer received", 
        sources: data.sources || [] 
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const duration = Date.now() - searchStartTime;
      console.error(`[${new Date().toISOString()}] [LINKUP] [ERROR] Exception after ${duration}ms: ${errorMsg}`);
      return { error: `Linkup exception: ${errorMsg}` };
    }
  }

  // Helper: Call Claude with retry on rate limit (429)
  async function callClaudeWithRetry(
    anthropic: any,
    config: any,
    sendEvent: (event: string, data: any) => void,
    maxRetries: number = 3
  ) {
    const delays = [0, 60000, 120000]; // 0s, 60s, 120s
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const attemptStartTime = Date.now();
      
      try {
        console.log(`[${new Date().toISOString()}] [CLAUDE] [ATTEMPT ${attempt}/${maxRetries}] Starting call`);
        
        const stream = await anthropic.messages.stream(config);
        
        console.log(`[${new Date().toISOString()}] [CLAUDE] [SUCCESS] Stream created in ${Date.now() - attemptStartTime}ms`);
        return stream;
        
      } catch (error: any) {
        const attemptDuration = Date.now() - attemptStartTime;
        
        if (error.status === 429 && attempt < maxRetries) {
          const delay = delays[attempt];
          console.warn(`[${new Date().toISOString()}] [CLAUDE] [RATE-LIMIT] Attempt ${attempt}/${maxRetries} failed after ${attemptDuration}ms. Retrying in ${delay/1000}s...`);
          sendEvent('status', { 
            message: `⏳ Rate limit atteint, nouvelle tentative dans ${delay/1000}s (tentative ${attempt + 1}/${maxRetries})...` 
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
          
        } else {
          console.error(`[${new Date().toISOString()}] [CLAUDE] [ERROR] Attempt ${attempt}/${maxRetries} failed after ${attemptDuration}ms:`, error.message);
          throw error;
        }
      }
    }
    
    throw new Error(`Claude API failed after ${maxRetries} attempts`);
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
        const MAX_ITERATIONS = 2; // Reduced from 3 to avoid CPU timeout
        const MAX_LINKUP_SEARCHES_PER_ITERATION = 2; // Reduced from 3
        const SAFETY_TIMEOUT_MS = 80 * 1000; // 80s (20s margin before CPU timeout)
        let memoReady = false;
        let finalData: any = null;
        let isPartialMemo = false;
        const linkupSearches: any[] = [];
        const startTime = Date.now();
        
        // Safety timer to force finalization before CPU timeout
        let safetyTimerTriggered = false;
        const safetyTimer = setTimeout(() => {
          safetyTimerTriggered = true;
          isPartialMemo = true;
          console.warn(`[${new Date().toISOString()}] [SAFETY] Timer triggered at 100s - forcing finalization`);
          sendEvent('status', { 
            message: '⚠️ Analyse longue détectée - finalisation en cours avec les données disponibles...' 
          });
        }, SAFETY_TIMEOUT_MS);

        while (iterationCount < MAX_ITERATIONS && !memoReady && !safetyTimerTriggered) {
          iterationCount++;
          const iterationStartTime = Date.now();
          console.log(`[${new Date().toISOString()}] [CLAUDE] [ITERATION ${iterationCount}/${MAX_ITERATIONS}] Starting`);
          
          // Check safety timeout - force finalization if triggered
          if (safetyTimerTriggered) {
            console.warn(`[${new Date().toISOString()}] [SAFETY] Timeout triggered - forcing output_memo with available data`);
            
            // Force a minimal memo generation with available data
            const partialMemoContent = `# Mémo d'Investissement Partiel : ${deal.startup_name}\n\n⚠️ **Note** : Ce mémo a été généré partiellement en raison d'un timeout. Relancez l'analyse pour obtenir un mémo complet.\n\n## Informations disponibles\n\nDeck analysé : ${deal.startup_name}\n\nLes recherches web et l'analyse complète n'ont pas pu être finalisées dans le temps imparti.`;
            
            finalData = {
              memo_markdown: partialMemoContent,
              company_name: deal.startup_name || 'N/A',
              sector: deal.sector || 'N/A',
              solution_summary: 'Analyse partielle - timeout',
              is_partial: true
            };
            
            memoReady = true;
            break;
          }
          
          let linkupSearchesThisIteration = 0;

          // ✅ Use native streaming with multi-retry on 429
          const stream = await callClaudeWithRetry(
            anthropic,
            {
              model: "claude-haiku-4-5-20251001",
              max_tokens: 16000,
              temperature: 1,
              system: systemPrompt,
              messages: messages,
              tools: tools
            },
            sendEvent,
            3 // Max 3 attempts
          );

          let toolResults: any[] = [];
          
          // ✅ Listen to streaming events in real-time
          stream
            .on('text', (text: any) => {
              // Token-by-token streaming
              sendEvent('delta', { text });
            })
            .on('contentBlock', (block: any) => {
              if (block.type === 'tool_use') {
                console.log(`[${new Date().toISOString()}] [CLAUDE] [TOOL] ${block.name}`);
              }
            })
            .on('message', (message: any) => {
              console.log(`[${new Date().toISOString()}] [CLAUDE] [STOP] ${message.stop_reason}`);
            });

          // ✅ Wait for complete response
          const finalMessage = await stream.finalMessage();
          const iterationDuration = Date.now() - iterationStartTime;
          
          // ✅ Log stop reason for debugging
          console.log(`[${new Date().toISOString()}] [CLAUDE] [ITERATION ${iterationCount}] Completed in ${iterationDuration}ms, stop_reason: ${finalMessage.stop_reason}, tokens: ${finalMessage.usage?.input_tokens}→${finalMessage.usage?.output_tokens}`);
          
          // ✅ Add response to conversation
          messages.push({ role: "assistant", content: finalMessage.content });

          // ✅ Process tool_use in final message
          for (const block of finalMessage.content) {
            if (block.type === 'tool_use') {
              if (block.name === 'linkup_search') {
                linkupSearchesThisIteration++;
                
                // Block excessive searches
                if (linkupSearchesThisIteration > MAX_LINKUP_SEARCHES_PER_ITERATION) {
                  console.warn(`[${new Date().toISOString()}] [LINKUP] [LIMIT] Max searches reached for iteration ${iterationCount} (${linkupSearchesThisIteration}/${MAX_LINKUP_SEARCHES_PER_ITERATION})`);
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: JSON.stringify({ 
                      answer: `Maximum de recherches atteint pour cette itération (${MAX_LINKUP_SEARCHES_PER_ITERATION}). Générez le mémo avec les informations disponibles.`,
                      sources: []
                    })
                  });
                  continue;
                }
                
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
                
                // Track search for metadata
                linkupSearches.push({
                  query: queryStr,
                  depth: input.depth || "standard",
                  timestamp: new Date().toISOString(),
                  results: searchResult
                });
                
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: JSON.stringify(searchResult)
                });
              }
              
              if (block.name === 'output_memo') {
                console.log(`[${new Date().toISOString()}] [OUTPUT_MEMO] [RECEIVED] Memo ready`);
                memoReady = true;
                finalData = block.input;
              }
            }
          }

          // ✅ Continue conversation if tools were called
          if (toolResults.length > 0 && !memoReady) {
            messages.push({ role: "user", content: toolResults });
            
            // Progressive save: update analyses.result with current iteration data (non-blocking)
            const progressData = {
              iteration: iterationCount,
              messages_count: messages.length,
              linkup_searches: linkupSearches.length,
              timestamp: new Date().toISOString(),
              is_partial: true,
              partial_memo: finalData || null
            };
            
            // Background save without blocking the stream
            supabaseClient
              .from('analyses')
              .update({ 
                result: progressData,
                current_step: `Itération ${iterationCount}/${MAX_ITERATIONS} - Recherches en cours`
              })
              .eq('id', analysisId)
              .then(({ error }) => {
                if (error) {
                  console.error(`[${new Date().toISOString()}] [BG-SAVE] Failed to save progress:`, error);
                } else {
                  console.log(`[${new Date().toISOString()}] [BG-SAVE] Iteration ${iterationCount} saved`);
                }
              });
            
            continue;
          }

          // ✅ Force stop after max iterations
          if (iterationCount >= MAX_ITERATIONS && !memoReady) {
            const fallbackStartTime = Date.now();
            console.warn(`[${new Date().toISOString()}] [FALLBACK] [START] Max iterations reached (${MAX_ITERATIONS}). Forcing memo generation.`);
            const forceStopMessage = {
              role: "user" as const,
              content: `Vous avez atteint le nombre maximum d'itérations (${MAX_ITERATIONS}). Générez maintenant le mémo final avec toutes les informations collectées en utilisant l'outil output_memo.`
            };
            messages.push(forceStopMessage);
            
            // Final call without tools to force output
            const finalStream = await callClaudeWithRetry(
              anthropic,
              {
                model: "claude-haiku-4-5-20251001",
                max_tokens: 16000,
                temperature: 1,
                system: systemPrompt,
                messages: messages,
                tools: tools
              },
              sendEvent,
              3
            );
            
            finalStream.on('text', (text: any) => sendEvent('delta', { text }));
            const finalResponse = await finalStream.finalMessage();
            
            for (const block of finalResponse.content) {
              if (block.type === 'tool_use' && block.name === 'output_memo') {
                memoReady = true;
                finalData = block.input;
                break;
              }
            }
            
            const fallbackDuration = Date.now() - fallbackStartTime;
            if (!memoReady) {
              console.error(`[${new Date().toISOString()}] [FALLBACK] [ERROR] Failed after ${fallbackDuration}ms`);
              throw new Error('Claude failed to generate memo after max iterations');
            }
            console.log(`[${new Date().toISOString()}] [FALLBACK] [SUCCESS] Memo generated via fallback in ${fallbackDuration}ms`);
            break;
          }

          // ✅ Validate stop_reason before proceeding
          if (finalMessage.stop_reason === 'end_turn' && !memoReady) {
            console.error('❌ Claude finished without calling output_memo (end_turn)');
            sendEvent('error', { 
              message: 'Claude a terminé sans générer le mémo complet' 
            });
            throw new Error('Claude finished without calling output_memo');
          }

          // ✅ Break if memo is ready
          if (memoReady && finalData) {
            break;
          }
        }
        
        // Clear safety timer
        clearTimeout(safetyTimer);

        if (!memoReady || !finalData) {
          throw new Error('Max iterations reached without memo');
        }

        // ✅ Logs détaillés pour debug
        console.log(`[${new Date().toISOString()}] [MEMO-GEN] [VALIDATION] finalData keys: ${Object.keys(finalData).join(', ')}`);
        console.log(`[${new Date().toISOString()}] [MEMO-GEN] [DEBUG] Full data: ${JSON.stringify(finalData, null, 2)}`);

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

        // ✅ Validation stricte du memo_markdown
        if (!typed.memo_markdown || typeof typed.memo_markdown !== 'string') {
          console.error(`[${new Date().toISOString()}] [MEMO-GEN] [ERROR] Missing or invalid memo_markdown`);
          console.error(`[${new Date().toISOString()}] [MEMO-GEN] [DEBUG] Keys: ${Object.keys(finalData).join(', ')}`);
          console.error(`[${new Date().toISOString()}] [MEMO-GEN] [DEBUG] Value: ${typed.memo_markdown}`);
          sendEvent('error', { 
            message: 'Claude n\'a pas renvoyé le mémo complet (champ manquant ou invalide)' 
          });
          throw new Error('Claude returned output_memo without valid memo_markdown field');
        }

        const memoText = typed.memo_markdown.trim();
        if (memoText.length < 100) {
          console.error(`[${new Date().toISOString()}] [MEMO-GEN] [ERROR] Memo too short: ${memoText.length} chars`);
          console.error('📝 [DEBUG] Memo content preview:', memoText.substring(0, 200));
          sendEvent('error', { 
            message: `Le mémo généré est trop court (${memoText.length} caractères, probablement tronqué)` 
          });
          throw new Error(`Generated memo is suspiciously short: ${memoText.length} chars`);
        }

        console.log(`✅ Memo validated: ${memoText.length} chars${isPartialMemo ? ' (PARTIAL)' : ''}`);

        // ✅ Sauvegarde sécurisée avec métadonnées et flag partial
        const { error: updateError } = await supabaseClient
          .from('analyses')
          .update({
            result: { 
              full_text: memoText,
              is_partial: isPartialMemo,
              metadata: {
                linkup_searches: linkupSearches,
                iterations: iterationCount,
                total_tokens: 0,
                duration_ms: Date.now() - startTime
              }
            },
            progress_percent: 85
          })
          .eq('id', analysisId);

        if (updateError) {
          console.error('❌ Failed to save memo:', updateError);
          throw new Error(`Failed to save memo: ${updateError.message}`);
        }

        console.log('💾 Memo saved');

        // ✅ Événement done avec validation et sanitization
        const sanitizedData = sanitizeExtractedData({
          company_name: typed.company_name,
          sector: typed.sector,
          solution_summary: typed.solution_summary,
          amount_raised_cents: typed.amount_raised_cents,
          pre_money_valuation_cents: typed.pre_money_valuation_cents,
          current_arr_cents: typed.current_arr_cents,
          yoy_growth_percent: typed.yoy_growth_percent,
          mom_growth_percent: typed.mom_growth_percent
        });

        console.log('📝 [DEBUG] Sanitized data:', JSON.stringify(sanitizedData, null, 2));

        sendEvent('done', {
          success: true,
          memoLength: memoText.length,
          extractedData: sanitizedData,
          is_partial: isPartialMemo
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
  } catch (error) {
    console.error('[MEMO-GEN] [FATAL] Uncaught error in main handler:', error);
    console.error('[MEMO-GEN] [FATAL] Stack trace:', error instanceof Error ? error.stack : 'N/A');
    console.error('[MEMO-GEN] [FATAL] Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error)
    });
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
