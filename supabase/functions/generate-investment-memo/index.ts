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

**CRITICAL FORMATTING RULES:**
1. You MUST respond in French, regardless of the language used in the pitch deck
2. You MUST use proper Markdown formatting with STRICT section structure
3. Use # ONLY ONCE for the main title at the very top: "# MÉMO D'INVESTISSEMENT : [Company Name]"
4. Use ## for ALL 15 major sections (e.g., "## 1. Source du Deal", "## 2. Résumé Exécutif")
5. Use ### for subsections within major sections if needed
6. Add TWO blank lines between each ## section for maximum readability
7. Add ONE blank line between paragraphs within sections
8. Use bullet points (-) for lists
9. Use **bold** for emphasis on key metrics and important numbers
10. NEVER skip sections - include all 15 sections even if data is missing (write "Données non disponibles" if needed)

**CONTEXT FROM INVESTOR:**
${deal.personal_notes ? `\n${deal.personal_notes}\n` : 'No additional context provided'}

## Mandatory Method

You must follow this specific analysis approach:
1. First, conduct web research to validate critical claims from the pitch deck
2. Then, write a detailed investment memo in French

## Investment Memo Structure (MUST USE THESE EXACT HEADERS)

Your memo MUST start with ONE main title using # and then include ALL 15 sections using ##:

# MÉMO D'INVESTISSEMENT : [COMPANY NAME]


## 1. Source du Deal

How this opportunity came to us (1-2 sentences)


## 2. Résumé Exécutif

Brief overview (2-3 sentences covering what the company does and key highlights)


## 3. Le Problème

Problem being solved with quantified impact if available


## 4. La Solution

Product/service description with key differentiators


## 5. Modèle d'Affaires

Business model, revenue streams, and monetization strategy


## 6. Marché & Opportunité

Market size (TAM/SAM/SOM) with sources and growth projections


## 7. Traction & Métriques

Growth metrics, KPIs, ARR, MRR, customer count, retention


## 8. Concurrence

Competitive landscape and positioning


## 9. Go-to-Market

Customer acquisition strategy and distribution channels


## 10. Financements

Funding history, current round terms, and use of funds


## 11. Partenariats & Clients

Key partnerships and reference customers


## 12. Équipe

Team background, expertise, and founder-market fit


## 13. Risques

Key risks and mitigation strategies


## 14. Due Diligence Requise

Areas needing deeper investigation before investment


## 15. Recommandation

Clear GO/NO-GO recommendation with rationale

## Quality Standards

- Be critical and analytical, not promotional
- Validate claims with web research when possible
- Highlight gaps and missing information
- Write in professional French
- Include specific numbers and data points
- Note any red flags or concerns
- **MANDATORY: Add TWO blank lines between each ## section**
- **MANDATORY: Add ONE blank line between paragraphs within sections**
- **MANDATORY: Format like a clean, professional Notion document**`;

    const userPrompt = `Analyze this pitch deck and create a comprehensive investment memo following the EXACT structure specified:

${markdownText}

**CRITICAL INSTRUCTIONS:**
1. First conduct web research to validate key claims
2. Write the full investment memo in French with PERFECT Markdown formatting
3. Start with ONE # for the main title: "# MÉMO D'INVESTISSEMENT : [Company Name]"
4. Use ## for ALL 15 numbered sections (e.g., "## 1. Source du Deal")
5. Add TWO blank lines between each ## section
6. Add ONE blank line between paragraphs within sections
7. Be thorough but concise
8. Highlight both opportunities and risks
9. Include all 15 sections even if some data is missing

**MANDATORY FORMAT EXAMPLE:**
# MÉMO D'INVESTISSEMENT : [Company Name]


## 1. Source du Deal

[1-2 sentences about deal origin]


## 2. Résumé Exécutif

[2-3 sentences overview]

[Additional details if needed]


## 3. Le Problème

[Problem description with data]


... continue for ALL 15 sections with proper spacing.

**DO NOT SKIP ANY SECTIONS. IF DATA IS MISSING, WRITE "Données non disponibles dans le pitch deck."**`;

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
