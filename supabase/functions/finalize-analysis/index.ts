/**
 * Analysis Finalization Edge Function
 * 
 * Updates deal record with extracted data and marks analysis as completed.
 * 
 * @param {string} dealId - UUID of the deal
 * @param {string} analysisId - UUID of the analysis record
 * @param {object} extractedData - Structured data from Claude
 * @returns {object} { success: boolean, fieldsUpdated: number }
 * 
 * Steps:
 * 1. Verify user authorization
 * 2. Update deals table with all extracted fields
 * 3. Set deal status to 'completed'
 * 4. Update analysis status to 'completed' and progress to 100%
 * 5. Set completed_at timestamp
 * 
 * Database updates:
 * - deals: company_name, sector, solution_summary, metrics, status='completed'
 * - analyses: status='completed', progress_percent=100, completed_at
 * 
 * Error handling:
 * - 401: Unauthorized
 * - 403: Forbidden (user doesn't own deal)
 * - 500: Database update error
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from '../_shared/cors.ts';
import { authenticateAndAuthorize } from '../_shared/auth.ts';
import { sanitizeExtractedData, prepareDataForUpdate } from '../_shared/data-validators.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dealId, analysisId, extractedData } = await req.json();

    if (!dealId || !analysisId || !extractedData) {
      throw new Error('dealId, analysisId, and extractedData are required');
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

    console.log('✅ Finalizing analysis for deal:', dealId);

    // Sanitize and prepare data for update
    const sanitized = sanitizeExtractedData(extractedData);
    const { update: sanitizedData, fieldCount } = prepareDataForUpdate(sanitized);

    // Add status fields
    sanitizedData.status = 'completed';
    sanitizedData.analysis_completed_at = new Date().toISOString();

    console.log('Sanitized data for DB:', sanitizedData);

    const { error: dealUpdateError } = await supabaseClient
      .from('deals')
      .update(sanitizedData)
      .eq('id', dealId);

    if (dealUpdateError) {
      console.error('Error updating deal:', dealUpdateError);
      throw dealUpdateError;
    }

    console.log(`✅ Deal updated successfully with ${fieldCount} fields`);

    // Update analysis status
    const { error: analysisUpdateError } = await supabaseClient
      .from('analyses')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress_percent: 100,
        current_step: 'Terminé'
      })
      .eq('id', analysisId);

    if (analysisUpdateError) {
      console.error('Error updating analysis:', analysisUpdateError);
      throw analysisUpdateError;
    }

    console.log('✅ Analysis marked as completed');

    return new Response(
      JSON.stringify({
        success: true,
        fieldsUpdated: fieldCount
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in finalize-analysis:', error);
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
