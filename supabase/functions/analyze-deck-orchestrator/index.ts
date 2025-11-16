/**
 * Analyze Deck Orchestrator Edge Function
 *
 * Orchestrates the complete pitch deck analysis pipeline.
 * Coordinates multiple edge functions and streams progress via SSE.
 *
 * Pipeline Steps:
 * 1. OCR Extraction (0% → 25%): Extract text from PDF using Mistral OCR
 * 2. Quick Context (25% → 45%): Fast extraction of key data points using Claude
 * 3. Memo Generation (45% → 85%): Generate detailed investment memo using Claude + Linkup
 * 4. Finalization (85% → 100%): Update deal record and mark complete
 *
 * @param {string} dealId - UUID of the deal to analyze
 * @returns {Stream} SSE stream with status, delta, and error events
 *
 * Error Handling:
 * - Failed analyses are marked as 'failed' with error messages
 * - Admin alerts are sent on failures
 * - Progress tracking ensures resumability
 *
 * Architecture Improvements:
 * - Type-safe with TypeScript interfaces
 * - Centralized constants and error messages
 * - Modular helper functions
 * - Better error handling and logging
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  PROGRESS,
  TOTAL_PIPELINE_STEPS,
  STATUS_MESSAGES,
  SSE_STREAM_TIMEOUT_MS,
  STREAM_CLOSE_DELAY_MS,
  LOG_PREFIX,
  ERROR_MESSAGES,
  ANALYSIS_STATUS,
} from '../_shared/constants.ts';
import type {
  AnalyzeOrchestratorRequest,
  ProcessOCRResponse,
  QuickExtractResponse,
  FinalizeAnalysisResponse,
  SSEEventData,
  DealRecord,
  AnalysisRecord,
  ExtractedDealData,
} from '../_shared/types.ts';
import { withTimeout, formatUserError, extractErrorDetails } from '../_shared/error-handling.ts';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Creates a formatted log message with timestamp and context
 */
function log(prefix: string, level: string, message: string, context?: any): void {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  console.log(`[${timestamp}] ${prefix} [${level}] ${message}${contextStr}`);
}

/**
 * Creates an SSE event sender with proper encoding
 */
function createEventSender(controller: ReadableStreamDefaultController, streamClosed: { value: boolean }) {
  const encoder = new TextEncoder();

  return (event: string, data: any) => {
    if (streamClosed.value) {
      console.warn('⚠️ Attempted to send event after stream closed:', event);
      return;
    }
    try {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(encoder.encode(message));
    } catch (error) {
      console.error('Error sending event:', error);
      streamClosed.value = true;
    }
  };
}

/**
 * Updates analysis progress in database
 */
async function updateAnalysisProgress(
  supabaseClient: any,
  analysisId: string,
  progress: number,
  step: string
): Promise<void> {
  await supabaseClient
    .from('analyses')
    .update({
      progress_percent: progress,
      current_step: step,
    })
    .eq('id', analysisId);
}

/**
 * Marks analysis as failed and sends admin alert
 */
