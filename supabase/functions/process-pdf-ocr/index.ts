/**
 * OCR Processing Edge Function
 * 
 * Extracts text from PDF pitch decks using Mistral OCR API.
 * 
 * @param {string} dealId - UUID of the deal to process
 * @returns {object} { success: boolean, markdownText: string, characterCount: number }
 * 
 * Steps:
 * 1. Verify user authorization (JWT + deal ownership)
 * 2. Retrieve deck file from Supabase Storage
 * 3. Create signed URL (valid 1 hour)
 * 4. Send to Mistral OCR API (mistral-ocr-latest model)
 * 5. Parse markdown response from all pages
 * 6. Return combined markdown text
 * 
 * Error handling:
 * - 401: Unauthorized (no auth token)
 * - 403: Forbidden (user doesn't own deal)
 * - 404: Deck file not found
 * - 500: Mistral OCR API error
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from '../_shared/cors.ts';
import { authenticateAndAuthorize } from '../_shared/auth.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dealId } = await req.json();

    if (!dealId) {
      throw new Error('dealId is required');
    }

    // Authenticate and authorize
    const authHeader = req.headers.get('Authorization');
    const authResult = await authenticateAndAuthorize(authHeader, dealId);

    if (!authResult.success) {
      return new Response(
        JSON.stringify({ success: false, error: authResult.error.error }),
        { status: authResult.error.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { supabaseClient } = authResult.data;

    console.log('🔍 Starting OCR processing for deal:', dealId);

    // 1. Get deck file path
    const { data: deckFile, error: deckError } = await supabaseClient
      .from('deck_files')
      .select('storage_path, file_name')
      .eq('deal_id', dealId)
      .single();

    if (deckError || !deckFile) {
      throw new Error('Deck file not found');
    }

    console.log('📄 Found deck file:', deckFile.file_name);

    // 2. Create a signed URL for the deck file (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } = await supabaseClient
      .storage
      .from('deck-files')
      .createSignedUrl(deckFile.storage_path, 3600); // 3600 seconds = 1 hour

    if (signedUrlError || !signedUrlData) {
      throw new Error('Failed to create signed URL');
    }

    console.log('✅ Signed URL created successfully');

    // 3. Process with Mistral OCR API using the signed URL
    const mistralApiKey = Deno.env.get('MISTRAL_API_KEY');
    if (!mistralApiKey) {
      throw new Error('MISTRAL_API_KEY not configured');
    }
    console.log('🔄 Processing OCR with Mistral OCR API...');

    const ocrResponse = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mistralApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-ocr-latest',
        document: {
          type: 'document_url',
          document_url: signedUrlData.signedUrl
        },
        include_image_base64: false
      }),
    });

    console.log('OCR response status:', ocrResponse.status);

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      console.error('Mistral OCR error:', errorText);
      console.error('OCR response status:', ocrResponse.status);
      throw new Error(`Mistral OCR failed: ${ocrResponse.status} - ${errorText}`);
    }

    const ocrResult = await ocrResponse.json();
    console.log('OCR result structure:', {
      hasPages: !!ocrResult.pages,
      pageCount: ocrResult.pages?.length
    });
    
    // Combine markdown from all pages
    const markdownText = ocrResult.pages
      ?.map((page: any) => page.markdown || '')
      .join('\n\n---\n\n') || '';
    
    console.log('✅ OCR completed, extracted', markdownText.length, 'characters from', ocrResult.pages?.length, 'pages');
    console.log('First 500 characters:', markdownText.substring(0, 500));

    // Sauvegarder le markdown OCR dans la base de données
    const { error: updateError } = await supabaseClient
      .from('deck_files')
      .update({ ocr_markdown: markdownText })
      .eq('deal_id', dealId);

    if (updateError) {
      console.error('⚠️ [OCR] Failed to save markdown to database:', updateError);
      // On continue quand même, l'OCR a réussi
    } else {
      console.log('✅ [OCR] Markdown saved to database');
    }

    return new Response(
      JSON.stringify({
        success: true,
        markdownText,
        characterCount: markdownText.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in process-pdf-ocr:', error);
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
