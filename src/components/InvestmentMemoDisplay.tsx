import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Target, DollarSign } from "lucide-react";
import { ParsedMemo, parseMemoMarkdown } from "@/utils/memoParser";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface InvestmentMemoDisplayProps {
  memoMarkdown: string;
}

export function InvestmentMemoDisplay({ memoMarkdown }: InvestmentMemoDisplayProps) {
  const parsed: ParsedMemo = parseMemoMarkdown(memoMarkdown);

  const getDecisionColor = (decision?: string) => {
    if (!decision) return "default";
    if (decision === 'GO') return "default";
    if (decision === 'CONDITIONAL') return "secondary";
    if (decision === 'NO-GO') return "destructive";
    return "default";
  };

  const getDecisionLabel = (decision?: string) => {
    if (!decision) return "En analyse";
    if (decision === 'GO') return "GO";
    if (decision === 'CONDITIONAL') return "GO Conditionnel";
    if (decision === 'NO-GO') return "NO-GO";
    return decision;
  };

  return (
    <div className="space-y-6"
    >

      {/* Executive Summary */}
      {parsed.executiveSummary && (
          <Card className={`transition-all duration-300 hover:shadow-lg ${
              parsed.executiveSummary.decision === 'GO'
                ? 'border-primary/50 hover:border-primary'
                : parsed.executiveSummary.decision === 'NO-GO'
                ? 'border-destructive/50 hover:border-destructive'
                : parsed.executiveSummary.decision === 'CONDITIONAL'
                ? 'border-secondary/50 hover:border-secondary'
                : ''
            }`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Synthèse exécutive
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {parsed.executiveSummary.what && (
              <div>
                <h4 className="font-semibold mb-2">Quoi</h4>
                <p className="text-sm leading-relaxed">{parsed.executiveSummary.what}</p>
              </div>
            )}
            
            {parsed.executiveSummary.whyItWins && (
              <div>
                <h4 className="font-semibold mb-2">Pourquoi ça gagne</h4>
                <p className="text-sm leading-relaxed">{parsed.executiveSummary.whyItWins}</p>
              </div>
            )}

            {parsed.executiveSummary.proofPoints && parsed.executiveSummary.proofPoints.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Preuves</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {parsed.executiveSummary.proofPoints.map((point, idx) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.executiveSummary.risks && parsed.executiveSummary.risks.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  Risques majeurs
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {parsed.executiveSummary.risks.map((risk, idx) => (
                    <li key={idx} className="text-destructive">{risk}</li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.executiveSummary.decisionText && (
              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-2">Décision</h4>
                <Badge variant={getDecisionColor(parsed.executiveSummary.decision)} className="text-sm">
                  {parsed.executiveSummary.decisionText}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Terms */}
      {parsed.terms && (
        <Card className="hover:shadow-lg transition-all duration-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Terms
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {parsed.terms.ticket && (
              <div className="flex justify-between items-start">
                <span className="font-medium text-sm">Ticket</span>
                <span className="text-sm text-right">{parsed.terms.ticket}</span>
              </div>
            )}
            
            {parsed.terms.preMoneyValuation && (
              <div className="flex justify-between items-start">
                <span className="font-medium text-sm">Pré-money</span>
                <span className="text-sm text-right">{parsed.terms.preMoneyValuation}</span>
              </div>
            )}

            {parsed.terms.useOfFunds && (
              <div>
                <span className="font-medium text-sm block mb-1">Usage des fonds</span>
                <p className="text-sm text-muted-foreground">{parsed.terms.useOfFunds}</p>
              </div>
            )}

            {parsed.terms.milestones && parsed.terms.milestones.length > 0 && (
              <div>
                <span className="font-medium text-sm block mb-1">Jalons clés</span>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  {parsed.terms.milestones.map((milestone, idx) => (
                    <li key={idx}>{milestone}</li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.terms.exitScenarios && parsed.terms.exitScenarios.length > 0 && (
              <div>
                <span className="font-medium text-sm block mb-1">Scénarios de sortie</span>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  {parsed.terms.exitScenarios.map((scenario, idx) => (
                    <li key={idx}>{scenario}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Other Sections */}
      {parsed.sections && parsed.sections.map((section, idx) => (
        <Card key={idx} className="hover:shadow-lg transition-all duration-300">
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                h3: ({node, ...props}) => <h3 className="text-xl font-semibold mt-4 mb-2" {...props} />,
                h4: ({node, ...props}) => <h4 className="text-lg font-semibold mt-3 mb-2" {...props} />,
                p: ({node, ...props}) => <p className="leading-7 mb-4" {...props} />,
                ul: ({node, ...props}) => <ul className="list-disc list-inside space-y-1 mb-4" {...props} />,
                ol: ({node, ...props}) => <ol className="list-decimal list-inside space-y-1 mb-4" {...props} />,
                li: ({node, ...props}) => <li className="leading-7" {...props} />,
                table: ({node, ...props}) => (
                  <div className="my-4 w-full overflow-x-auto">
                    <table className="w-full border-collapse" {...props} />
                  </div>
                ),
                thead: ({node, ...props}) => <thead className="bg-muted" {...props} />,
                tr: ({node, ...props}) => <tr className="border-b" {...props} />,
                th: ({node, ...props}) => <th className="border px-4 py-2 text-left font-semibold" {...props} />,
                td: ({node, ...props}) => <td className="border px-4 py-2" {...props} />,
                strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
                blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-primary pl-4 italic my-4" {...props} />,
              }}
            >
              {section.content}
            </ReactMarkdown>
          </CardContent>
        </Card>
      ))}

      {/* Final Recommendation */}
      {parsed.recommendation && parsed.recommendation.decision && (
        <Card className={`transition-all duration-300 hover:shadow-lg ${
          parsed.recommendation.decision === 'GO' ? 'border-primary bg-primary/5 hover:bg-primary/10' :
          parsed.recommendation.decision === 'NO-GO' ? 'border-destructive bg-destructive/5 hover:bg-destructive/10' :
          'border-secondary bg-secondary/5 hover:bg-secondary/10'
        }`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Recommandation finale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge 
                variant={getDecisionColor(parsed.recommendation.decision)}
                className="text-base px-4 py-1"
              >
                {getDecisionLabel(parsed.recommendation.decision)}
              </Badge>
              {parsed.recommendation.ticket && (
                <span className="text-sm text-muted-foreground">
                  Ticket recommandé: {parsed.recommendation.ticket}
                </span>
              )}
            </div>

            {parsed.recommendation.rationale && (
              <p className="text-sm leading-relaxed">{parsed.recommendation.rationale}</p>
            )}

            {parsed.recommendation.conditions && parsed.recommendation.conditions.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-2">Conditions DD</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {parsed.recommendation.conditions.map((condition, idx) => (
                    <li key={idx}>{condition}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
