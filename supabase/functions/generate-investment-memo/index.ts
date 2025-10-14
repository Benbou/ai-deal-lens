/**
 * Investment Memo Generation Edge Function
 * 
 * Generates detailed investment memos using Dust AI agent in blocking mode.
 * 
 * @param {string} dealId - UUID of the deal
 * @param {string} markdownText - OCR-extracted text from deck
 * @param {string} analysisId - UUID of the analysis record
 * @returns {JSON} { success: true, textLength: number, conversationId: string }
 * 
 * Steps:
 * 1. Verify user authorization and retrieve user profile
 * 2. Fetch deal details and personal notes
 * 3. Create Dust conversation with blocking mode (waits for complete response)
 * 4. Extract agentMessage.content from response
 * 5. Save complete memo to analyses.result.full_text
 * 6. Return success JSON response
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

    console.log('🔍 [DEBUG] Starting memo generation');
    console.log('🔍 [DEBUG] dustApiKey present:', !!dustApiKey);
    console.log('🔍 [DEBUG] DUST_WORKSPACE_ID:', DUST_WORKSPACE_ID);
    console.log('🔍 [DEBUG] DUST_AGENT_ID:', DUST_AGENT_ID);
    console.log('🔍 [DEBUG] markdownText length:', markdownText?.length || 0);
    console.log('🔍 [DEBUG] userName:', userName);
    console.log('🔍 [DEBUG] userEmail:', userEmail);
    
    console.log('🤖 Starting Dust conversation (blocking mode)...');
    console.log('👤 User context:', { userName, userEmail });
    console.log('  - Deck OCR length:', markdownText.length, 'chars');
    console.log('  - Additional context:', deal.personal_notes ? 'YES' : 'NO');

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

    // ============================================================================
    // STEP 1: Create conversation (blocking mode)
    // ============================================================================
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error('⏱️ [ERROR] Dust API timeout after 5 minutes');
      abortController.abort();
    }, 300000); // 5 minutes

    const createResp = await fetch(
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
              profilePictureUrl: user.user_metadata?.avatar_url,
              origin: 'api',
            },
          },
          blocking: true, // ✅ MODE BLOQUANT
        }),
        signal: abortController.signal
      }
    );

    clearTimeout(timeoutId);

    if (!createResp.ok) {
      const errorText = await createResp.text();
      console.error('❌ Failed to create conversation:', createResp.status, errorText);
      throw new Error(`Dust conversation error: ${errorText}`);
    }

    const createData = await createResp.json();
    const conversation = createData.conversation;
    const conversationId = conversation.sId;
    const conversationUrl = `https://dust.tt/w/${DUST_WORKSPACE_ID}/assistant/tO3zJS97oR/conversations/${conversationId}`;

    console.log('✅ Conversation created:', conversationId);
    console.log('🔗 Conversation URL:', conversationUrl);

    // ============================================================================
    // STEP 2: Extract agentMessage.content
    // ============================================================================
    const agentMessage = createData.agentMessage;

    if (!agentMessage || !agentMessage.content) {
      console.error('❌ [DUST] No agent message in response:', JSON.stringify(createData).substring(0, 500));
      throw new Error('Dust did not return an agent message');
    }

    const fullText = agentMessage.content;
    console.log('✅ [DUST] Agent response received:', fullText.length, 'characters');

    // ============================================================================
    // VALIDATION: Ensure we got content
    // ============================================================================
    if (!fullText || fullText.trim().length === 0) {
      console.error('❌ [DUST] Empty response from agent');
      throw new Error('Dust returned an empty memo');
    }

    console.log('✅ Memo generated:', fullText.length, 'chars');

    // ============================================================================
    // STEP 3: Save to database
    // ============================================================================
    const { error: updateError } = await supabaseClient
      .from('analyses')
      .update({
        result: { 
          full_text: fullText,
          conversation_url: conversationUrl 
        },
        progress_percent: 75,
        current_step: 'Extraction des données structurées'
      })
      .eq('id', analysisId);

    if (updateError) {
      console.error('❌ Save error:', updateError);
      throw new Error('Failed to save memo');
    }

    console.log('✅ Memo saved to DB');

    // Return simple JSON response
    return new Response(
      JSON.stringify({
        success: true,
        textLength: fullText.length,
        conversationId: conversationId,
        conversationUrl: conversationUrl
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

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
