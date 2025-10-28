import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from 'https://esm.sh/resend@2.0.0';
import { corsHeaders } from '../_shared/cors.ts';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

interface AlertRequest {
  dealId: string;
  error: string;
  step?: string;
  timestamp: string;
  stackTrace?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { dealId, error, step, timestamp, stackTrace }: AlertRequest = await req.json();

    console.log('🚨 Sending admin alert for deal:', dealId);

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
            .info-row { margin: 15px 0; padding: 10px; background: white; border-radius: 4px; }
            .label { font-weight: bold; color: #6b7280; font-size: 12px; text-transform: uppercase; }
            .value { margin-top: 5px; font-size: 14px; }
            .error-box { background: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 15px 0; border-radius: 4px; }
            .stack-trace { background: #1f2937; color: #f3f4f6; padding: 15px; border-radius: 4px; overflow-x: auto; font-family: monospace; font-size: 12px; margin-top: 15px; }
            .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 24px;">🚨 Erreur d'analyse détectée</h1>
            </div>
            <div class="content">
              <div class="info-row">
                <div class="label">Deal ID</div>
                <div class="value"><code>${dealId}</code></div>
              </div>
              
              ${step ? `
              <div class="info-row">
                <div class="label">Étape échouée</div>
                <div class="value">${step}</div>
              </div>
              ` : ''}
              
              <div class="info-row">
                <div class="label">Timestamp</div>
                <div class="value">${new Date(timestamp).toLocaleString('fr-FR', { 
                  dateStyle: 'full', 
                  timeStyle: 'long',
                  timeZone: 'Europe/Paris'
                })}</div>
              </div>
              
              <div class="error-box">
                <div class="label">Message d'erreur</div>
                <div class="value" style="color: #dc2626; font-weight: 500;">${error}</div>
              </div>
              
              ${stackTrace ? `
              <div class="stack-trace">
                <div class="label" style="color: #9ca3af; margin-bottom: 10px;">Stack Trace</div>
                <pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word;">${stackTrace}</pre>
              </div>
              ` : ''}
              
              <div style="margin-top: 20px; padding: 15px; background: #dbeafe; border-radius: 4px;">
                <p style="margin: 0; font-size: 14px; color: #1e40af;">
                  <strong>Action recommandée :</strong> Vérifier les logs de l'edge function et l'état de la base de données pour ce deal.
                </p>
              </div>
            </div>
            <div class="footer">
              <p>Ce mail a été envoyé automatiquement par le système DealFlow</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'benjamin@alboteam.com';

    const { data, error: emailError } = await resend.emails.send({
      from: 'DealFlow Alerts <onboarding@resend.dev>',
      to: [adminEmail],
      subject: `🚨 Erreur analyse - Deal ${dealId.substring(0, 8)}...`,
      html: emailHtml,
    });

    if (emailError) {
      console.error('Failed to send alert email:', emailError);
      throw emailError;
    }

    console.log('✅ Admin alert sent successfully:', data?.id);

    return new Response(
      JSON.stringify({ success: true, emailId: data?.id }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in send-admin-alert:', error);
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
