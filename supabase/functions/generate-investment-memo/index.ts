import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DustAPI } from "npm:@dust-tt/client@1.1.17";

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

    // Initialize Dust SDK
    const dustAPI = new DustAPI(
      { url: "https://dust.tt" },
      {
        workspaceId: DUST_WORKSPACE_ID,
        apiKey: dustApiKey,
      },
      console
    );

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
          console.log('🤖 Starting Dust conversation with SDK...');

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

          // Create conversation with SDK
          const conversationResult = await dustAPI.createConversation({
            title: `Analysis: ${deal.startup_name || dealId}`,
            visibility: "unlisted",
            message: {
              content: userMessage,
              mentions: [{ configurationId: DUST_AGENT_ID }],
              context: {
                timezone: "Europe/Paris",
                username: userName,
                email: userEmail,
                fullName: userName,
                profilePictureUrl: user.user_metadata?.avatar_url || undefined,
                origin: "api"
              }
            }
          });

          if (conversationResult.isErr()) {
            throw new Error(`Dust conversation failed: ${conversationResult.error.message}`);
          }

          const { conversation, message: userMsg } = conversationResult.value;
          console.log('✅ Conversation created:', conversation.sId);

          // Stream agent response
          const streamResult = await dustAPI.streamAgentAnswerEvents({
            conversation,
            userMessageId: userMsg.sId,
          });

          if (streamResult.isErr()) {
            throw new Error(`Dust stream failed: ${streamResult.error.message}`);
          }

          const { eventStream } = streamResult.value;
          let streamComplete = false;

          // Native iteration over stream
          for await (const event of eventStream) {
            if (streamClosed) break;
            if (!event) continue;

            switch (event.type) {
              case 'user_message_error':
                console.error('❌ User message error:', event.error);
                throw new Error(`Dust error: ${event.error.message}`);

              case 'agent_error':
                console.error('❌ Agent error:', event.error);
                throw new Error(`Agent error: ${event.error.message}`);

              case 'generation_tokens':
                // Only take real tokens (not chain of thought)
                if (event.classification === 'tokens') {
                  const textChunk = event.text || '';
                  if (textChunk) {
                    fullText += textChunk;
                    sendEvent('delta', { text: textChunk });
                  }
                }
                break;

              case 'agent_message_success':
                console.log('✅ Dust agent completed');
                // Fallback: use final message if fullText is empty
                if (!fullText && event.message.content) {
                  fullText = event.message.content;
                }
                streamComplete = true;
                break;

              default:
                // Ignore other events
                break;
            }

            if (streamComplete) break;
          }

          if (!fullText) {
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
            textLength: fullText.length,
            conversationId: conversation.sId
          });

        } catch (error) {
          console.error('💥 Error in memo generation:', error);
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
