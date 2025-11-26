export interface ParsedMemoTerms {
  ticket?: string;
  preMoneyValuation?: string;
  useOfFunds?: string;
  milestones?: string[];
  exitScenarios?: string[];
}

export interface ParsedMemoExecutiveSummary {
  what?: string;
  whyItWins?: string;
  proofPoints?: string[];
  risks?: string[];
  decision?: 'GO' | 'NO-GO' | 'CONDITIONAL';
  decisionText?: string;
}

export interface ParsedMemoMetric {
  label: string;
  value: string;
  benchmark?: string;
}

export interface ParsedMemoProblemSolution {
  problem?: string;
  solution?: string;
  keyPillars?: string[];
  valueProposition?: string;
}

export interface ParsedMemoMarketAnalysis {
  tam?: string;
  sam?: string;
  som?: string;
  marketTrends?: string[];
  growthDrivers?: string[];
  marketDynamics?: string;
}

export interface ParsedMemoTeam {
  founders?: Array<{ name: string; role: string; background: string }>;
  keyHires?: string[];
  advisors?: string[];
  teamStrength?: string;
}

export interface ParsedMemoBusinessModel {
  revenueStreams?: string[];
  pricingModel?: string;
  customerAcquisition?: string;
  unitEconomics?: {
    cac?: string;
    ltv?: string;
    ltvCacRatio?: string;
  };
  scalability?: string;
}

export interface ParsedMemoCompetitive {
  competitors?: Array<{ name: string; positioning: string }>;
  competitiveAdvantages?: string[];
  moat?: string;
  differentiation?: string;
}

export interface ParsedMemoTraction {
  keyMetrics?: Array<{ metric: string; value: string; trend?: string }>;
  milestones?: string[];
  customerTestimonials?: string[];
  partnerships?: string[];
}

export interface ParsedMemoFinancials {
  revenue?: {
    current?: string;
    projected?: string;
    growth?: string;
  };
  profitability?: string;
  burnRate?: string;
  runway?: string;
  projections?: string[];
}

export interface ParsedMemoRiskAnalysis {
  executionRisks?: string[];
  marketRisks?: string[];
  competitiveRisks?: string[];
  financialRisks?: string[];
  mitigationStrategies?: string[];
}

export interface ParsedMemoSection {
  title: string;
  content: string;
  subsections?: Array<{ title: string; content: string }>;
}

export interface ParsedMemoRecommendation {
  decision?: 'GO' | 'NO-GO' | 'CONDITIONAL';
  rationale?: string;
  ticket?: string;
  conditions?: string[];
}

export interface ParsedMemo {
  title?: string;
  dealSource?: string;
  terms?: ParsedMemoTerms;
  executiveSummary?: ParsedMemoExecutiveSummary;
  metrics?: ParsedMemoMetric[];
  problemSolution?: ParsedMemoProblemSolution;
  marketAnalysis?: ParsedMemoMarketAnalysis;
  team?: ParsedMemoTeam;
  businessModel?: ParsedMemoBusinessModel;
  competitive?: ParsedMemoCompetitive;
  traction?: ParsedMemoTraction;
  financials?: ParsedMemoFinancials;
  riskAnalysis?: ParsedMemoRiskAnalysis;
  sections?: ParsedMemoSection[];
  recommendation?: ParsedMemoRecommendation;
  rawMarkdown: string;
}

