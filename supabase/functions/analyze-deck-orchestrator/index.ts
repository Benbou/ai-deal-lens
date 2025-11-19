/**
 * Analyze Deck Orchestrator Edge Function
 *
 * Orchestrates the complete pitch deck analysis pipeline.
 * Coordinates multiple steps and streams progress via SSE.
 *
 * Pipeline Steps:
 * 1. OCR Extraction (0% → 25%): Extract text from PDF using Mistral OCR (via separate function)
 * 2. Quick Context (25% → 45%): Fast extraction of key data points using Claude
 * 3. Memo Generation (45% → 85%): Generate detailed investment memo using Claude + Linkup
 * 4. Finalization (85% → 100%): Update deal record and mark complete
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Anthropic } from "https://esm.sh/@anthropic-ai/sdk@0.30.1";
import { Resend } from 'https://esm.sh/resend@2.0.0';
import { corsHeaders } from '../_shared/cors.ts';
import { sanitizeExtractedData, prepareDataForUpdate } from '../_shared/data-validators.ts';
import { QUICK_EXTRACT_PROMPT, MEMO_SYSTEM_PROMPT, MEMO_USER_PROMPT } from '../_shared/prompts.ts';

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'No authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { dealId } = await req.json();
    if (!dealId) throw new Error('dealId is required');

    // Initialize clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    const linkupApiKey = Deno.env.get('LINKUP_API_KEY');
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!anthropicApiKey || !linkupApiKey || !resendApiKey) {
      throw new Error('Missing API keys configuration');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });
    const resend = new Resend(resendApiKey);

    // Verify deal ownership
    const { data: deal, error: dealError } = await supabaseClient
      .from('deals')
      .select('id, user_id, startup_name, personal_notes')
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      throw new Error('Deal not found or access denied');
    }

    // Create analysis record
    const { data: analysis, error: analysisError } = await supabaseClient
      .from('analyses')
      .insert({
        deal_id: dealId,
        status: 'processing',
        started_at: new Date().toISOString(),
        progress_percent: 0,
        current_step: 'Initialisation'
      })
      .select()
      .single();

    if (analysisError || !analysis) throw new Error('Failed to create analysis record');
    const analysisId = analysis.id;

    // Update deal status
    await supabaseClient
      .from('deals')
      .update({ status: 'processing', analysis_started_at: new Date().toISOString() })
      .eq('id', dealId);

    // Start Streaming
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let streamClosed = false;

        const sendEvent = (event: string, data: any) => {
          if (streamClosed) return;
          try {
            const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(message));
          } catch (e) {
            console.error('Error sending event:', e);
            streamClosed = true;
          }
        };

        try {
          // ============================================================================
          // STEP 1: OCR EXTRACTION (0% -> 25%)
          // ============================================================================
          sendEvent('status', {
            message: '📄 Étape 1/3 : Extraction du texte du pitch deck (OCR)...',
            progress: 0,
            step: 1,
            totalSteps: 3
          });

          // Call separate OCR function (kept separate for isolation)
          const ocrResponse = await fetch(`${supabaseUrl}/functions/v1/process-pdf-ocr`, {
            method: 'POST',
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ dealId }),
          });

          if (!ocrResponse.ok) throw new Error('OCR processing failed');
          const ocrResult = await ocrResponse.json();
          if (!ocrResult.success) throw new Error(ocrResult.error || 'OCR failed');

          const markdownText = ocrResult.markdownText;

          sendEvent('status', {
            message: '✅ Texte extrait avec succès',
            progress: 25,
            step: 1,
            totalSteps: 3
          });

          // ============================================================================
          // STEP 2: QUICK CONTEXT (25% -> 45%)
          // ============================================================================
          sendEvent('status', {
            message: '🔍 Étape 2/3 : Analyse rapide du contexte...',
            progress: 30,
            step: 2,
            totalSteps: 3
          });

          const quickExtractMsg = await anthropic.messages.create({
            model: "claude-sonnet-4-5",
            max_tokens: 600,
            temperature: 0,
            messages: [{ role: "user", content: QUICK_EXTRACT_PROMPT(markdownText) }]
          });

          const quickContentBlock = quickExtractMsg.content[0];
          if (quickContentBlock.type !== 'text') throw new Error('Unexpected response from Claude (Quick Extract)');

          let quickData;
          try {
            let jsonText = quickContentBlock.text.trim();
            if (jsonText.startsWith('```json')) jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            else if (jsonText.startsWith('```')) jsonText = jsonText.replace(/```\n?/g, '');
            quickData = JSON.parse(jsonText);
          } catch (e) {
            console.error('Quick extract JSON parse error:', e);
            // Continue without quick data if fails, or throw? Let's throw to be safe.
            throw new Error('Failed to parse Quick Extract JSON');
          }

          sendEvent('quick_context', { data: quickData, progress: 40 });

          await supabaseClient.from('analyses').update({
            quick_context: quickData,
            progress_percent: 40,
            current_step: 'Contexte prêt'
          }).eq('id', analysisId);

          // ============================================================================
          // STEP 3: MEMO GENERATION (45% -> 85%)
          // ============================================================================
          sendEvent('status', {
            message: '🤖 Étape 3/3 : Analyse approfondie avec Claude AI...',
            progress: 45,
            step: 3,
            totalSteps: 3
          });

          const tools = [
            {
              name: "linkup_search",
              description: "Search the web for up-to-date information.",
              input_schema: {
                type: "object" as const,
                properties: {
                  query: { type: "string", description: "Search query" },
                  depth: { type: "string", enum: ["standard", "deep"] }
                },
                required: ["query"]
              }
            },
            {
              name: "output_memo",
              description: "Output the final complete investment memo. This tool MUST be called once all web searches are completed.",
              input_schema: {
                type: "object" as const,
                properties: {
                  memo_markdown: { 
                    type: "string", 
                    description: "COMPLETE investment memo in Markdown format (2000-3000 words minimum). This is the full detailed memo following the structure in the system prompt, NOT a summary. Must include all sections: Executive Summary, Problem, Solution, Market, Business Model, Traction, Competition, Team, Risks, Recommendation, etc." 
                  },
                  company_name: { type: "string" },
                  sector: { type: "string" },
                  solution_summary: { type: "string", description: "Brief one-sentence summary (max 200 characters)" },
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

          let messages: any[] = [{ role: "user", content: MEMO_USER_PROMPT(markdownText, deal.personal_notes) }];
          let memoReady = false;
          let finalData: any = null;
          let iterationCount = 0;
          const MAX_ITERATIONS = 15; // Increased to allow 6 searches + output_memo + retries

          while (iterationCount < MAX_ITERATIONS && !memoReady) {
            iterationCount++;

            const stream = await anthropic.messages.stream({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 8000,
              temperature: 1,
              system: MEMO_SYSTEM_PROMPT,
              messages: messages,
              tools: tools
            });

            let toolResults: any[] = [];

            stream.on('text', (text) => {
              sendEvent('delta', { text });
            });

            const finalMessage = await stream.finalMessage();
            messages.push({ role: "assistant", content: finalMessage.content });

            for (const block of finalMessage.content) {
              if (block.type === 'tool_use') {
                if (block.name === 'linkup_search') {
                  const input = block.input as any;
                  sendEvent('status', { message: `🔍 Recherche: ${input.query}` });

                  // Call Linkup
                  let searchResult;
                  try {
                    const linkupRes = await fetch("https://api.linkup.so/v1/search", {
                      method: "POST",
                      headers: { "Authorization": `Bearer ${linkupApiKey}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ q: input.query, depth: input.depth || "standard", outputType: "sourcedAnswer" })
                    });
                    if (!linkupRes.ok) throw new Error(await linkupRes.text());
                    searchResult = await linkupRes.json();
                  } catch (e: any) {
                    searchResult = { error: e.message };
                  }

                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: JSON.stringify(searchResult)
                  });
                } else if (block.name === 'output_memo') {
                  memoReady = true;
                  finalData = block.input;
                }
              }
            }

            if (toolResults.length > 0 && !memoReady) {
              messages.push({ role: "user", content: toolResults });
            } else if (toolResults.length === 0 && !memoReady && iterationCount > 1) {
              // If Claude is not calling tools after first iteration, remind it
              messages.push({ 
                role: "user", 
                content: "RAPPEL CRITIQUE : Tu DOIS appeler les outils. Si tu n'as pas encore fait de recherches, appelle linkup_search. Si toutes les recherches sont terminées, appelle output_memo. NE GÉNÈRE PAS DE TEXTE NARRATIF."
              });
            }
          }

          if (!memoReady || !finalData) {
            throw new Error('Failed to generate memo after max iterations');
          }

          // Validate that memo_markdown exists and is not empty
          if (!finalData.memo_markdown || finalData.memo_markdown.trim().length === 0) {
            console.error('❌ output_memo was called but memo_markdown is empty or missing');
            console.error('finalData received:', JSON.stringify(finalData, null, 2));
            throw new Error('Claude called output_memo but did not provide memo_markdown content');
          }

          console.log(`✅ Memo generated successfully, length: ${finalData.memo_markdown.length} characters`);

          // ============================================================================
          // STEP 4: FINALIZATION (85% -> 100%)
          // ============================================================================
          sendEvent('status', {
            message: '💾 Finalisation...',
            progress: 90,
            step: 3,
            totalSteps: 3
          });

          // Save full result to analysis
          await supabaseClient.from('analyses').update({
            result: { full_text: finalData.memo_markdown },
            progress_percent: 95,
            status: 'completed',
            completed_at: new Date().toISOString(),
            current_step: 'Terminé'
          }).eq('id', analysisId);

          // Update deal
          const sanitized = sanitizeExtractedData(finalData);
          const { update: dealUpdate } = prepareDataForUpdate(sanitized);
          dealUpdate.status = 'completed';
          dealUpdate.analysis_completed_at = new Date().toISOString();

          await supabaseClient.from('deals').update(dealUpdate).eq('id', dealId);

          sendEvent('status', {
            message: 'Analyse terminée avec succès',
            progress: 100,
            step: 3,
            totalSteps: 3
          });

          sendEvent('done', {
            success: true,
            extractedData: sanitized
          });

        } catch (error: any) {
          console.error('Pipeline error:', error);

          // Update analysis to failed
          await supabaseClient.from('analyses').update({
            status: 'failed',
            error_message: error.message,
            completed_at: new Date().toISOString()
          }).eq('id', analysisId);

          // Send Admin Alert (Resend)
          try {
            const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'benjamin@alboteam.com';
            await resend.emails.send({
              from: 'DealFlow Alerts <onboarding@resend.dev>',
              to: [adminEmail],
              subject: `🚨 Erreur analyse - Deal ${dealId}`,
              html: `<p>Error: ${error.message}</p><p>Deal ID: ${dealId}</p>`
            });
          } catch (e) {
            console.error('Failed to send admin alert:', e);
          }

          sendEvent('error', { message: error.message });
        } finally {
          streamClosed = true;
          try { controller.close(); } catch { }
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
