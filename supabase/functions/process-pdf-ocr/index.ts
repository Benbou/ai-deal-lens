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
    const { dealId } = await req.json();
    
    if (!dealId) {
      throw new Error('dealId is required');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

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

    // 2. Download deck from storage
    const { data: fileData, error: downloadError } = await supabaseClient
      .storage
      .from('deck-files')
      .download(deckFile.storage_path);

    if (downloadError || !fileData) {
      throw new Error('Failed to download deck file');
    }

    console.log('✅ Downloaded deck file successfully');

    // 3. Convert PDF to base64 for Mistral OCR API
    const mistralApiKey = Deno.env.get('MISTRAL_API_KEY');
    if (!mistralApiKey) {
      throw new Error('MISTRAL_API_KEY not configured');
    }

    console.log('🔄 Converting PDF to base64...');
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const base64Pdf = btoa(String.fromCharCode(...uint8Array));
    
    console.log('📄 Base64 conversion complete, size:', base64Pdf.length);

    // 4. Process with Mistral OCR API
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
          document_url: `data:application/pdf;base64,${base64Pdf}`
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
