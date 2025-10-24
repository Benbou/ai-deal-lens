import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { corsHeaders } from '../_shared/cors.ts';

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
const TWILIO_WHATSAPP_NUMBER = Deno.env.get('TWILIO_WHATSAPP_NUMBER');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface TwilioWebhookPayload {
  From: string; // whatsapp:+33612345678
  Body?: string;
  NumMedia: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse Twilio webhook (form-urlencoded)
    const formData = await req.formData();
    const payload: TwilioWebhookPayload = {
      From: formData.get('From') as string,
      Body: formData.get('Body') as string || undefined,
      NumMedia: formData.get('NumMedia') as string,
      MediaUrl0: formData.get('MediaUrl0') as string || undefined,
      MediaContentType0: formData.get('MediaContentType0') as string || undefined,
    };

    console.log('Received WhatsApp webhook:', payload);

    // Extract phone number (remove whatsapp: prefix)
    const phone = payload.From.replace('whatsapp:', '');

    // Check if media is PDF
    const numMedia = parseInt(payload.NumMedia || '0');
    if (numMedia === 0 || !payload.MediaUrl0) {
      await sendWhatsAppMessage(phone, 
        '❌ Veuillez envoyer un fichier PDF pour démarrer l\'analyse.\n\n' +
        'Format accepté : PDF (max 50 MB)'
      );
      return new Response('No media found', { status: 200, headers: corsHeaders });
    }

    if (payload.MediaContentType0 !== 'application/pdf') {
      await sendWhatsAppMessage(phone, 
        '❌ Seuls les fichiers PDF sont acceptés.\n\n' +
        `Fichier reçu : ${payload.MediaContentType0}`
      );
      return new Response('Invalid file type', { status: 200, headers: corsHeaders });
    }

    // Find user by phone
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, name')
      .eq('phone', phone)
      .maybeSingle();

    let userId: string | null = null;
    let dealId: string;

    if (profile) {
      userId = profile.id;
      console.log(`User found: ${profile.email}`);
    } else {
      console.log(`No user found for phone: ${phone}`);
    }

    // Download PDF from Twilio
    console.log('Downloading PDF from Twilio...');
    const pdfResponse = await fetch(payload.MediaUrl0, {
      headers: {
        'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
      }
    });

    if (!pdfResponse.ok) {
      throw new Error('Failed to download PDF from Twilio');
    }

    const pdfBlob = await pdfResponse.blob();
    const pdfSize = pdfBlob.size;

    // Check file size (50 MB limit)
    if (pdfSize > 50 * 1024 * 1024) {
      await sendWhatsAppMessage(phone, 
        '❌ Le fichier est trop volumineux.\n\n' +
        `Taille maximum : 50 MB\n` +
        `Taille du fichier : ${(pdfSize / 1024 / 1024).toFixed(2)} MB`
      );
      return new Response('File too large', { status: 200, headers: corsHeaders });
    }

    // Generate filename
    const timestamp = Date.now();
    const fileName = userId 
      ? `${userId}/${timestamp}_whatsapp.pdf`
      : `temp/${phone.replace('+', '')}/${timestamp}_whatsapp.pdf`;

    // Upload to Supabase Storage
    console.log('Uploading to Supabase Storage...');
    const { error: uploadError } = await supabase.storage
      .from('deck-files')
      .upload(fileName, pdfBlob, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error('Failed to upload PDF to storage');
    }

    // Create deal
    const additionalContext = payload.Body || 'Uploaded via WhatsApp';
    
    const dealData = {
      user_id: userId,
      temp_phone: userId ? null : phone,
      startup_name: `WhatsApp Upload ${timestamp}`,
      sector: 'To be determined',
      stage: 'To be determined',
      country: 'To be determined',
      personal_notes: additionalContext,
      status: 'pending',
    };

    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .insert(dealData)
      .select()
      .single();

    if (dealError) {
      console.error('Deal creation error:', dealError);
      throw new Error('Failed to create deal');
    }

    dealId = deal.id;
    console.log(`Deal created: ${dealId}`);

    // Create deck_files record
    const { error: deckFileError } = await supabase
      .from('deck_files')
      .insert({
        deal_id: dealId,
        file_name: `whatsapp_${timestamp}.pdf`,
        storage_path: fileName,
        file_size_bytes: pdfSize,
        mime_type: 'application/pdf',
      });

    if (deckFileError) {
      console.error('Deck file error:', deckFileError);
      throw new Error('Failed to create deck_files record');
    }

    // Send response message
    if (userId) {
      // User exists - send success message
      await sendWhatsAppMessage(phone, 
        `✅ Votre deck a été reçu !\n\n` +
        `📊 Analyse en cours...\n\n` +
        `Vous recevrez une notification dès que le mémo sera prêt.`
      );
    } else {
      // User doesn't exist - send auth link
      const token = await generateClaimToken(dealId, phone);
      const claimUrl = `${Deno.env.get('SITE_URL') || 'https://your-app.com'}/claim-deal?token=${token}`;
      
      await sendWhatsAppMessage(phone, 
        `👋 Merci pour votre deck !\n\n` +
        `Pour finaliser l'analyse, créez votre compte :\n` +
        `${claimUrl}\n\n` +
        `Une fois connecté, vous pourrez suivre l'analyse en temps réel.`
      );
    }

    return new Response(
      JSON.stringify({ success: true, dealId }), 
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in whatsapp-webhook:', error);
    return new Response(
      JSON.stringify({ error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function sendWhatsAppMessage(to: string, message: string) {
  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: TWILIO_WHATSAPP_NUMBER!,
          To: `whatsapp:${to}`,
          Body: message,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Twilio API error:', error);
    }
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
  }
}

async function generateClaimToken(dealId: string, phone: string): Promise<string> {
  // Simple JWT-like token (base64 encoded payload)
  // In production, use proper JWT with signature
  const payload = {
    dealId,
    phone,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  };
  
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  
  return `${header}.${body}.`;
}
