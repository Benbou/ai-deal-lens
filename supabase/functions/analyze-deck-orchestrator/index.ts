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

          // Step 1: OCR Processing (25%)
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
              'Authorization': `Bearer ${supabaseServiceKey}`,
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

          // Step 2: Memo Generation with Streaming (50%)
          sendEvent('status', { 
            message: 'Génération du mémo d\'investissement...', 
            progress: 25,
            step: 2,
            totalSteps: 4
          });

          const memoResponse = await fetch(`${supabaseUrl}/functions/v1/generate-investment-memo`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ dealId, markdownText, analysisId }),
          });

          if (!memoResponse.ok) {
            throw new Error('Memo generation failed');
          }

          // Stream memo generation events to client
          const reader = memoResponse.body?.getReader();
          const decoder = new TextDecoder();

          if (!reader) {
            throw new Error('No response stream from memo generation');
          }

          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim() || line.startsWith(':')) continue;

              if (line.startsWith('event:')) {
                continue;
              }

              if (line.startsWith('data:')) {
                const dataStr = line.slice(5).trim();
                try {
                  const data = JSON.parse(dataStr);
                  
                  // Forward events to client
                  if (data.text) {
                    sendEvent('delta', { text: data.text });
                  } else if (data.message) {
                    sendEvent('status', { message: data.message });
                  }
                } catch (e) {
                  console.error('Failed to parse memo event:', e);
                }
              }
            }
          }

          console.log('✅ Memo generation completed');

          sendEvent('status', { 
            message: 'Mémo généré avec succès', 
            progress: 75,
            step: 2,
            totalSteps: 4
          });

          // Step 3: Extract Structured Data (25%)
          sendEvent('status', { 
            message: 'Extraction des données structurées...', 
            progress: 75,
            step: 3,
            totalSteps: 4
          });

          await supabaseClient
            .from('analyses')
            .update({ 
              progress_percent: 80, 
              current_step: 'Extraction des données structurées' 
            })
            .eq('id', analysisId);

          const extractionResponse = await fetch(`${supabaseUrl}/functions/v1/extract-structured-data`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ dealId, analysisId }),
          });

          if (!extractionResponse.ok) {
            throw new Error('Data extraction failed');
          }

          const extractionResult = await extractionResponse.json();
          if (!extractionResult.success) {
            throw new Error(extractionResult.error || 'Extraction failed');
          }

          console.log('✅ Data extraction completed');

          sendEvent('status', { 
            message: 'Données extraites avec succès', 
            progress: 90,
            step: 3,
            totalSteps: 4
          });

          // Step 4: Finalize Analysis
          sendEvent('status', { 
            message: 'Finalisation de l\'analyse...', 
            progress: 90,
            step: 4,
            totalSteps: 4
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
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              dealId, 
              analysisId, 
              extractedData: extractionResult.extractedData 
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
            step: 4,
            totalSteps: 4
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
