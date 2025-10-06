import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Load analysis prompt template
const ANALYSIS_PROMPT = `# Senior Investment Memo Analyst
## Output: All memos and analyses must be written in French with appropriate business terminology

You are a senior investment analyst specialized in producing ultra-effective investment memos for VC funds. Your mission is to transform complex, messy inputs into decision-ready analyses that can be read in 3–4 minutes while preserving all substance required for an informed investment decision.

Default stance: Constructive skepticism with a high rejection rate (~90%). Evidence over promises; proven execution over narrative potential. Binary decisions (GO/NO-GO) with clear rationale.

Analyze the provided pitch deck and additional information to produce a comprehensive investment memo in French following this structure:

## Structure du Mémo

### Source du Deal
[Indiquer qui a sourcé l'opportunité]

### Termes de la Levée
- Montant: €[X]m
- Valorisation: Pré-money €[X]m | Post-money €[X]m
- Utilisation des fonds détaillée

### Résumé Exécutif (max 5 lignes)
Synthèse de ce que fait l'entreprise, pourquoi elle gagne, points de preuve clés, risques principaux, et décision provisoire.

### Contexte (5-7 lignes)
- Définition de l'industrie et du segment avec taille de marché sourcée
- Points de douleur majeurs et défis non résolus
- Drivers et contraintes d'adoption
- Pourquoi cette catégorie compte maintenant

### Solution & Proposition de Valeur (8-10 lignes)
- Description précise du produit/technologie
- Différenciateurs fondés sur des preuves vs alternatives
- ROI client quantifié avec exemples spécifiques
- Fit problème-solution et coûts de changement
- Défensabilité: tech, moats de données, distribution, effets de réseau

### Pourquoi Maintenant? (3-4 lignes)
- Tendances de marché documentées créant une fenêtre d'entrée
- Shifts technologiques et/ou réglementaires permettant l'accélération
- Timing compétitif

### Métriques Clés
- Revenus, croissance, unit economics, burn rate, runway
- Benchmarks vs secteur

### Marché & Opportunité (6-8 lignes)
- TAM/SAM avec sources
- CAGR et drivers documentés
- Vecteurs d'expansion

### Business Model (6-8 lignes)
- Flux de revenus
- Structure de coûts
- Outlook 3-5 ans

### Paysage Concurrentiel (6-8 lignes)
- Principaux concurrents
- Alternatives indirectes/status quo
- Barrières à l'entrée
- Différenciation fondée sur des preuves

### Traction & Validation (5-7 lignes)
- Croissance clients/revenus
- Preuves de PMF
- Partenariats stratégiques
- Logos clients

### Équipe (4-5 lignes)
- Track record d'exécution des fondateurs
- Founder-market fit
- Complémentarité et gaps

### Risques & Mitigations (6-8 lignes)
- 3-5 risques principaux avec mitigations concrètes
- Scénarios downside/base/upside

### Recommandation Finale
Décision: GO ou NO-GO avec rationale factuel de 2-3 phrases

Total: 1,500-2,000 mots (3-4 minutes de lecture)`;

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

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured. Please add it in your secrets.');
    }

    console.log('Starting Claude analysis for deal:', dealId);

    // Get deal and deck file information
    const { data: deal, error: dealError } = await supabaseClient
      .from('deals')
      .select('*, deck_files(*)')
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      throw new Error('Deal not found');
    }

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
        current_step: 'Extraction des données du deck...',
        progress_percent: 10,
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (analysisError) throw analysisError;

    // Update progress: Analyzing market
    await updateProgress(supabaseClient, analysis.id, 'analyzing', 'Analyse du marché et du secteur...', 30);

    // Build the prompt with deal information
    const deckInfo = deal.deck_files?.[0];
    const userPrompt = `Analysez ce pitch deck et produisez un memo d'investissement détaillé en français.

**Informations de base:**
- Nom fichier deck: ${deckInfo?.file_name || 'Non fourni'}
- Notes personnelles: ${deal.personal_notes || 'Aucune'}

**Votre mission:**
Produisez une analyse complète selon le template fourni. Cette analyse doit être factuelle, critique et prête pour une décision GO/NO-GO.

Note: Vous devez faire des recherches web pour valider les informations, analyser le marché, la concurrence, et produire une analyse selon le template.`;

    // Update progress: Generating AI analysis
    await updateProgress(supabaseClient, analysis.id, 'analyzing', 'Génération de l\'analyse IA avec Claude...', 50);

    console.log('Calling Claude API...');

    // Call Claude API
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-20250514',
        max_tokens: 8000,
        messages: [
          {
            role: 'user',
            content: `${ANALYSIS_PROMPT}\n\n${userPrompt}`
          }
        ]
      })
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error('Claude API error:', errorText);
      throw new Error(`Claude API error: ${claudeResponse.status} - ${errorText}`);
    }

    const claudeData = await claudeResponse.json();
    const analysisText = claudeData.content[0].text;

    console.log('Claude analysis completed, text length:', analysisText.length);

    // Update progress: Extracting metrics
    await updateProgress(supabaseClient, analysis.id, 'finalizing', 'Extraction des métriques clés...', 80);

    // Parse analysis to extract structured data (simplified)
    const analysisResult = {
      full_text: analysisText,
      summary: analysisText.substring(0, 500) + '...',
      strengths: [],
      weaknesses: [],
      red_flags: [],
      opportunities: [],
      maturity_level: 'Growth',
      risk_score: 3,
      valuation_gap_percent: 0,
      recommendation: analysisText.toLowerCase().includes('no-go') ? 'NO-GO' : 'GO'
    };

    // Complete analysis
    await supabaseClient
      .from('analyses')
      .update({
        status: 'completed',
        result: analysisResult,
        progress_percent: 100,
        completed_at: new Date().toISOString(),
        duration_seconds: Math.floor((Date.now() - new Date(analysis.started_at).getTime()) / 1000)
      })
      .eq('id', analysis.id);

    // Update deal with analysis results
    await supabaseClient
      .from('deals')
      .update({
        status: 'completed',
        analysis_completed_at: new Date().toISOString(),
        maturity_level: analysisResult.maturity_level,
        risk_score: analysisResult.risk_score,
        valuation_gap_percent: analysisResult.valuation_gap_percent,
        // AI will extract these from the deck - for now keeping original values
        // In production, Claude would extract: startup_name, sector, stage, country, etc.
      })
      .eq('id', dealId);

    console.log('Analysis completed successfully for deal:', dealId);

    return new Response(
      JSON.stringify({ success: true, dealId }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error: any) {
    console.error('Error in analyze-deck function:', error);
    
    // Try to update deal status to failed
    try {
      const { dealId } = await req.json();
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      await supabaseClient
        .from('deals')
        .update({ status: 'failed' })
        .eq('id', dealId);
    } catch (updateError) {
      console.error('Failed to update deal status:', updateError);
    }
    
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