async function handleAnalysisFailure(
  dealId: string,
  analysisId: string | undefined,
  error: Error,
  currentStep?: string
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!analysisId) {
    log(LOG_PREFIX.ORCHESTRATOR, LOG_PREFIX.ERROR, 'No analysis ID for failure handling', { dealId });
    return;
  }

  const supabaseServiceClient = createClient(supabaseUrl, supabaseServiceKey);

  // Check if analysis is already completed (avoid overwriting success)
  const { data: currentAnalysis } = await supabaseServiceClient
    .from('analyses')
    .select('status, current_step')
    .eq('id', analysisId)
    .single();

  if (currentAnalysis?.status === ANALYSIS_STATUS.COMPLETED) {
    log(LOG_PREFIX.ORCHESTRATOR, LOG_PREFIX.INFO, 'Analysis already completed, skipping failure update');
    return;
  }

  // Update analysis to failed
  await supabaseServiceClient
    .from('analyses')
    .update({
      status: ANALYSIS_STATUS.FAILED,
      error_message: error.message,
      completed_at: new Date().toISOString(),
    })
    .eq('id', analysisId);

  // Send admin alert
  try {
    log(LOG_PREFIX.ORCHESTRATOR, LOG_PREFIX.INFO, 'Sending admin alert...');
    await fetch(`${supabaseUrl}/functions/v1/send-admin-alert`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dealId,
        error: error.message,
        step: currentStep || currentAnalysis?.current_step || 'Unknown',
        timestamp: new Date().toISOString(),
        stackTrace: error.stack,
      }),
    });
    log(LOG_PREFIX.ORCHESTRATOR, LOG_PREFIX.INFO, 'Admin alert sent successfully');
  } catch (alertError) {
    console.error('Failed to send admin alert:', alertError);
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  log(LOG_PREFIX.ORCHESTRATOR, LOG_PREFIX.INIT, '=== FUNCTION STARTED ===');
  log(LOG_PREFIX.ORCHESTRATOR, LOG_PREFIX.INIT, `Method: ${req.method}`);
  
  if (req.method === 'OPTIONS') {
    console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [INIT] OPTIONS request - returning CORS`);
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [INIT] Auth header present: ${!!authHeader}`);
  
  if (!authHeader) {
    console.error(`[${new Date().toISOString()}] [ORCHESTRATOR] [ERROR] No authorization header`);
    return new Response(JSON.stringify({ error: 'No authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [INIT] Parsing request body...`);
    const { dealId } = await req.json();
    console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [INIT] Deal ID: ${dealId}`);
    
    if (!dealId) {
      console.error(`[${new Date().toISOString()}] [ORCHESTRATOR] [ERROR] Missing dealId`);
      throw new Error('dealId is required');
    }

    console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [INIT] Creating Supabase client...`);
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );
    console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [INIT] Supabase client created`);

    // Verify user owns this deal
    console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [INIT] Verifying deal ownership...`);
    const { data: deal, error: dealError } = await supabaseClient
      .from('deals')
      .select('id, user_id')
      .eq('id', dealId)
      .single();

    if (dealError) {
      console.error(`[${new Date().toISOString()}] [ORCHESTRATOR] [ERROR] Deal fetch error:`, dealError);
      throw new Error('Deal not found or access denied');
    }
    
    if (!deal) {
      console.error(`[${new Date().toISOString()}] [ORCHESTRATOR] [ERROR] Deal not found`);
      throw new Error('Deal not found or access denied');
    }
    
    console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [INIT] Deal verified, user: ${deal.user_id}`);

    const orchestratorStartTime = Date.now();
    console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [START] Starting orchestrated analysis for deal: ${dealId}`);

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

    if (analysisError || !analysis) {
      throw new Error('Failed to create analysis record');
    }

    const analysisId = analysis.id;
    console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [INFO] Created analysis record: ${analysisId}`);

    // Update deal status
    await supabaseClient
      .from('deals')
      .update({
        status: 'processing',
        analysis_started_at: new Date().toISOString()
      })
      .eq('id', dealId);

    // Start streaming response
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
          const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
          const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

          // ============================================================================
          // STEP 1: OCR EXTRACTION (Progress: 0% → 25%)
          // ============================================================================
          // Extract text from PDF deck using Mistral OCR API
          // - Retrieves deck file from Supabase Storage
          // - Creates signed URL (valid for 1 hour)
          // - Sends to Mistral OCR API (mistral-ocr-latest model)
          // - Receives markdown-formatted text with page separators
          // - Updates progress: 0% → 10% → 25%
          // ============================================================================
          const ocrStartTime = Date.now();
          console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [STEP 1] Starting OCR extraction`);
          
          sendEvent('status', {
            message: '📄 Étape 1/3 : Extraction du texte du pitch deck (OCR)...', 
            progress: 0,
            step: 1,
            totalSteps: 3
          });

          await supabaseClient
            .from('analyses')
            .update({ 
              progress_percent: 10, 
              current_step: 'Extraction OCR en cours' 
            })
            .eq('id', analysisId);

          const ocrResponse = await fetch(`${supabaseUrl}/functions/v1/process-pdf-ocr`, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ dealId }),
          });

          if (!ocrResponse.ok) {
            throw new Error('OCR processing failed');
          }

          const ocrResult = await ocrResponse.json();
          if (!ocrResult.success) {
            throw new Error(ocrResult.error || 'OCR failed');
          }

          const markdownText = ocrResult.markdownText;
          const ocrDuration = Date.now() - ocrStartTime;
          console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [STEP 1] OCR completed in ${ocrDuration}ms: ${ocrResult.characterCount} characters`);

          sendEvent('status', { 
            message: '✅ Texte extrait avec succès', 
            progress: 25,
            step: 1,
            totalSteps: 4
          });

          await supabaseClient
            .from('analyses')
            .update({ 
              progress_percent: 25, 
              current_step: 'OCR terminé, analyse du contexte...' 
            })
            .eq('id', analysisId);

          // ============================================================================
          // STEP 2: Quick Extract Context (Progress: 25% → 40%)
          // ============================================================================
          console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [STEP 2] Starting quick context extraction`);
          
          sendEvent('status', { 
            message: '🔍 Étape 2/4 : Analyse rapide du contexte (données clés)...', 
            progress: 30,
            step: 2,
            totalSteps: 4
          });

          const quickExtractStart = Date.now();
          const quickExtractResponse = await fetch(
            `${supabaseUrl}/functions/v1/quick-extract-context`,
            {
              method: 'POST',
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                dealId,
                ocrText: markdownText
              })
            }
          );

          if (!quickExtractResponse.ok) {
            const errorText = await quickExtractResponse.text();
            throw new Error(`Quick extract failed: ${quickExtractResponse.status} - ${errorText}`);
          }

          const { quickData } = await quickExtractResponse.json();
          const quickExtractDuration = Date.now() - quickExtractStart;

          console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [STEP 2] Quick extract completed in ${quickExtractDuration}ms`);

          sendEvent('quick_context', { 
            data: quickData,
            progress: 40
          });

          sendEvent('status', { 
            message: '✅ Contexte disponible, génération du mémo détaillé...', 
            progress: 45,
            step: 2,
            totalSteps: 4
          });

          await supabaseClient
            .from('analyses')
            .update({
              progress_percent: 45,
              current_step: 'Contexte prêt, génération du mémo...'
            })
            .eq('id', analysisId);

          // ============================================================================
          // STEP 3: MEMO + EXTRACTION with Claude + Linkup (Progress: 45% → 85%)
          // ============================================================================
          // Generate detailed investment memo using Claude Haiku 4.5 with:
          // - Extended thinking (1500 tokens, reduced from 2500)
          // - Linkup web search for market validation
          // - Structured JSON output (memo + extracted data)
          // ============================================================================
          const memoStartTime = Date.now();
          console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [STEP 3] Starting memo generation with Claude`);
          
          sendEvent('status', { 
            message: '🤖 Étape 3/4 : Analyse approfondie avec Claude AI (recherches web + génération du mémo)...', 
            progress: 45,
            step: 3,
            totalSteps: 4
          });
          const memoResponse = await fetch(
            `${supabaseUrl}/functions/v1/generate-memo-with-claude`,
            {
              method: 'POST',
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ 
                dealId, 
                markdownText, 
                analysisId 
              }),
            }
          );

          if (!memoResponse.ok) {
            const errorText = await memoResponse.text();
            throw new Error(`Memo generation failed: ${errorText}`);
          }

          // Lire le stream SSE de Claude
          const reader = memoResponse.body?.getReader();
          const decoder = new TextDecoder();
          if (!reader) throw new Error('No response stream from Claude');

          let buffer = '';
          let extractedData: any = null;
          let memoComplete = false;
          let lastStatusMessage = '';
          let errorReceived = false;
          
          // Add 10-minute timeout for SSE stream
          const sseTimeout = setTimeout(() => {
            console.error(`[${new Date().toISOString()}] [ORCHESTRATOR] [TIMEOUT] SSE stream timeout after 10 minutes`);
            throw new Error('SSE stream timeout after 10 minutes');
          }, 10 * 60 * 1000);

          try {
            while (!memoComplete) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

              for (const line of lines) {
                if (!line.trim() || line.startsWith(':')) continue;

                // Log all SSE events for debugging
                console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [SSE] Received: ${line.substring(0, 100)}...`);

                if (line.startsWith('event:')) {
                  const eventType = line.slice(6).trim();
                  if (eventType === 'error') {
                    errorReceived = true;
                    console.error(`[${new Date().toISOString()}] [ORCHESTRATOR] [SSE] Error event received from Claude`);
                  }
                  continue;
                }

                if (line.startsWith('data:')) {
                  const dataStr = line.slice(5).trim();
                  try {
                    const eventData = JSON.parse(dataStr);

                    // Re-streamer les événements delta (texte du mémo)
                    if (eventData.text) {
                      sendEvent('delta', { text: eventData.text });
                    }

                    // Re-streamer les statuts (recherches Linkup)
                    if (eventData.message) {
                      lastStatusMessage = eventData.message;
                      sendEvent('status', { 
                        message: eventData.message,
                        progress: 50,
                        step: 2,
                        totalSteps: 3
                      });
                    }

                    // Événement done : récupérer les données extraites
                    if (eventData.success && eventData.extractedData) {
                      extractedData = eventData.extractedData;
                      memoComplete = true;
                      console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [STEP 2] Memo generated and data extracted successfully`);
                    }

                    // Événement error
                    if (eventData.error) {
                      throw new Error(eventData.error);
                    }

                  } catch (e) {
                    console.error(`[${new Date().toISOString()}] [ORCHESTRATOR] [ERROR] Failed to parse SSE data:`, e, dataStr);
                  }
                }
              }
            }
          } finally {
            clearTimeout(sseTimeout);
          }

          if (!extractedData) {
            const errorContext = errorReceived 
              ? `Error event received. Last status: ${lastStatusMessage}` 
              : `No data extracted. Last status: ${lastStatusMessage}`;
            throw new Error(`Claude failed to extract data. ${errorContext}. Check memo generation logs for details.`);
          }

          const memoDuration = Date.now() - memoStartTime;
          console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [STEP 3] Memo generation completed in ${memoDuration}ms`);

          sendEvent('status', { 
            message: '✅ Mémo d\'investissement généré avec succès', 
            progress: 85,
            step: 3,
            totalSteps: 4
          });

          // Step 3 merged with Step 2 (Claude generates memo + extracts data in one call)

          // ============================================================================
          // STEP 3: FINALIZATION (Progress: 85% → 100%)
          // ============================================================================
          // Update deal record with extracted data and mark analysis complete
          // - Updates deals table with all structured fields
          // - Sets deal status to 'completed'
          // - Updates analysis status and timestamps
          // - Finalizes progress to 100%
          // ============================================================================
          const finalizationStartTime = Date.now();
          console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [STEP 3] Starting finalization`);
          
          sendEvent('status', {
            message: '💾 Étape 3/3 : Mise à jour du dashboard...', 
            progress: 85,
            step: 3,
            totalSteps: 3
          });

          await supabaseClient
            .from('analyses')
            .update({ 
              progress_percent: 95, 
              current_step: 'Finalisation' 
            })
            .eq('id', analysisId);

          const finalizationResponse = await fetch(`${supabaseUrl}/functions/v1/finalize-analysis`, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              dealId, 
              analysisId, 
              extractedData: extractedData 
            }),
          });

          if (!finalizationResponse.ok) {
            throw new Error('Finalization failed');
          }

          const finalizationResult = await finalizationResponse.json();
          if (!finalizationResult.success) {
            throw new Error(finalizationResult.error || 'Finalization failed');
          }

          const finalizationDuration = Date.now() - finalizationStartTime;
          const totalDuration = Date.now() - orchestratorStartTime;
          console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [STEP 3] Finalization completed in ${finalizationDuration}ms`);
          console.log(`[${new Date().toISOString()}] [ORCHESTRATOR] [END] Complete analysis pipeline finished in ${totalDuration}ms`);

          sendEvent('status', { 
            message: 'Analyse terminée avec succès', 
            progress: 100,
            step: 3,
            totalSteps: 3
          });
          sendEvent('done', { success: true });

        } catch (error) {
          const totalDuration = Date.now() - orchestratorStartTime;
          console.error(`[${new Date().toISOString()}] [ORCHESTRATOR] [ERROR] Failed after ${totalDuration}ms:`, error);
          
          const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
          const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
          
          // Update analysis to failed
          if (analysisId) {
            const supabaseServiceClient = createClient(
              supabaseUrl,
              supabaseServiceKey
            );

            const { data: currentAnalysis } = await supabaseServiceClient
              .from('analyses')
              .select('status, current_step')
              .eq('id', analysisId)
              .single();

            if (currentAnalysis?.status !== 'completed') {
              await supabaseServiceClient
                .from('analyses')
                .update({ 
                  status: 'failed', 
                  error_message: error instanceof Error ? error.message : 'Unknown error',
                  completed_at: new Date().toISOString()
                })
                .eq('id', analysisId);
            }

            // Send admin alert
            try {
              console.log('📧 Sending admin alert...');
              await fetch(`${supabaseUrl}/functions/v1/send-admin-alert`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  dealId,
                  error: error instanceof Error ? error.message : 'Unknown error',
                  step: currentAnalysis?.current_step || 'Unknown',
                  timestamp: new Date().toISOString(),
                  stackTrace: error instanceof Error ? error.stack : undefined
                })
              });
              console.log('✅ Admin alert sent');
            } catch (alertError) {
              console.error('Failed to send admin alert:', alertError);
            }
          }

          sendEvent('error', { 
            message: error instanceof Error ? error.message : 'Analysis failed' 
          });
        } finally {
          await new Promise(resolve => setTimeout(resolve, 100));
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
      },
    });

  } catch (error) {
    console.error('Error in analyze-deck-orchestrator:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
