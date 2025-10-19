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
    const { dealId, analysisId, extractedData } = await req.json();
    
    if (!dealId || !analysisId || !extractedData) {
      throw new Error('dealId, analysisId, and extractedData are required');
    }

    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    // Verify user owns the deal
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: deal, error: dealError } = await supabaseClient
      .from('deals')
      .select('user_id')
      .eq('id', dealId)
      .single();

    if (dealError || !deal || deal.user_id !== user.id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Finalizing analysis for deal:', dealId);

    // Create sanitized data object with strict type validation
    const sanitizedData: any = {
      status: 'completed',
      analysis_completed_at: new Date().toISOString()
    };
    let fieldCount = 0;

    // String fields
    if (extractedData.company_name && typeof extractedData.company_name === 'string') {
      sanitizedData.company_name = extractedData.company_name;
      fieldCount++;
    }
    if (extractedData.sector && typeof extractedData.sector === 'string') {
      sanitizedData.sector = extractedData.sector;
      fieldCount++;
    }
    if (extractedData.solution_summary && typeof extractedData.solution_summary === 'string') {
      sanitizedData.solution_summary = extractedData.solution_summary;
      fieldCount++;
    }

    // Numeric fields - strict type checking
    if (typeof extractedData.amount_raised_cents === 'number') {
      sanitizedData.amount_raised_cents = extractedData.amount_raised_cents;
      fieldCount++;
    }
    if (typeof extractedData.pre_money_valuation_cents === 'number') {
      sanitizedData.pre_money_valuation_cents = extractedData.pre_money_valuation_cents;
      fieldCount++;
    }
    if (typeof extractedData.current_arr_cents === 'number') {
      sanitizedData.current_arr_cents = extractedData.current_arr_cents;
      fieldCount++;
    }
    if (typeof extractedData.yoy_growth_percent === 'number') {
      sanitizedData.yoy_growth_percent = extractedData.yoy_growth_percent;
      fieldCount++;
    }
    if (typeof extractedData.mom_growth_percent === 'number') {
      sanitizedData.mom_growth_percent = extractedData.mom_growth_percent;
      fieldCount++;
    }

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
