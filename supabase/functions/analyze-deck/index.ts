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
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting analysis for deal:', dealId);

    // Update deal status to analyzing
    await supabaseClient
      .from('deals')
      .update({ 
        status: 'analyzing',
        analysis_started_at: new Date().toISOString()
      })
      .eq('id', dealId);

    // Create analysis record
    const { data: analysis, error: analysisError } = await supabaseClient
      .from('analyses')
      .insert({
        deal_id: dealId,
        status: 'extracting',
        current_step: 'Extracting text from deck...',
        progress_percent: 10,
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (analysisError) throw analysisError;

    // Simulate 10-minute analysis process (mock for now)
    // In production, this would call MCP/Composio and AI services
    
    // Step 1: Extracting (2 min)
    await updateProgress(supabaseClient, analysis.id, 'extracting', 'Analyzing market fit...', 30);
    
    // Step 2: Analyzing (5 min)
    await updateProgress(supabaseClient, analysis.id, 'analyzing', 'Comparing valuations...', 50);
    await updateProgress(supabaseClient, analysis.id, 'analyzing', 'Generating insights...', 70);
    
    // Step 3: Finalizing (3 min)
    await updateProgress(supabaseClient, analysis.id, 'finalizing', 'Finalizing report...', 90);

    // Generate mock analysis results
    const mockResults = generateMockAnalysis();

    // Complete analysis
    await supabaseClient
      .from('analyses')
      .update({
        status: 'completed',
        result: mockResults,
        progress_percent: 100,
        completed_at: new Date().toISOString(),
        duration_seconds: 600
      })
      .eq('id', analysis.id);

    // Update deal with analysis results
    await supabaseClient
      .from('deals')
      .update({
        status: 'completed',
        analysis_completed_at: new Date().toISOString(),
        maturity_level: mockResults.maturity_level,
        risk_score: mockResults.risk_score,
        valuation_gap_percent: mockResults.valuation_gap_percent
      })
      .eq('id', dealId);

    console.log('Analysis completed for deal:', dealId);

    return new Response(
      JSON.stringify({ success: true, dealId }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error: any) {
    console.error('Error in analyze-deck function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

async function updateProgress(
  supabase: any, 
  analysisId: string, 
  status: string, 
  step: string, 
  percent: number
) {
  await supabase
    .from('analyses')
    .update({
      status,
      current_step: step,
      progress_percent: percent
    })
    .eq('id', analysisId);
}

function generateMockAnalysis() {
  return {
    summary: "This is a promising early-stage FinTech startup with a clear value proposition targeting SMB banking. The team has relevant experience and the market opportunity is substantial. However, there are concerns about competition from established players and the go-to-market strategy needs more detail.",
    problem: "SMBs struggle with complex banking processes and lack of digital tools for financial management.",
    solution: "An all-in-one banking platform designed specifically for SMBs with integrated accounting, payments, and credit facilities.",
    strengths: [
      { text: "Strong founding team with 10+ years combined experience in banking tech", confidence: 0.9 },
      { text: "Clear product-market fit validated by 500+ beta users", confidence: 0.85 },
      { text: "Recurring revenue model with strong unit economics", confidence: 0.8 },
      { text: "Strategic partnerships with accounting software providers", confidence: 0.75 }
    ],
    weaknesses: [
      { text: "Limited traction compared to competitors in the space", confidence: 0.8 },
      { text: "Customer acquisition costs are relatively high at current scale", confidence: 0.75 },
      { text: "Regulatory compliance complexity not fully addressed", confidence: 0.7 }
    ],
    red_flags: [
      { text: "Burn rate is high relative to runway (6 months)", severity: "High" },
      { text: "No technical co-founder on the team", severity: "Medium" },
      { text: "Market highly competitive with well-funded incumbents", severity: "Medium" }
    ],
    opportunities: [
      "Expand to European markets where competition is less intense",
      "Develop API partnerships with major accounting platforms",
      "Add credit/lending features to increase revenue per customer"
    ],
    market_size_tam: "€45B",
    sector_median_valuation_multiple: 8.5,
    maturity_level: "Early",
    risk_score: 3,
    valuation_gap_percent: 15.5
  };
}
