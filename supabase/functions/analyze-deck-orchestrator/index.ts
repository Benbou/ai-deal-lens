/**
 * Analyze Deck Orchestrator Edge Function
 * 
 * Orchestrates the complete pitch deck analysis pipeline.
 * Coordinates multiple edge functions and streams progress via SSE.
 * 
 * Pipeline Steps:
 * 1. OCR Extraction (0% → 25%): Extract text from PDF using Mistral OCR
 * 2. Memo Generation (25% → 75%): Generate investment memo using Dust AI
 * 3. Data Extraction (75% → 90%): Extract structured fields using Claude
 * 4. Finalization (90% → 100%): Update deal record and mark complete
 * 
 * @param {string} dealId - UUID of the deal to analyze
 * @returns {Stream} SSE stream with status, delta, and error events
 * 
 * Error Handling:
 * - Failed analyses are marked as 'failed' with error messages
 * - Admin alerts are sent on failures
 * - Progress tracking ensures resumability
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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
    
    if (!dealId) {
      throw new Error('dealId is required');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    // Verify user owns this deal
    const { data: deal, error: dealError } = await supabaseClient
      .from('deals')
      .select('id, user_id')
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      throw new Error('Deal not found or access denied');
    }

    console.log('🚀 Starting orchestrated analysis for deal:', dealId);

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
    console.log('✅ Created analysis record:', analysisId);

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
          sendEvent('status', {
            message: 'Extraction du texte du deck via OCR...', 
            progress: 0,
            step: 1,
            totalSteps: 4
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
          console.log('✅ OCR completed:', ocrResult.characterCount, 'characters');

          sendEvent('status', { 
            message: 'Texte extrait avec succès', 
            progress: 25,
            step: 1,
            totalSteps: 4
          });

          await supabaseClient
            .from('analyses')
            .update({ 
              progress_percent: 25, 
              current_step: 'Génération du mémo d\'investissement' 
            })
            .eq('id', analysisId);

          // ============================================================================
          // STEP 2: MEMO + EXTRACTION with Claude + Linkup (Progress: 25% → 85%)
          // ============================================================================
          // Generate detailed investment memo using Claude Haiku 4.5 with:
          // - Extended thinking (2500 tokens)
          // - Linkup web search for market validation
          // - Structured JSON output (memo + extracted data)
          // ============================================================================
          sendEvent('status', { 
            message: 'Génération du mémo d\'investissement avec Claude...', 
            progress: 25,
            step: 2,
            totalSteps: 3
          });

          console.log('Calling generate-memo-with-claude function...');
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

          const memoResult = await memoResponse.json();
          if (!memoResult.success) {
            throw new Error(memoResult.error || 'Memo generation failed');
          }

          console.log('✅ Memo generated:', memoResult.memoLength, 'chars');
          console.log('📊 Extracted data:', memoResult.extractedData);

          const extractedData = memoResult.extractedData;

          sendEvent('status', { 
            message: 'Mémo et données extraites avec succès', 
            progress: 85,
            step: 2,
            totalSteps: 3
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
          sendEvent('status', {
            message: 'Finalisation de l\'analyse...', 
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

          console.log('✅ Complete analysis pipeline finished');

          sendEvent('status', { 
            message: 'Analyse terminée avec succès', 
            progress: 100,
            step: 3,
            totalSteps: 3
          });
          sendEvent('done', { success: true });

        } catch (error) {
          console.error('Error in orchestrator:', error);
          
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
