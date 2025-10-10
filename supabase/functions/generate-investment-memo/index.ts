import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3';

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

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

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

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    const systemPrompt = `You are a senior investment analyst specialized in venture capital. Your task is to analyze startup pitch decks and create comprehensive, professional investment memos in French.

**CONTEXT FROM INVESTOR:**
${deal.personal_notes ? `\n${deal.personal_notes}\n` : 'No additional context provided'}

## Mandatory Method

You must follow this specific analysis approach:
1. First, conduct web research to validate critical claims from the pitch deck
2. Then, write a detailed investment memo in French

## Investment Memo Structure (in French)

Your memo must include these sections:

1. **Source du Deal** - How this opportunity came to us
2. **Résumé Exécutif** - Brief overview (2-3 sentences)
3. **Le Problème** - Problem being solved
4. **La Solution** - Product/service description
5. **Modèle d'Affaires** - Business model and monetization
6. **Marché & Opportunité** - Market size, TAM/SAM/SOM
7. **Traction & Métriques** - Growth metrics, KPIs
8. **Concurrence** - Competitive landscape
9. **Go-to-Market** - Customer acquisition strategy
10. **Financements** - Funding history and current round
11. **Partenariats & Clients** - Key partnerships and reference customers
12. **Équipe** - Team background and expertise
13. **Risques** - Key risks and mitigation
14. **Due Diligence Requise** - Areas needing deeper investigation
15. **Recommandation** - Investment recommendation with rationale

## Quality Standards

- Be critical and analytical, not promotional
- Validate claims with web research when possible
- Highlight gaps and missing information
- Write in professional French
- Include specific numbers and data points
- Note any red flags or concerns`;

    const userPrompt = `Analyze this pitch deck and create a comprehensive investment memo:

${markdownText}

Remember to:
1. First conduct web research to validate key claims
2. Then write the full investment memo in French
3. Be thorough but concise
4. Highlight both opportunities and risks`;

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
          console.log('🤖 Calling Claude API for memo generation...');

          const messageStream = await anthropic.messages.stream({
            model: 'claude-opus-4-20250514',
            max_tokens: 16000,
            temperature: 0.3,
            system: systemPrompt,
            messages: [
              {
                role: 'user',
                content: userPrompt
              }
            ]
          });

          for await (const chunk of messageStream) {
            if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
              const textChunk = chunk.delta.text;
              fullText += textChunk;
              sendEvent('delta', { text: textChunk });
            }
          }

          console.log('✅ Memo generation completed. Full text length:', fullText.length);

          // Save the complete memo to database
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
          } else {
            console.log('✅ Memo saved to database');
          }

          sendEvent('memo_complete', { success: true, textLength: fullText.length });

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
