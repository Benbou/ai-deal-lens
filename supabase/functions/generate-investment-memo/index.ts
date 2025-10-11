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

          // Create conversation
          const createConvResp = await fetch(
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
              }),
            }
          );

          if (!createConvResp.ok) {
            const errorText = await createConvResp.text();
            throw new Error(`Failed to create Dust conversation: ${errorText}`);
          }

          const convData = await createConvResp.json();
          const conversationId = convData.conversation?.sId;
          const messageId = convData.message?.sId;

          if (!conversationId || !messageId) {
            throw new Error('Invalid Dust API response');
          }

          console.log('✅ Conversation created:', conversationId);

          // Stream agent response
          const streamResp = await fetch(
            `https://dust.tt/api/v1/w/${DUST_WORKSPACE_ID}/assistant/conversations/${conversationId}/messages/${messageId}/events`,
            {
              headers: {
                'Authorization': `Bearer ${dustApiKey}`,
              },
            }
          );

          if (!streamResp.ok) {
            throw new Error('Failed to stream Dust response');
          }

          const reader = streamResp.body?.getReader();
          if (!reader) {
            throw new Error('No stream available');
          }

          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim() || !line.startsWith('data: ')) continue;

              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === 'generation_tokens' && data.classification === 'tokens') {
                  const textChunk = data.text || '';
                  if (textChunk) {
                    fullText += textChunk;
                    sendEvent('delta', { text: textChunk });
                  }
                } else if (data.type === 'agent_message_success') {
                  console.log('✅ Dust agent completed');
                  if (!fullText && data.message?.content) {
                    fullText = data.message.content;
                  }
                } else if (data.type === 'user_message_error' || data.type === 'agent_error') {
                  throw new Error(`Dust error: ${data.error?.message || 'Unknown error'}`);
                }
              } catch (parseError) {
                console.warn('Failed to parse SSE line:', line);
              }
            }
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
            conversationId
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
