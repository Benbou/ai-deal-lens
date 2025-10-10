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
        let streamClosed = false;
        
        const sendEvent = (event: string, data: any) => {
          if (streamClosed) {
            console.warn('⚠️ Attempted to send event after stream closed:', event);
            return;
          }
          try {
            const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(message));
          } catch (error) {
            console.error('Error sending event:', error);
            streamClosed = true;
          }
        };

        try {
          await streamAnalysis(supabaseClient, dealId, sendEvent);
        } catch (error) {
          console.error('Streaming error:', error);
          sendEvent('error', { 
            message: error instanceof Error ? error.message : 'Analysis failed' 
          });
        } finally {
          streamClosed = true;
          try {
            controller.close();
          } catch (e) {
            console.warn('Stream already closed');
          }
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

    // ============= FIRST AI CALL: GENERATE MEMO ONLY =============
    const systemPrompt = `You are a senior investment analyst specialized in producing ultra-effective investment memos for VC funds. Your mission is to transform pitch deck content into decision-ready analyses that can be read in 2–3 minutes while preserving all substance required for an informed investment decision.

**Output Language:** French | **Tone:** Constructive skepticism, ~90% rejection rate

## Mandatory Method

### Phase 1 - Web Research (5-8 searches):
Validate: market size, founders, competition, model, impact
Systematic triangulation + source every key metric

### Phase 2 - Validation:
Seek contradictions, benchmark vs industry data, note uncertainties

## Immediate Rejection (any single trigger)
- Unproven model requiring market education
- Pre-revenue without customer validation
- Unsubstantiated impact claims
- Insufficient founder-market fit
- Excessive valuation vs traction
- Vague/replicable competitive advantage
- Critical unsecured dependencies

## Writing Principles
- **Extreme concision:** 800-1000 words MAX - every sentence must be decision-relevant
- **Quantify systematically:** Use concrete numbers from the deck
- **Note gaps:** If critical data is missing, write "Missing: [what]"
- **No jargon or repetition:** Direct, actionable language only
- **Binary decision:** Every memo ends with clear GO/NO-GO recommendation

## Mandatory Structure (use exact French headings with ##)

### ## 1. Source du Deal
Origine du deal (1 ligne)

### ## 2. Termes
- Montant levé et valorisation pré/post-money
- Utilisation des fonds (% breakdown)
- Milestones clés visés
- Scénarios de sortie envisagés
(4-5 lignes)

### ## 3. Résumé Exécutif
- Que fait l'entreprise (1 phrase)
- Pourquoi ça peut gagner (proof points concrets)
- Top 2 risques majeurs
- Décision préliminaire
(3-4 lignes)

### ## 4. Contexte Marché
- Problème adressé (quantifié si possible)
- Drivers d'adoption du marché
- Timing et tendances favorables
(4 lignes)

### ## 5. Solution
- Produit/service (description technique minimale)
- Différenciateurs vs alternatives existantes
- ROI client (si quantifié dans le deck)
- Défensibilité (barrières à l'entrée, IP, effets de réseau)
(5-6 lignes)

### ## 6. Pourquoi Maintenant ?
- Évolutions macro/techno rendant la solution pertinente aujourd'hui
- Fenêtre de timing compétitive
(2-3 lignes)

### ## 7. Métriques Clés
Format tableau markdown si possible:
| Métrique | Valeur | Benchmark |
|----------|--------|-----------|
| ARR/MRR | [X] | [si dispo] |
| Croissance (YoY) | [X%] | [si dispo] |
| CAC / LTV | [X / Y] | Ratio: [Z] |
| Burn / Runway | [X/mois] | [Y mois] |
| Multiple valorisation | [X×ARR] | Note: [commentaire] |

**Si données manquantes:** "Missing: [métrique]"

### ## 8. Marché
- TAM/SAM (sources du deck + web research)
- CAGR et drivers de croissance
- Pénétration réaliste à 5 ans
- Vecteurs d'expansion (géo, verticaux, produits)
(4 lignes)

### ## 9. Modèle d'Affaires
- Streams de revenus (% mix)
- Unit economics (marges, contribution)
- Leviers opérationnels (scalabilité)
- Projection 3-5 ans (si dans le deck)
(4 lignes)

### ## 10. Concurrence
- 2-3 principaux concurrents (noms + web research)
- Alternatives actuelles des clients (status quo)
- Barrières à l'entrée
- Avantages compétitifs durables
(4 lignes)

### ## 11. Traction
- Croissance récente (chiffres concrets)
- Product-Market Fit (rétention, NPS si dispo)
- Partenariats stratégiques
- Clients de référence (logos)
(4 lignes)

### ## 12. Équipe
- Track record des fondateurs (exits, expertise sectorielle + web research)
- Founder-market fit
- Gaps critiques dans l'équipe
- Advisors pertinents
(3 lignes)

### ## 13. Risques
- 3-4 risques majeurs identifiés
- Mitigations concrètes pour chacun
- Scénarios: downside / base / upside (si éléments dans le deck)
- Red flags éventuels
(5 lignes)

### ## 14. Recommandation
**GO** ou **NO-GO** + rationale synthétique
- **Si GO:** Ticket recommandé, conditions d'investissement, due diligence prioritaire
- **Si NO-GO:** Milestones de reconsidération (ARR, clients, fundraising, etc.)
(2-3 lignes)

### ## 15. Sources
**Web:** [5-8 URLs clés utilisées]

## Formatting Requirements
- Use ## for all section headings
- Use **bold** for key numbers and decisions
- Use bullet points (-) for lists
- Use tables (markdown) for metrics when possible
- Add blank lines between sections for readability
- Keep total output under 1000 words

## Critical Rules
- If data is missing, explicitly state "Missing: [data]" instead of inventing
- Every claim must be backed by deck content or web research
- Prioritize decision-relevant information over descriptive content
- End with actionable GO/NO-GO recommendation
- USE WEB SEARCH TOOL to validate market, competitors, founders

Generate the COMPLETE memo in one go. Write the full analysis without interruption.`;

    const prompt = `Voici le contenu du pitch deck à analyser:\n\n${extractedMarkdown}\n\nCrée un mémo d'investissement ultra-concis (800-1000 mots MAX) avec une recommandation GO/NO-GO claire. Adopte un ton de senior analyst avec scepticisme constructif. Quantifie systématiquement et note explicitement les données manquantes. Utilise la recherche web pour valider les informations critiques (marché, concurrents, fondateurs).`;

    // Call Claude Haiku API - NO TOOLS, just generate the memo
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2500,
        stream: true,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search'
          }
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      throw new Error('Claude API error');
    }

    // Stream the response - simplified parsing (no tools)
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

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
          
          // Simple text streaming only
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            const text = parsed.delta.text;
            fullText += text;
            sendEvent('delta', { text });
          }
        } catch (e) {
          console.error('Failed to parse SSE line:', e, line);
        }
      }
    }

    console.log('✅ Memo generation completed. Full text length:', fullText.length);
    console.log('First 300 chars:', fullText.substring(0, 300));
    console.log('Last 300 chars:', fullText.substring(fullText.length - 300));

    // Save the complete memo
    await supabaseClient
      .from('analyses')
      .update({
        status: 'completed',
        result: { full_text: fullText },
        completed_at: new Date().toISOString(),
        progress_percent: 80
      })
      .eq('id', analysisId);

    console.log('✅ Memo saved to database');
    sendEvent('status', { message: 'Mémo généré, extraction des données...' });

    // ============= SECOND AI CALL: EXTRACT STRUCTURED DATA =============
    console.log('Starting structured data extraction...');

    const extractionPrompt = `Analyze this pitch deck content and extract key data points.
Return ONLY valid JSON with these exact fields (use null if not found):

{
  "company_name": "Legal company name",
  "sector": "Main industry sector",
  "solution_summary": "One sentence describing the solution (max 200 chars)",
  "amount_raised_cents": integer in cents (or null),
  "pre_money_valuation_cents": integer in cents (or null),
  "current_arr_cents": integer in cents representing current ARR or annual revenue (or null),
  "yoy_growth_percent": decimal number for Year-over-Year growth % (e.g., 150.5 for 150.5% growth, or null),
  "mom_growth_percent": decimal number for Month-over-Month growth % (e.g., 25.3 for 25.3% growth, or null)
}

IMPORTANT: 
- Return ONLY the JSON object, no additional text
- Convert all amounts to cents (multiply by 100)
- Growth percentages should be numbers without % sign (e.g., 150.5, not "150.5%")
- If a value is not found, use null`;

    const extractionResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        temperature: 0,
        messages: [
          { 
            role: 'user', 
            content: `${extractionPrompt}\n\nPitch deck content:\n\n${extractedMarkdown}` 
          }
        ],
      }),
    });

    if (!extractionResponse.ok) {
      console.error('Extraction API call failed:', await extractionResponse.text());
      throw new Error('Failed to extract structured data');
    }

    const extractionData = await extractionResponse.json();
    const extractedJson = extractionData.content[0].text;

    console.log('Raw extraction response:', extractedJson);

    // Parse extracted data
    let parsedData: any = null;
    try {
      parsedData = JSON.parse(extractedJson);
      console.log('✅ Parsed structured data:', JSON.stringify(parsedData, null, 2));
    } catch (e) {
      console.error('❌ Failed to parse extraction JSON:', e);
      console.error('Raw text:', extractedJson);
    }

    // Update deal with extracted data
    if (parsedData) {
      const dealUpdate: any = {};
      
      if (parsedData.company_name) dealUpdate.company_name = parsedData.company_name;
      if (parsedData.sector) dealUpdate.sector = parsedData.sector;
      if (parsedData.solution_summary) dealUpdate.solution_summary = parsedData.solution_summary;
      if (parsedData.amount_raised_cents) dealUpdate.amount_raised_cents = parsedData.amount_raised_cents;
      if (parsedData.pre_money_valuation_cents) dealUpdate.pre_money_valuation_cents = parsedData.pre_money_valuation_cents;
      
      // Nouveaux champs de traction
      if (parsedData.current_arr_cents !== undefined && parsedData.current_arr_cents !== null) {
        dealUpdate.current_arr_cents = parsedData.current_arr_cents;
      }
      if (parsedData.yoy_growth_percent !== undefined && parsedData.yoy_growth_percent !== null) {
        dealUpdate.yoy_growth_percent = parsedData.yoy_growth_percent;
      }
      if (parsedData.mom_growth_percent !== undefined && parsedData.mom_growth_percent !== null) {
        dealUpdate.mom_growth_percent = parsedData.mom_growth_percent;
      }

      console.log('Updating deal with:', dealUpdate);

      if (Object.keys(dealUpdate).length > 0) {
        const { error: updateError } = await supabaseClient
          .from('deals')
          .update(dealUpdate)
          .eq('id', dealId);

        if (updateError) {
          console.error('❌ Failed to update deal:', updateError);
        } else {
          console.log('✅ Deal updated successfully with', Object.keys(dealUpdate).length, 'fields');
        }
      }
    } else {
      console.warn('⚠️ No structured data extracted, deal not updated');
    }

    // Final status update
    await supabaseClient
      .from('analyses')
      .update({
        progress_percent: 100
      })
      .eq('id', analysisId);

    sendEvent('status', { message: 'Analyse terminée !' });
    console.log('✅ Complete analysis pipeline finished');

    sendEvent('done', { message: 'Analyse terminée' });
  } catch (error) {
    console.error('Error in streamAnalysis:', error);
    
    if (analysisId) {
      // Check current status before marking as failed
      const { data: currentAnalysis } = await supabaseClient
        .from('analyses')
        .select('status')
        .eq('id', analysisId)
        .single();

      // Only mark as failed if not already completed
      if (currentAnalysis?.status !== 'completed') {
        await supabaseClient
          .from('analyses')
          .update({ 
            status: 'failed', 
            error_message: error instanceof Error ? error.message : 'Unknown error',
            completed_at: new Date().toISOString()
          })
          .eq('id', analysisId);
      } else {
        console.log('ℹ️ Analysis already completed, not marking as failed');
      }
    }
    
    // Don't re-throw if analysis was successful
    const { data: finalAnalysis } = await supabaseClient
      .from('analyses')
      .select('status')
      .eq('id', analysisId)
      .single();
    
    if (finalAnalysis?.status !== 'completed') {
      throw error;
    }
  }
}
