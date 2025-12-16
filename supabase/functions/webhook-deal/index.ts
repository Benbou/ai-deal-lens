import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebhookPayload {
  sender_email: string;
  company_name: string;
  memo_html: string;
  deck_base64?: string;
  deck_filename?: string;
  sent_at?: string;
  status?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const data: WebhookPayload = await req.json();
    console.log('Webhook received for email:', data.sender_email);

    const {
      sender_email,
      company_name,
      memo_html,
      deck_base64,
      deck_filename,
      sent_at,
      status = 'completed'
    } = data;

    // 1. Chercher l'utilisateur par email
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', sender_email.toLowerCase())
      .single();

    console.log('Profile lookup result:', profile ? 'Found' : 'Not found', profileError?.message);

    // 2. Si l'utilisateur n'existe pas, ignorer et retourner succès
    if (!profile) {
      console.log('Email not recognized, skipping storage');
      return new Response(
        JSON.stringify({
          success: true,
          stored: false,
          message: 'Email non reconnu - analyse non stockée'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = profile.id;
    let storagePath: string | null = null;

    // 3. Uploader le PDF dans Supabase Storage si présent
    if (deck_base64 && deck_filename) {
      try {
        // Decode base64 to Uint8Array
        const binaryString = atob(deck_base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        storagePath = `${userId}/${Date.now()}_${deck_filename}`;
        console.log('Uploading file to:', storagePath);

        const { error: uploadError } = await supabase.storage
          .from('deck-files')
          .upload(storagePath, bytes, {
            contentType: 'application/pdf',
            upsert: false
          });

        if (uploadError) {
          console.error('Upload error:', uploadError.message);
          storagePath = null;
        } else {
          console.log('File uploaded successfully');
        }
      } catch (uploadErr) {
        console.error('Failed to process/upload file:', uploadErr);
        storagePath = null;
      }
    }

    // 4. Créer le deal lié à l'utilisateur
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .insert({
        user_id: userId,
        company_name: company_name,
        startup_name: company_name,
        memo_html: memo_html,
        status: status,
        sector: 'To be determined',
        stage: 'To be determined',
        country: 'To be determined',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (dealError) {
      console.error('Deal creation error:', dealError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to create deal', details: dealError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Deal created:', deal.id);

    // 5. Créer l'entrée deck_files si on a uploadé un fichier
    if (storagePath && deck_filename) {
      const { error: deckFileError } = await supabase
        .from('deck_files')
        .insert({
          deal_id: deal.id,
          file_name: deck_filename,
          storage_path: storagePath,
          mime_type: 'application/pdf'
        });

      if (deckFileError) {
        console.error('Deck file record error:', deckFileError.message);
      } else {
        console.log('Deck file record created');
      }
    }

    // 6. Retourner succès
    return new Response(
      JSON.stringify({
        success: true,
        stored: true,
        deal_id: deal.id,
        message: 'Deal stocké avec succès'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
