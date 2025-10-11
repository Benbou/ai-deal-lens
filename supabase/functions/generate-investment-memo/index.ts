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

  try {
    const { dealId, markdownText, analysisId } = await req.json();
    
    if (!dealId || !markdownText || !analysisId) {
      throw new Error('dealId, markdownText, and analysisId are required');
    }

    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    // Verify user owns the deal
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: dealCheck, error: dealCheckError } = await supabaseClient
      .from('deals')
      .select('user_id')
      .eq('id', dealId)
      .single();

    if (dealCheckError || !dealCheck || dealCheck.user_id !== user.id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('📝 Starting memo generation for deal:', dealId);

    // Get deal with personal notes
    const { data: deal, error: dealError } = await supabaseClient
      .from('deals')
      .select('personal_notes, startup_name')
      .eq('id', dealId)
      .single();

    if (dealError) {
      throw new Error('Failed to fetch deal details');
    }

    const dustApiKey = Deno.env.get('DUST_API_KEY');
    if (!dustApiKey) {
      throw new Error('DUST_API_KEY not configured');
    }

    const DUST_WORKSPACE_ID = '7475ab5b7b';
    const DUST_AGENT_ID = 'mPgSQmdqBb';

    // Start streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let streamClosed = false;
        let fullText = '';

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
          console.log('🤖 Starting Dust API conversation with streaming...');

          const userMessage = `Tu dois analyser ce pitch deck et produire un mémo d'investissement complet en français.

**FORMAT DE SORTIE REQUIS :**
- Utilise le format Markdown avec une structure claire
- Commence par un titre principal avec #
- Utilise ## pour les sections principales
- Utilise ### pour les sous-sections
- Utilise des listes à puces (-) et du gras (**texte**) pour l'emphase
- Sépare bien les sections avec des lignes vides

**PITCH DECK (OCR MARKDOWN) :**

${markdownText}

**CONTEXTE ADDITIONNEL DE L'INVESTISSEUR :**
${deal.personal_notes || 'Aucun contexte additionnel fourni'}

Produis un mémo d'investissement détaillé et structuré en Markdown.`;

          // Create conversation with streaming enabled
          const createUrl = `https://dust.tt/api/v1/w/${DUST_WORKSPACE_ID}/assistant/conversations`;
          
          console.log('📤 Creating Dust conversation with streaming...');
          const response = await fetch(createUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${dustApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: {
                content: userMessage,
                mentions: [{ configurationId: DUST_AGENT_ID }],
                context: {
                  username: "deck_analyzer",
                  timezone: "Europe/Paris",
                  origin: "api"
                }
              },
              blocking: false,
              stream: true
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Dust API error: ${response.status} ${errorText}`);
          }

          console.log('✅ Streaming started from Dust');

          // Parse SSE stream directly
          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('No stream reader available');
          }

          const decoder = new TextDecoder();
          let buffer = '';
          let streamComplete = false;

          while (!streamComplete && !streamClosed) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim() || line.startsWith(':')) continue;

              if (line.startsWith('data: ')) {
                try {
                  const jsonData = JSON.parse(line.slice(6));
                  
                  // Handle generation tokens (streamed text)
                  if (jsonData.type === 'generation_tokens' && jsonData.content?.tokens) {
                    const textChunk = jsonData.content.tokens.text || '';
                    if (textChunk) {
                      fullText += textChunk;
                      sendEvent('delta', { text: textChunk });
                    }
                  }
                  
                  // Handle completion
                  if (jsonData.type === 'agent_message_success') {
                    console.log('✅ Dust agent completed successfully');
                    streamComplete = true;
                    break;
                  }
                  
                  // Handle errors
                  if (jsonData.type === 'agent_error') {
                    throw new Error(`Dust agent error: ${JSON.stringify(jsonData.content)}`);
                  }
                } catch (parseError) {
                  console.warn('Failed to parse SSE line:', line.substring(0, 100), parseError);
                }
              }
            }
          }

          console.log('✅ Memo generation completed. Full text length:', fullText.length);

          // Save the complete memo to database BEFORE closing stream
          const { error: updateError } = await supabaseClient
            .from('analyses')
            .update({
              result: { full_text: fullText },
              progress_percent: 75,
              current_step: 'Extraction des données structurées'
            })
            .eq('id', analysisId);

          if (updateError) {
            console.error('Error saving memo:', updateError);
            sendEvent('error', { message: 'Failed to save memo to database' });
          } else {
            console.log('✅ Memo saved to database');
            // Send confirmation event that memo is saved
            sendEvent('memo_saved', { 
              success: true, 
              textLength: fullText.length,
              analysisId 
            });
          }

        } catch (error) {
          console.error('Error generating memo:', error);
          sendEvent('error', { 
            message: error instanceof Error ? error.message : 'Memo generation failed' 
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
    console.error('Error in generate-investment-memo:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
