/**
 * Investment Memo Generation Edge Function
 * 
 * Generates detailed investment memos using Dust AI agent.
 * Streams the generation progress via Server-Sent Events (SSE).
 * 
 * @param {string} dealId - UUID of the deal
 * @param {string} markdownText - OCR-extracted text from deck
 * @param {string} analysisId - UUID of the analysis record
 * @returns {Stream} SSE stream with events: delta, status, memo_saved, error
 * 
 * Steps:
 * 1. Verify user authorization and retrieve user profile
 * 2. Fetch deal details and personal notes
 * 3. Create Dust conversation with formatted prompt
 * 4. Stream agent response (filter tokens vs chain-of-thought)
 * 5. Save complete memo to analyses.result.full_text
 * 6. Send 'memo_saved' confirmation event
 * 
 * Events emitted:
 * - delta: { text: string } - Text chunk from Dust agent
 * - status: { message: string } - Status updates
 * - memo_saved: { success: true, textLength: number, conversationId: string }
 * - error: { message: string } - Error details
 * 
 * Requirements:
 * - DUST_API_KEY environment variable
 * - User profile with name and email
 * - Deal with OCR-extracted markdown
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

    // Get user profile for Dust context
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('name, email')
      .eq('id', user.id)
      .single();

    const userName = profile?.name || user.email?.split('@')[0] || 'Investor';
    const userEmail = profile?.email || user.email || 'investor@system.local';
    console.log('👤 User context:', { userName, userEmail });

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
          // ============================================================================
          // DEBUG LOGS - Track execution flow and variable state
          // ============================================================================
          console.log('🔍 [DEBUG] Starting memo generation');
          console.log('🔍 [DEBUG] dustApiKey present:', !!dustApiKey);
          console.log('🔍 [DEBUG] DUST_WORKSPACE_ID:', DUST_WORKSPACE_ID);
          console.log('🔍 [DEBUG] DUST_AGENT_ID:', DUST_AGENT_ID);
          console.log('🔍 [DEBUG] markdownText length:', markdownText?.length || 0);
          console.log('🔍 [DEBUG] userName:', userName);
          console.log('🔍 [DEBUG] userEmail:', userEmail);
          
          console.log('🤖 Starting Dust conversation...');
          console.log('👤 User context:', { userName, userEmail });

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

Produis un mémo d'investissement détaillé et structuré en Markdown.`;

          // Create conversation with streaming enabled
          console.log('🌐 [DEBUG] About to call Dust API...');
          console.log('🌐 [DEBUG] URL:', `https://dust.tt/api/v1/w/${DUST_WORKSPACE_ID}/assistant/conversations`);
          
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => {
            console.error('⏱️ [ERROR] Dust stream timeout after 120s');
            abortController.abort();
          }, 120000); // 2 minutes timeout

          const streamResp = await fetch(
            `https://dust.tt/api/v1/w/${DUST_WORKSPACE_ID}/assistant/conversations`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${dustApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                title: `Analysis: ${deal.startup_name || dealId}`,
                visibility: 'unlisted',
                message: {
                  content: userMessage,
                  mentions: [{ configurationId: DUST_AGENT_ID }],
                  context: {
                    timezone: 'Europe/Paris',
                    username: userName,
                    email: userEmail,
                    fullName: userName,
                    profilePictureUrl: user.user_metadata?.avatar_url || undefined,
                    origin: 'api',
                  },
                },
                blocking: true,
              }),
              signal: abortController.signal
            }
          );

          clearTimeout(timeoutId);

          if (!streamResp.ok) {
            const errorText = await streamResp.text();
            console.error('❌ [ERROR] Dust API failed:', streamResp.status, errorText);
            throw new Error(`Failed to create Dust conversation: ${errorText}`);
          }

          console.log('✅ [DEBUG] Dust API call successful');
          console.log('🔍 [DEBUG] Content-Type:', streamResp.headers.get('content-type'));

          // Parse JSON response (blocking mode returns complete response)
          const responseData = await streamResp.json();
          console.log('📦 [DEBUG] Response keys:', Object.keys(responseData));

          // Extract agent message from conversation.content
          if (responseData.conversation?.content) {
            console.log('🔍 [DEBUG] Content array length:', responseData.conversation.content.length);
            
            const agentMessage = responseData.conversation.content
              .find((msg: any) => msg.type === 'agent_message');
            
            if (agentMessage?.content) {
              fullText = agentMessage.content;
              console.log('📝 [DEBUG] Found memo in agent_message.content:', fullText.length, 'chars');
              
              // Send chunks to client for progressive display (simulate streaming)
              const chunkSize = 100;
              for (let i = 0; i < fullText.length; i += chunkSize) {
                const chunk = fullText.slice(i, i + chunkSize);
                sendEvent('delta', { text: chunk });
              }
            } else {
              console.error('❌ [ERROR] agent_message found but no content');
            }
          } else {
            console.error('❌ [ERROR] No conversation.content in response');
          }

          if (!fullText) {
            console.error('❌ [ERROR] No agent message found');
            console.error('📦 Full response:', JSON.stringify(responseData, null, 2));
            throw new Error('No memo text generated by Dust');
          }

          console.log('✅ Memo generated:', fullText.length, 'chars');

          // Save to DB BEFORE closing stream
          const { error: updateError } = await supabaseClient
            .from('analyses')
            .update({
              result: { full_text: fullText },
              progress_percent: 75,
              current_step: 'Extraction des données structurées'
            })
            .eq('id', analysisId);

          if (updateError) {
            console.error('❌ Save error:', updateError);
            throw new Error('Failed to save memo');
          }

          console.log('✅ Memo saved to DB');
          sendEvent('memo_saved', { 
            success: true, 
            textLength: fullText.length
          });

        } catch (error) {
          console.error('💥 [ERROR] Memo generation failed:', error);
          console.error('💥 [ERROR] Stack trace:', error instanceof Error ? error.stack : 'No stack');
          sendEvent('error', { 
            message: error instanceof Error ? error.message : 'Unknown error' 
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
