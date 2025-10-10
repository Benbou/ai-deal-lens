import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const updateProgress = async (client: any, analysisId: string, status: string, step: string, percent: number) => {
  await client
    .from('analyses')
    .update({
      status,
      current_step: step,
      progress_percent: percent
    })
    .eq('id', analysisId);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dealId } = await req.json();
    
    if (!dealId) {
      return new Response(
        JSON.stringify({ error: 'Invalid request' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get authenticated user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify deal ownership
    const { data: deal, error: ownershipError } = await supabaseClient
      .from('deals')
      .select('user_id')
      .eq('id', dealId)
      .single();

    if (ownershipError || !deal) {
      console.error('Deal not found:', dealId, ownershipError?.message);
      return new Response(
        JSON.stringify({ error: 'Deal not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (deal.user_id !== user.id) {
      console.error('Unauthorized access attempt:', user.id, 'to deal:', dealId);
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting streaming analysis for deal:', dealId, 'user:', user.id);

    // Return SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        const sendEvent = (event: string, data: any) => {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        try {
          await streamAnalysis(supabaseClient, dealId, sendEvent);
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          sendEvent('error', { 
            message: error instanceof Error ? error.message : 'Analysis failed' 
          });
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });
  } catch (error) {
    console.error('Error in analyze-deck:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred. Please try again.' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function streamAnalysis(
  supabaseClient: any, 
  dealId: string, 
  sendEvent: (event: string, data: any) => void
) {
  let analysisId: string | null = null;
  
  try {
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    const mistralApiKey = Deno.env.get('MISTRAL_API_KEY');
    
    if (!anthropicApiKey || !mistralApiKey) {
      throw new Error('API keys not configured');
    }

    sendEvent('status', { message: 'Initialisation de l\'analyse...' });

    // Create analysis record
    const { data: analysis, error: analysisError } = await supabaseClient
      .from('analyses')
      .insert({
        deal_id: dealId,
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (analysisError) throw analysisError;
    analysisId = analysis.id;

    sendEvent('status', { message: 'Récupération du deck...' });

    // Get deck file
    const { data: deckFile, error: fileError } = await supabaseClient
      .from('deck_files')
      .select('storage_path, file_name')
      .eq('deal_id', dealId)
      .single();

    if (fileError) throw new Error('Deck file not found');

    // Download file
    const { data: fileData, error: downloadError } = await supabaseClient.storage
      .from('deck-files')
      .download(deckFile.storage_path);

    if (downloadError) throw new Error('Failed to download file');

    sendEvent('status', { message: 'Extraction OCR avec Mistral...' });

    // Step 1: Upload PDF to Mistral Files API
    console.log('Uploading PDF to Mistral Files API...');
    const arrayBuffer = await fileData.arrayBuffer();
    const pdfBlob = new Blob([arrayBuffer], { type: 'application/pdf' });
    
    const formData = new FormData();
    formData.append('file', pdfBlob, deckFile.file_name);
    formData.append('purpose', 'ocr');

    const uploadResponse = await fetch('https://api.mistral.ai/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mistralApiKey}`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Mistral upload error:', uploadResponse.status, errorText);
      throw new Error('Failed to upload PDF to Mistral');
    }

    const uploadData = await uploadResponse.json();
    const mistralFileId = uploadData.id;
    console.log('PDF uploaded to Mistral, file ID:', mistralFileId);

    // Step 2: Get signed URL from Mistral
    console.log('Getting signed URL from Mistral...');
    const signedUrlResponse = await fetch(`https://api.mistral.ai/v1/files/${mistralFileId}/url`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${mistralApiKey}`,
      },
    });

    if (!signedUrlResponse.ok) {
      const errorText = await signedUrlResponse.text();
      console.error('Mistral signed URL error:', signedUrlResponse.status, errorText);
      throw new Error('Failed to get signed URL from Mistral');
    }

    const signedUrlData = await signedUrlResponse.json();
    const mistralSignedUrl = signedUrlData.url;
    console.log('Got signed URL from Mistral');

    // Step 3: Process OCR with Mistral dedicated OCR API
    console.log('Processing OCR with Mistral...');
    const ocrResponse = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-ocr-latest',
        document: {
          type: 'document_url',
          document_url: mistralSignedUrl,
        },
      }),
    });

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      console.error('Mistral OCR error:', ocrResponse.status, errorText);
      throw new Error('Mistral OCR processing failed');
    }

    const ocrData = await ocrResponse.json();
    console.log('OCR response structure:', JSON.stringify(ocrData, null, 2));

    // Step 4: Extract text from pages array
    let extractedMarkdown = '';

    if (ocrData.pages && Array.isArray(ocrData.pages)) {
      extractedMarkdown = ocrData.pages
        .map((page: any) => page.markdown || '')
        .join('\n\n');
    } else if (ocrData.content) {
      extractedMarkdown = ocrData.content;
    } else if (ocrData.text) {
      extractedMarkdown = ocrData.text;
    }

    console.log('OCR completed, extracted', extractedMarkdown.length, 'characters');
    console.log('First 500 characters:', extractedMarkdown.substring(0, 500));
    
    if (!extractedMarkdown || extractedMarkdown.trim().length === 0) {
      throw new Error('No content extracted from PDF');
    }

    // Step 5 (optional): Cleanup uploaded file from Mistral
    try {
      await fetch(`https://api.mistral.ai/v1/files/${mistralFileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mistralApiKey}`,
        },
      });
      console.log('Cleaned up Mistral uploaded file');
    } catch (cleanupError) {
      console.error('Failed to cleanup Mistral file (non-critical):', cleanupError);
    }

    sendEvent('status', { message: 'Analyse en cours par Claude Haiku...' });

    // ============= FIRST AI CALL: GENERATE MEMO ONLY =============
    const systemPrompt = `You are an expert investment analyst. Your task is to create a comprehensive, well-structured investment memo in French based on the pitch deck content provided.

CRITICAL FORMATTING RULES:
- Use clear visual hierarchy with headings (##) for EACH major section
- Add spacing between sections with blank lines
- Start each section with a ## heading
- Use bullet points (- or *) for lists
- Use **bold** for key metrics and important points
- Add a horizontal rule (---) between major parts if needed

REQUIRED STRUCTURE (use these exact section titles with ## headings):

## 1. Résumé Exécutif
Brief overview of the investment opportunity (2-3 paragraphs)

## 2. Problème & Solution  
- Problem being solved
- Proposed solution
- Unique value proposition

## 3. Marché & Opportunité
- Market size and growth
- Target segments
- Market positioning

## 4. Modèle d'Affaires
- Revenue streams
- Pricing strategy
- Unit economics

## 5. Traction & KPIs
- Key metrics and growth
- Customer acquisition
- Revenue milestones

## 6. Équipe
- Founders and key team members
- Relevant experience
- Advisory board if applicable

## 7. Concurrence & Différenciation
- Competitive landscape
- Competitive advantages
- Barriers to entry

## 8. Levée de Fonds
- Amount being raised
- Use of funds
- Valuation details

## 9. Risques Identifiés
- Market risks
- Execution risks
- Competitive risks

## 10. Recommandation d'Investissement
Final assessment and recommendation

IMPORTANT: 
- Minimum 1000 words total
- Use markdown formatting extensively
- Make it visually scannable with clear sections
- Each section should have 2-4 paragraphs minimum
- Use concrete data from the deck

CRITICAL: Generate the COMPLETE memo in one go. Write the full analysis without interruption.`;

    const prompt = `Voici le contenu du pitch deck à analyser:\n\n${extractedMarkdown}\n\nCrée un mémo d'investissement complet et détaillé en français.`;

    // Call Claude Haiku API - NO TOOLS, just generate the memo
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8000,
        stream: true,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      throw new Error('Claude API error');
    }

    // Stream the response - simplified parsing (no tools)
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    if (!reader) throw new Error('No response body');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || line.startsWith(':')) continue;
        if (!line.startsWith('data: ')) continue;

        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          
          // Simple text streaming only
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            const text = parsed.delta.text;
            fullText += text;
            sendEvent('delta', { text });
          }
        } catch (e) {
          console.error('Failed to parse SSE line:', e, line);
        }
      }
    }

    console.log('✅ Memo generation completed. Full text length:', fullText.length);
    console.log('First 300 chars:', fullText.substring(0, 300));
    console.log('Last 300 chars:', fullText.substring(fullText.length - 300));

    // Save the complete memo
    await supabaseClient
      .from('analyses')
      .update({
        status: 'completed',
        result: { full_text: fullText },
        completed_at: new Date().toISOString(),
        progress_percent: 80
      })
      .eq('id', analysisId);

    console.log('✅ Memo saved to database');
    sendEvent('status', { message: 'Mémo généré, extraction des données...' });

    // ============= SECOND AI CALL: EXTRACT STRUCTURED DATA =============
    console.log('Starting structured data extraction...');

    const extractionPrompt = `Analyze this pitch deck content and extract key data points.
Return ONLY valid JSON with these exact fields (use null if not found):

{
  "company_name": "Legal company name",
  "sector": "Main industry sector",
  "solution_summary": "One sentence describing the solution (max 200 chars)",
  "amount_raised_cents": integer in cents (or null),
  "pre_money_valuation_cents": integer in cents (or null)
}

IMPORTANT: 
- Return ONLY the JSON object, no additional text
- Convert all amounts to cents (multiply by 100)
- If a value is not found, use null`;

    const extractionResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        temperature: 0,
        messages: [
          { 
            role: 'user', 
            content: `${extractionPrompt}\n\nPitch deck content:\n\n${extractedMarkdown}` 
          }
        ],
      }),
    });

    if (!extractionResponse.ok) {
      console.error('Extraction API call failed:', await extractionResponse.text());
      throw new Error('Failed to extract structured data');
    }

    const extractionData = await extractionResponse.json();
    const extractedJson = extractionData.content[0].text;

    console.log('Raw extraction response:', extractedJson);

    // Parse extracted data
    let parsedData: any = null;
    try {
      parsedData = JSON.parse(extractedJson);
      console.log('✅ Parsed structured data:', JSON.stringify(parsedData, null, 2));
    } catch (e) {
      console.error('❌ Failed to parse extraction JSON:', e);
      console.error('Raw text:', extractedJson);
    }

    // Update deal with extracted data
    if (parsedData) {
      const dealUpdate: any = {};
      
      if (parsedData.company_name) dealUpdate.company_name = parsedData.company_name;
      if (parsedData.sector) dealUpdate.sector = parsedData.sector;
      if (parsedData.solution_summary) dealUpdate.solution_summary = parsedData.solution_summary;
      if (parsedData.amount_raised_cents) dealUpdate.amount_raised_cents = parsedData.amount_raised_cents;
      if (parsedData.pre_money_valuation_cents) dealUpdate.pre_money_valuation_cents = parsedData.pre_money_valuation_cents;

      console.log('Updating deal with:', dealUpdate);

      if (Object.keys(dealUpdate).length > 0) {
        const { error: updateError } = await supabaseClient
          .from('deals')
          .update(dealUpdate)
          .eq('id', dealId);

        if (updateError) {
          console.error('❌ Failed to update deal:', updateError);
        } else {
          console.log('✅ Deal updated successfully with', Object.keys(dealUpdate).length, 'fields');
        }
      }
    } else {
      console.warn('⚠️ No structured data extracted, deal not updated');
    }

    // Final status update
    await supabaseClient
      .from('analyses')
      .update({
        progress_percent: 100
      })
      .eq('id', analysisId);

    sendEvent('status', { message: 'Analyse terminée !' });
    console.log('✅ Complete analysis pipeline finished');

    sendEvent('done', { message: 'Analyse terminée' });
  } catch (error) {
    console.error('Error in streamAnalysis:', error);
    
    if (analysisId) {
      await supabaseClient
        .from('analyses')
        .update({ 
          status: 'failed', 
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString()
        })
        .eq('id', analysisId);
    }
    
    throw error;
  }
}