export function parseMemoMarkdown(markdown: string): ParsedMemo {
  const parsed: ParsedMemo = {
    rawMarkdown: markdown,
    sections: []
  };

  // Extract title (first H1)
  const titleMatch = markdown.match(/^#\s+(.+?)$/m);
  if (titleMatch) {
    parsed.title = titleMatch[1].replace(/Mémo d'Investissement\s*:\s*/i, '').trim();
  }

  // Extract deal source
  const dealSourceMatch = markdown.match(/\*\*Source du deal\*\*\s*:\s*(.+?)(?:\n|$)/i);
  if (dealSourceMatch) {
    parsed.dealSource = dealSourceMatch[1].trim();
  }

  // Extract Terms section
  const termsMatch = markdown.match(/##\s+Terms\s+([\s\S]*?)(?=\n##|$)/i);
  if (termsMatch) {
    const termsContent = termsMatch[1];
    parsed.terms = {
      ticket: extractBulletPoint(termsContent, 'Ticket'),
      preMoneyValuation: extractBulletPoint(termsContent, 'Pré-money'),
      useOfFunds: extractBulletPoint(termsContent, 'Usage des fonds'),
      milestones: extractMultiBulletPoints(termsContent, 'Jalons clés'),
      exitScenarios: extractMultiBulletPoints(termsContent, 'Scénarios de sortie')
    };
  }

  // Extract Executive Summary
  const execSummaryMatch = markdown.match(/##\s+Synthèse exécutive\s+([\s\S]*?)(?=\n##|$)/i);
  if (execSummaryMatch) {
    const execContent = execSummaryMatch[1];
    
    // Extract decision from the summary
    let decision: 'GO' | 'NO-GO' | 'CONDITIONAL' | undefined;
    let decisionText: string | undefined;
    
    const decisionMatch = execContent.match(/\*\*Décision\*\*\s*:\s*\*\*(.+?)\*\*/i);
    if (decisionMatch) {
      decisionText = decisionMatch[1].trim();
      if (decisionText.includes('GO conditionnèle') || decisionText.includes('GO conditionnel')) {
        decision = 'CONDITIONAL';
      } else if (decisionText.includes('GO')) {
        decision = 'GO';
      } else if (decisionText.includes('NO-GO') || decisionText.includes('PASS')) {
        decision = 'NO-GO';
      }
    }

    parsed.executiveSummary = {
      what: extractBulletPoint(execContent, 'Quoi'),
      whyItWins: extractBulletPoint(execContent, 'Pourquoi ça gagne'),
      proofPoints: extractListItems(execContent, 'Preuves'),
      risks: extractListItems(execContent, 'Risques majeurs'),
      decision,
      decisionText
    };
  }

  // Extract metrics from "Métriques clés" table
  const metricsTableMatch = markdown.match(/\|\s*Métrique[\s\S]*?\n\|([\s\S]*?)(?=\n\n|$)/i);
  if (metricsTableMatch) {
    const tableRows = metricsTableMatch[1].split('\n').filter(row => row.includes('|') && !row.includes('---'));
    parsed.metrics = tableRows.map(row => {
      const cells = row.split('|').map(cell => cell.trim()).filter(Boolean);
      return {
        label: cells[0] || '',
        value: cells[2] || cells[1] || '',
        benchmark: cells[3]
      };
    }).filter(m => m.label && m.value);
  }

  // Extract Problem & Solution
  const problemSolutionMatch = markdown.match(/##\s+(?:Problem[^&]*&\s*Solution|Problème\s*&\s*Solution|Problématique\s*&\s*Solution)\s+([\s\S]*?)(?=\n##|$)/i);
  if (problemSolutionMatch) {
    const content = problemSolutionMatch[1];
    parsed.problemSolution = {
      problem: extractSubsection(content, ['Problème', 'Problem addressed', 'Problème addressé']),
      solution: extractSubsection(content, ['Solution proposée', 'Solution', 'Proposed solution']),
      keyPillars: extractListItems(content, 'Piliers clés') || extractBulletList(content, /(?:Key pillars|Piliers clés|piliers)/i),
      valueProposition: extractSubsection(content, ['Proposition de valeur', 'Value proposition'])
    };
  }

  // Extract Market Analysis
  const marketMatch = markdown.match(/##\s+(?:Market Analysis|Analyse du marché|Analyse de marché)\s+([\s\S]*?)(?=\n##|$)/i);
  if (marketMatch) {
    const content = marketMatch[1];
    parsed.marketAnalysis = {
      tam: extractMetricValue(content, ['TAM', 'Total Addressable Market', 'Marché Total Adressable']),
      sam: extractMetricValue(content, ['SAM', 'Serviceable Addressable Market', 'Marché Adressable Serviceable']),
      som: extractMetricValue(content, ['SOM', 'Serviceable Obtainable Market', 'Marché Obtenable']),
      marketTrends: extractBulletList(content, /(?:tendances|trends|market trends)/i),
      growthDrivers: extractBulletList(content, /(?:drivers|moteurs|growth drivers)/i),
      marketDynamics: extractSubsection(content, ['Dynamique du marché', 'Market dynamics'])
    };
  }

  // Extract Team & Execution
  const teamMatch = markdown.match(/##\s+(?:Team|Équipe|Team & Execution|Équipe & Exécution)\s+([\s\S]*?)(?=\n##|$)/i);
  if (teamMatch) {
    const content = teamMatch[1];
    const foundersList = extractBulletList(content, /(?:founders|fondateurs|équipe fondatrice)/i);
    parsed.team = {
      founders: foundersList?.map(f => {
        const parts = f.split(/[-–:]/);
        return {
          name: parts[0]?.trim() || '',
          role: parts[1]?.trim() || '',
          background: parts.slice(2).join(':').trim() || ''
        };
      }),
      keyHires: extractBulletList(content, /(?:key hires|recrutements clés|embauches)/i),
      advisors: extractBulletList(content, /(?:advisors|conseillers)/i),
      teamStrength: extractSubsection(content, ['Forces de l\'équipe', 'Team strength', 'Points forts'])
    };
  }

  // Extract Business Model
  const businessModelMatch = markdown.match(/##\s+(?:Business Model|Modèle économique|Modèle d'affaires)\s+([\s\S]*?)(?=\n##|$)/i);
  if (businessModelMatch) {
    const content = businessModelMatch[1];
    parsed.businessModel = {
      revenueStreams: extractBulletList(content, /(?:revenue|revenus|flux de revenus|streams)/i),
      pricingModel: extractSubsection(content, ['Modèle de pricing', 'Pricing model', 'Tarification']),
      customerAcquisition: extractSubsection(content, ['Acquisition client', 'Customer acquisition']),
      unitEconomics: {
        cac: extractMetricValue(content, ['CAC', 'Customer Acquisition Cost']),
        ltv: extractMetricValue(content, ['LTV', 'Lifetime Value', 'Valeur vie client']),
        ltvCacRatio: extractMetricValue(content, ['LTV/CAC', 'LTV:CAC', 'Ratio LTV/CAC'])
      },
      scalability: extractSubsection(content, ['Scalabilité', 'Scalability', 'Évolutivité'])
    };
  }

  // Extract Competitive Landscape
  const competitiveMatch = markdown.match(/##\s+(?:Competitive|Concurrence|Competitive Landscape|Paysage concurrentiel)\s+([\s\S]*?)(?=\n##|$)/i);
  if (competitiveMatch) {
    const content = competitiveMatch[1];
    parsed.competitive = {
      competitors: extractCompetitorsList(content),
      competitiveAdvantages: extractBulletList(content, /(?:avantages|advantages|competitive advantages)/i),
      moat: extractSubsection(content, ['Moat', 'Barrières à l\'entrée', 'Barriers to entry']),
      differentiation: extractSubsection(content, ['Différenciation', 'Differentiation'])
    };
  }

  // Extract Traction
  const tractionMatch = markdown.match(/##\s+(?:Traction|Traction & Milestones|Jalons)\s+([\s\S]*?)(?=\n##|$)/i);
  if (tractionMatch) {
    const content = tractionMatch[1];
    parsed.traction = {
      keyMetrics: extractMetricsFromContent(content),
      milestones: extractBulletList(content, /(?:milestones|jalons|étapes clés)/i),
      customerTestimonials: extractBulletList(content, /(?:testimonials|témoignages)/i),
      partnerships: extractBulletList(content, /(?:partnerships|partenariats)/i)
    };
  }

  // Extract Financials
  const financialsMatch = markdown.match(/##\s+(?:Financials|Finances|Financial Projections|Projections financières)\s+([\s\S]*?)(?=\n##|$)/i);
  if (financialsMatch) {
    const content = financialsMatch[1];
    parsed.financials = {
      revenue: {
        current: extractMetricValue(content, ['Current revenue', 'Revenu actuel', 'ARR actuel', 'Current ARR']),
        projected: extractMetricValue(content, ['Projected revenue', 'Revenu projeté', 'ARR projeté']),
        growth: extractMetricValue(content, ['Growth', 'Croissance', 'YoY growth'])
      },
      profitability: extractSubsection(content, ['Profitability', 'Rentabilité']),
      burnRate: extractMetricValue(content, ['Burn rate', 'Taux de combustion']),
      runway: extractMetricValue(content, ['Runway', 'Piste']),
      projections: extractBulletList(content, /(?:projections|prévisions)/i)
    };
  }

  // Extract Risk Analysis
  const riskMatch = markdown.match(/##\s+(?:Risk|Risques|Risk Analysis|Analyse des risques)\s+([\s\S]*?)(?=\n##|$)/i);
  if (riskMatch) {
    const content = riskMatch[1];
    parsed.riskAnalysis = {
      executionRisks: extractBulletList(content, /(?:execution|exécution)/i),
      marketRisks: extractBulletList(content, /(?:market|marché)/i),
      competitiveRisks: extractBulletList(content, /(?:competitive|concurrentiel)/i),
      financialRisks: extractBulletList(content, /(?:financial|financier)/i),
      mitigationStrategies: extractBulletList(content, /(?:mitigation|atténuation)/i)
    };
  }

  // Extract all major sections
  const sectionMatches = markdown.matchAll(/##\s+(.+?)\n([\s\S]*?)(?=\n##|$)/g);
  for (const match of sectionMatches) {
    const title = match[1].trim();
    const content = match[2].trim();

    // Skip already parsed sections
    const skipSections = [
      'Terms', 'Synthèse exécutive', 'Métriques clés',
      'Problem', 'Solution', 'Market', 'Team', 'Business Model',
      'Competitive', 'Traction', 'Financial', 'Risk',
      'Problème', 'Marché', 'Équipe', 'Modèle', 'Concurrence',
      'Jalons', 'Finances', 'Risques'
    ];

    if (skipSections.some(s => title.includes(s))) {
      continue;
    }

    parsed.sections?.push({
      title,
      content
    });
  }

  // Extract final recommendation
  const recommendationMatch = markdown.match(/\*\*Décision\*\*\s*:\s*\*\*(.+?)\*\*/i);
  if (recommendationMatch) {
    const decisionText = recommendationMatch[1].trim();
    let decision: 'GO' | 'NO-GO' | 'CONDITIONAL' | undefined;
    
    if (decisionText.includes('GO conditionnèle') || decisionText.includes('GO conditionnel')) {
      decision = 'CONDITIONAL';
    } else if (decisionText.includes('GO')) {
      decision = 'GO';
    } else if (decisionText.includes('NO-GO') || decisionText.includes('PASS')) {
      decision = 'NO-GO';
    }

    // Extract ticket and conditions
    const ticketMatch = markdown.match(/Ticket\s+(\d+k?€?-?\d*[kM]?€)/i);
    const conditionsMatches = markdown.matchAll(/\*\*Conditions DD[^:]*\*\*\s*:\s*(.+?)(?=\n\n|\*\*|$)/gi);
    const conditions: string[] = [];
    for (const match of conditionsMatches) {
      conditions.push(match[1].trim());
    }

    parsed.recommendation = {
      decision,
      rationale: decisionText,
      ticket: ticketMatch?.[1],
      conditions: conditions.length > 0 ? conditions : undefined
    };
  }

  return parsed;
}

function extractBulletPoint(text: string, label: string): string | undefined {
  const regex = new RegExp(`[-*]\\s*\\*\\*${label}\\*\\*\\s*:\\s*(.+?)(?=\\n|$)`, 'i');
  const match = text.match(regex);
  return match?.[1]?.trim();
}

function extractMultiBulletPoints(text: string, label: string): string[] | undefined {
  const regex = new RegExp(`[-*]\\s*\\*\\*${label}[^:]*\\*\\*\\s*:\\s*(.+?)(?=\\n[-*]\\s*\\*\\*|\\n\\n|$)`, 'is');
  const match = text.match(regex);
  if (!match) return undefined;
  
  const content = match[1].trim();
  const items = content.split(/[;,]/).map(item => item.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function extractListItems(text: string, label: string): string[] | undefined {
  const regex = new RegExp(`\\*\\*${label}[^:]*\\*\\*\\s*:\\s*(.+?)(?=\\n\\*\\*|$)`, 'is');
  const match = text.match(regex);
  if (!match) return undefined;

  const content = match[1].trim();
  // Extract numbered or bulleted list items
  const items = content.match(/\(\d+\)\s*(.+?)(?=\(\d+\)|;|$)/g);
  if (items) {
    return items.map(item => item.replace(/\(\d+\)\s*/, '').trim());
  }

  // Fallback to semicolon-separated
  return content.split(';').map(item => item.trim()).filter(Boolean);
}

function extractSubsection(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    // Try h3/h4 headers
    const headerRegex = new RegExp(`###?\\s*${label}[^\\n]*\\n+([\\s\\S]*?)(?=\\n###|\\n##|$)`, 'i');
    const headerMatch = text.match(headerRegex);
    if (headerMatch) {
      return headerMatch[1].trim();
    }

    // Try bold labels
    const boldRegex = new RegExp(`\\*\\*${label}[^:]*\\*\\*\\s*:?\\s*([^\\n]+(?:\\n(?!\\*\\*|###)[^\\n]+)*)`, 'i');
    const boldMatch = text.match(boldRegex);
    if (boldMatch) {
      return boldMatch[1].trim();
    }
  }
  return undefined;
}

function extractBulletList(text: string, pattern: RegExp): string[] | undefined {
  // Find section with pattern
  const sectionMatch = text.match(new RegExp(`(?:###?\\s*|\\*\\*)[^\\n]*${pattern.source}[^\\n]*(?:\\*\\*)?[:\\n]([\\s\\S]*?)(?=\\n###|\\n##|$)`, 'i'));
  if (!sectionMatch) return undefined;

  const content = sectionMatch[1];

  // Extract bullet points or numbered lists
  const bullets = content.match(/^[\s]*[-*•]\s*(.+?)$/gm);
  if (bullets) {
    return bullets.map(b => b.replace(/^[\s]*[-*•]\s*/, '').trim()).filter(Boolean);
  }

  const numbered = content.match(/^[\s]*\d+\.\s*(.+?)$/gm);
  if (numbered) {
    return numbered.map(n => n.replace(/^[\s]*\d+\.\s*/, '').trim()).filter(Boolean);
  }

  return undefined;
}

function extractMetricValue(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    // Try table row format
    const tableRegex = new RegExp(`\\|[^\\|]*${label}[^\\|]*\\|[^\\|]*\\|\\s*([^\\|]+)\\s*\\|`, 'i');
    const tableMatch = text.match(tableRegex);
    if (tableMatch) {
      return tableMatch[1].trim();
    }

    // Try bold label format
    const labelRegex = new RegExp(`\\*\\*${label}[^:]*\\*\\*\\s*:?\\s*([^\\n]+)`, 'i');
    const labelMatch = text.match(labelRegex);
    if (labelMatch) {
      return labelMatch[1].trim();
    }

    // Try plain label format
    const plainRegex = new RegExp(`${label}\\s*:?\\s*([\\d.,]+[kKmMbB€$]?)`, 'i');
    const plainMatch = text.match(plainRegex);
    if (plainMatch) {
      return plainMatch[1].trim();
    }
  }
  return undefined;
}

function extractCompetitorsList(text: string): Array<{ name: string; positioning: string }> | undefined {
  // Try table format
  const tableMatch = text.match(/\|[^\|]*(?:Competitor|Concurrent)[^\|]*\|[^\|]*(?:Position|Positionnement)[^\|]*\|([\s\S]*?)(?=\n\n|\n##|$)/i);
  if (tableMatch) {
    const rows = tableMatch[1].split('\n').filter(row => row.includes('|') && !row.includes('---'));
    const competitors = rows.map(row => {
      const cells = row.split('|').map(cell => cell.trim()).filter(Boolean);
      return {
        name: cells[0] || '',
        positioning: cells[1] || ''
      };
    }).filter(c => c.name);
    if (competitors.length > 0) return competitors;
  }

  // Try bullet list format with dashes
  const bullets = extractBulletList(text, /(?:competitors|concurrents)/i);
  if (bullets) {
    return bullets.map(b => {
      const parts = b.split(/[-–:]/);
      return {
        name: parts[0]?.trim() || '',
        positioning: parts.slice(1).join('-').trim() || ''
      };
    }).filter(c => c.name);
  }

  return undefined;
}

function extractMetricsFromContent(text: string): Array<{ metric: string; value: string; trend?: string }> | undefined {
  // Try table format
  const tableMatch = text.match(/\|[^\|]*(?:Metric|Métrique)[^\|]*\|([\s\S]*?)(?=\n\n|\n##|$)/i);
  if (tableMatch) {
    const rows = tableMatch[1].split('\n').filter(row => row.includes('|') && !row.includes('---'));
    const metrics = rows.map(row => {
      const cells = row.split('|').map(cell => cell.trim()).filter(Boolean);
      return {
        metric: cells[0] || '',
        value: cells[1] || '',
        trend: cells[2]
      };
    }).filter(m => m.metric && m.value);
    if (metrics.length > 0) return metrics;
  }

  // Try bullet list with values
  const bullets = text.match(/^[\s]*[-*•]\s*([^:]+):\s*(.+?)(?:\s*\(([^)]+)\))?$/gm);
  if (bullets) {
    return bullets.map(b => {
      const match = b.match(/[-*•]\s*([^:]+):\s*(.+?)(?:\s*\(([^)]+)\))?$/);
      return {
        metric: match?.[1]?.trim() || '',
        value: match?.[2]?.trim() || '',
        trend: match?.[3]?.trim()
      };
    }).filter(m => m.metric && m.value);
  }

  return undefined;
}
