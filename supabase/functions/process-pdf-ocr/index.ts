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

    // 3. Upload to Mistral for OCR
    const mistralApiKey = Deno.env.get('MISTRAL_API_KEY');
    if (!mistralApiKey) {
      throw new Error('MISTRAL_API_KEY not configured');
    }

    console.log('⬆️ Uploading to Mistral for OCR...');
    console.log('File details:', {
      name: deckFile.file_name,
      size: fileData.size,
      type: fileData.type
    });

    const formData = new FormData();
    formData.append('file', fileData, deckFile.file_name);
    formData.append('purpose', 'batch');

    const uploadResponse = await fetch('https://api.mistral.ai/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mistralApiKey}`,
      },
      body: formData,
    });

    console.log('Mistral upload response status:', uploadResponse.status);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Mistral upload error:', errorText);
      console.error('Response status:', uploadResponse.status);
      console.error('Response headers:', Object.fromEntries(uploadResponse.headers.entries()));
      throw new Error(`Mistral upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();
    const fileId = uploadResult.id;
    console.log('✅ File uploaded to Mistral, file ID:', fileId);
    console.log('Upload result details:', uploadResult);

    // 4. Process with Mistral OCR
    console.log('🔄 Processing OCR with Mistral...');

    const ocrResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mistralApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'pixtral-12b-2409',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all text content from this pitch deck in markdown format. Preserve structure, titles, and key information.'
              },
              {
                type: 'file_url',
                file_url: fileId
              }
            ]
          }
        ]
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
      hasChoices: !!ocrResult.choices,
      choicesLength: ocrResult.choices?.length,
      hasMessage: !!ocrResult.choices?.[0]?.message,
      hasContent: !!ocrResult.choices?.[0]?.message?.content
    });
    
    const markdownText = ocrResult.choices[0]?.message?.content || '';
    
    console.log('✅ OCR completed, extracted', markdownText.length, 'characters');
    console.log('First 500 characters:', markdownText.substring(0, 500));

    // 5. Cleanup: Delete file from Mistral
    try {
      const deleteResponse = await fetch(`https://api.mistral.ai/v1/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mistralApiKey}`,
        },
      });
      console.log('🧹 Cleaned up Mistral file, status:', deleteResponse.status);
    } catch (cleanupError) {
      console.warn('Failed to cleanup Mistral file:', cleanupError);
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
