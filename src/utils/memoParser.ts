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

  // Extract all major sections
  const sectionMatches = markdown.matchAll(/##\s+(.+?)\n([\s\S]*?)(?=\n##|$)/g);
  for (const match of sectionMatches) {
    const title = match[1].trim();
    const content = match[2].trim();
    
    // Skip already parsed sections
    if (['Terms', 'Synthèse exécutive', 'Métriques clés'].some(s => title.includes(s))) {
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
