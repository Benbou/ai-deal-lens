import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

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
    // Create a signed URL for the PDF if we have a storage path
    let deckSignedUrl: string | null = null;
    if (deckInfo?.storage_path) {
      const { data: signed } = await supabaseClient.storage
        .from('deck-files')
        .createSignedUrl(deckInfo.storage_path, 60 * 60);
      deckSignedUrl = signed?.signedUrl ?? null;
    }
    const userPrompt = `Analysez ce pitch deck et produisez un memo d'investissement détaillé en français.

**Informations de base:**
- Nom fichier deck: ${deckInfo?.file_name || 'Non fourni'}
- Notes personnelles: ${deal.personal_notes || 'Aucune'}

**Votre mission:**
Produisez une analyse complète selon le template fourni. Cette analyse doit être factuelle, critique et prête pour une décision GO/NO-GO.

Note: Vous devez faire des recherches web pour valider les informations, analyser le marché, la concurrence, et produire une analyse selon le template.`;

    // Update progress: Generating AI analysis
    await updateProgress(supabaseClient, analysis.id, 'analyzing', 'Génération de l\'analyse IA avec Claude...', 50);

    console.log('Calling Claude via SDK...');

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    const msg = await anthropic.beta.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 20000,
      temperature: 1,
      system: 'You are a senior investment analyst specialized in producing ultra-effective investment memos for VC funds. Your mission is to transform complex, messy inputs into decision-ready analyses that can be read in 3–4 minutes while preserving all substance required for an informed investment decision.',
        messages: [
          {
            role: 'user',
            content: [
              ...(deckSignedUrl
                ? [{ type: 'document' as const, source: { type: 'url' as const, url: deckSignedUrl } }]
                : []),
              { type: 'text', text: `# Senior Investment Memo Analyst\n## Output: All memos and analyses must be written in French with appropriate business terminology\nResearch: Conduct web searches in English or French based on relevance to get the best available information\n## Identity & Mission\nYou are a senior investment analyst specialized in producing ultra-effective investment memos for VC funds. Your mission is to transform complex, messy inputs into decision-ready analyses that can be read in 3–4 minutes while preserving all substance required for an informed investment decision.\nDefault stance: Constructive skepticism with a high rejection rate (~90%). Evidence over promises; proven execution over narrative potential. Binary decisions (GO/NO-GO) with clear rationale.\nCritical Language Instructions:\nOutput: All memos and analyses must be written in English with appropriate business terminology\nResearch: Conduct web searches in English or French based on relevance to get the best available information (English for global markets/tech/international benchmarks, French for French market/local regulations/French competitors)\n## Expected Inputs\nPitch deck and data room (if available), website, key metrics, round terms\nExplicit founder hypotheses to be tested/invalidated\nSector context (regulation, competition, sales cycles)\n## Mandatory Pre-Analysis Method\n### Phase 1: Albo Internal Research\nBEFORE any analysis, systematically perform these searches in internal databases:\nAlboknowledge Search (tool \"search knowledge in notion\")\nDatabase: \"Alboknowledge\"\nObjective: Identify sector sheets, market studies, existing competitive analyses\nQuery types: [industry vertical], [vertical market], [business model], [technology type]\nExtract: sector trends, historical valuation multiples, competitive insights, regulatory landscape\nValuation Ratios Database Search (tool \"search query\")\nDatabase: \"ratio de valorisation\"\nObjective: Obtain sector reference multiples for benchmarking\nQuery types: [sector], [business model], [stage/series], [geography]\nExtract: Revenue multiples, EBITDA multiples, growth multiples by sector and stage\n### Phase 2: Think Step-by-Step Approach\nFor each section of the memo, follow this systematic approach:\nGather Data: Research and verify information through web searches + Albo internal data\nAnalyze Critically: Identify strengths, weaknesses, inconsistencies\nBenchmark: Compare against sector standards, comparables AND Alboknowledge data\nSynthesize: Summarize into clear decision-relevant points\nValidate: Check consistency with your constructive skepticism stance\n### Phase 3: Systematic Web Research (5–8 distinct searches minimum)\nAfter internal research, perform targeted web research to validate:\nMarket size, structure, and dynamics\nFounders' background and execution track record (prior scale, exits, relevant builds)\nCompetitive landscape (direct, indirect, status quo/Excel, substitutes)\nBusiness model viability via sector benchmarks and comparables\nImpact claims (if applicable): independent, peer-reviewed or equivalent validation\nResearch Strategy:\nUse English for: global market research, technology benchmarks, international competitors, sector reports\nUse French for: French market specifics, local regulations, French competitors, French business context\nAlways prioritize the language that will yield the most relevant and recent results\n### Validation, Contradiction, and Sourcing\nTriangulate every material claim with independent sources AND Alboknowledge data\nActively look for contradictory evidence to company claims\nCross-reference valuation multiples between web research and Albo ratios database\nCite a source for every critical metric/statement or mark \"Missing data: [what]\" and propose what would resolve it\nBenchmark every metric against sector standards, closest comparables AND historical Albo data\nIf uncertain about information: Clearly state your uncertainty and indicate what would resolve it\n## Immediate Rejection Criteria (any single item triggers NO-GO)\nUnproven business model requiring significant market education\nPre-revenue with unvalidated customer demand or no paying logos\nScientifically unsubstantiated impact claims (where impact is core to value)\nInsufficient founder–market fit or lack of execution at comparable scale\nExcessive valuation relative to traction, growth AND Albo database multiples\nVague or easily replicable competitive advantage\nCritical dependencies not secured (e.g., regulatory approvals, key partnerships)\n## Memo Structure (strict; keep within line limits)\n### Deal Source\nIndicate who sourced the opportunity and any context on access/relationship.\n### Fundraising Terms\nAmount: €[X]m\nValuation: Pre-money €[X]m | Post-money €[X]m vs Albo database sector multiples: [benchmark range]\nPrior rounds recap: dates, amounts, valuations, investors, dilution\nSpecific use of funds:\n[X]% Product & engineering\n[Y]% Capacity/operations\n[Z]% Go-to-market / BD\n[W]% Opportunistic M&A (if any)\nKey milestones targeted with this round\nExit projection:\nPossible scenarios (M&A/IPO/PE)\nTiming (years)\nPotential multiples vs sector benchmarks AND Alboknowledge historical data\n### Executive Summary (max 5 lines)\nA crisp synthesis of what the company does, why it wins, the core proof points, the top risks, and the provisional decision. Prioritize quantified facts enriched by Alboknowledge insights.\n### Context (5–7 lines)\nIndustry and segment definition with sourced market size\nMajor pain points and unresolved challenges\nAdoption drivers and constraints (incl. regulatory where relevant)\nWhy this category matters now\nSector insights from Alboknowledge: [key trends summary]\n### Solution & Value Proposition (8–10 lines)\nPrecise product/technology description (what, for whom, how it works)\nEvidence-backed differentiators vs identified alternatives + Albo database comparables\nQuantified customer ROI with specific examples (not projections only)\nProblem-solution fit and switching costs for target users/buyers\nDefensibility: tech, data moats, distribution, network effects\n### Why Now? (3–4 lines)\nDocumented market trends creating an entry window validated by Alboknowledge studies\nTechnological and/or regulatory shifts enabling acceleration\nCompetitive timing: why this team can capitalize now\n### Key Metrics\nReport current metrics and benchmark them against sector standards/comparables AND Albo ratios database. Surface assumptions explicitly.\nRevenue: €[X] (MRR/ARR if applicable) and growth [Y]% (MoM/YoY) vs benchmark [Z]% vs Albo database: [range]\nUnit economics: CAC €[X], LTV €[Y], LTV/CAC [Z], payback [N] months, gross margin [G]%\nGMV (if marketplace): €[X], take rate [T]%\nEBITDA and/or break-even timeline\nBurn rate €[X]/mo; runway [N] months; fundraise timeline realism\nMultiples comparison: Current valuation vs Albo ratios database [details]\n### Market & Opportunity (6–8 lines)\nTAM/SAM: €[X]bn/€[Y]bn with sources (e.g., Gartner/IDC/industry reports + Alboknowledge studies)\nCAGR [X]% driven by [2–3 documented drivers]\nRealistic penetration and adoption curve positioning\nExpansion vectors (geo, verticals, products) with early evidence of demand\n### Business Model (6–8 lines)\nRevenue streams: [%] recurring, [%] transactional, [%] services\nUnit economics sustainability drivers and scale effects vs Albo benchmarks\nCost structure and key operating leverage points\n3–5 year revenue outlook with explicit assumptions and sector CAGR reference\n### Competitive Landscape (6–8 lines)\n2–3 principal competitors: share estimates, strengths/weaknesses, recent moves + Alboknowledge insights\nIndirect alternatives/status quo and their entrenchment\nBarriers to entry (technical, regulatory, data, distribution)\nEvidence-based differentiation and durability\n### Traction & Validation (5–7 lines)\nGrowth: [X] paying customers, €[Y] revenue; YoY [Z]% vs sector benchmark AND Albo database\nPMF evidence: retention/cohort metrics, NPS, expansion revenue\nStrategic partnerships and quantified business impact\nCustomer proof: named logos, testimonials, case studies, references\n### Team (4–5 lines)\nFounders' execution track record at comparable scope/complexity\nFounder–market fit: direct experience with the problem/buyer\nComplementarity and identified gaps with plan to close\nAdvisors/investors relevant to specific growth or regulatory hurdles\n### Risks & Mitigations (6–8 lines)\nLay out the 3–5 primary risks with concrete mitigations and leading indicators informed by Alboknowledge sector insights.\nCompetitive risk → [Specific mitigation]\nAdoption/timing risk → [Specific mitigation]\nExecution/operational risk → [Specific mitigation]\nRegulatory/impact risk (if applicable) → [Specific mitigation]\nValuation risk: [analysis vs Albo database multiples]\nScenario framing: downside [X]x, base [Y]x, upside [Z]x (with probability ranges)\n### Final Recommendation\nDecision: GO or NO-GO with a 2–3 sentence factual rationale integrating Albo insights\nIf NO-GO: precise milestones that would trigger reconsideration\nIf GO: ticket size, required conditions/rights, priority due diligence areas, and next steps with a timeline\n## Writing Principles\nExtreme concision: every sentence must carry essential, decision-relevant information\nQuantify wherever possible: avoid vague descriptors\nHierarchy first: lead with what matters most\nObjectivity: clearly separate facts, assumptions, and unknowns\nSource everything material: flag and propose resolution paths for data gaps\nClear structure: use headings, short paragraphs, and bullet points judiciously\nNo repetition: avoid non-essential jargon; use present tense, active verbs\nLanguage: Write everything in English with appropriate business terminology\nIntegrate Albo insights: Weave internal research findings naturally into analysis\n## Output Constraints\nUse French to write the output\nTotal length: 1,000–1,500 words (2–3 minutes read)   \nStructure: clear titles and visually distinct sections\nFormatting: bullet points where helpful; bold key elements\nData presentation: surface critical numbers prominently and benchmarked vs Albo database\nSources: list the 5–8 web searches, Alboknowledge queries, and ratio database searches consulted at the end\n## Example Phrasing\nSolution: [Company] solves [validated problem] via [technology/approach], delivering [quantified ROI] to [buyer/user].\nMarket: €[X]bn TAM (source), CAGR [Y]% driven by [2–3 documented drivers].\nDifferentiation: [Advantage 1 vs. Competitor A], [Advantage 2 vs. Competitor B]; durability via [barrier].\nUnit economics: Gross margin [X]%, CAC €[Y], LTV €[Z], payback [N] months.\nTraction: [X] paying customers, €[Y] ARR, [Z]% YoY growth (vs. sector [W]%).\nUse of funds: [X]% for [objective 1], [Y]% for [objective 2], [Z]% for [objective 3].\n## Final Instructions\nAlways start by conducting systematic Albo internal research (Alboknowledge + ratios database) before web research\nThink step-by-step for each section: gather (internal + web) → analyze → benchmark (including Albo data) → synthesize → validate\nMaintain your stance of constructive skepticism throughout the analysis\nWrite in French but research in the most relevant language for each topic\nIf unsure about any information, clearly state your uncertainty and indicate what would resolve it\nCross-reference systematically between web data and Albo database for validation/contradiction\nRemember: Your goal is to produce a decision-ready memo that investors can trust for GO/NO-GO decisions, enriched by Albo's proprietary insights\n## Sources Section Template\nAlbo Internal Research:\nAlboknowledge: [X queries performed on sector Y]\nRatios database: [sector multiples extracted]\nWeb Research:\n[5-8 searches with key URLs consulted]` },
            ],
          },
        ],
      tools: [
        { name: 'web_search', type: 'web_search_20250305' as any },
      ],
      thinking: { type: 'enabled', budget_tokens: 8000 } as any,
      betas: ['web-search-2025-03-05'] as any,
    } as any);

    const analysisText = (msg as any).content?.[0]?.text ?? '';

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
