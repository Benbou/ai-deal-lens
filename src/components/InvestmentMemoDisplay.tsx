import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle, TrendingUp, Target, Users, DollarSign, Sparkles,
  Lightbulb, BarChart3, Trophy, Zap, ShieldAlert, Calendar,
  LineChart, PieChart, Flag, Award, Briefcase, CheckCircle2
} from "lucide-react";
import { ParsedMemo, parseMemoMarkdown } from "@/utils/memoParser";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface InvestmentMemoDisplayProps {
  memoMarkdown: string;
  dealData?: {
    companyName?: string;
    sector?: string;
    arr?: number;
    yoyGrowth?: number;
  };
  isStreaming?: boolean;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function InvestmentMemoDisplay({
  memoMarkdown,
  dealData,
  isStreaming
}: InvestmentMemoDisplayProps) {
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
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        {parsed.title && (
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            {parsed.title}
          </h1>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          {parsed.dealSource && (
            <Badge variant="outline" className="hover:scale-105 transition-transform">
              {parsed.dealSource}
            </Badge>
          )}

          {parsed.executiveSummary?.decision && (
            <Badge
              variant={getDecisionColor(parsed.executiveSummary.decision)}
              className="hover:scale-105 transition-transform shadow-sm"
            >
              {getDecisionLabel(parsed.executiveSummary.decision)}
            </Badge>
          )}

          {isStreaming && (
            <Badge className="bg-primary/10 text-primary border-primary/20 hover:scale-105 transition-transform">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                <span className="text-xs font-medium">Génération en cours</span>
              </div>
            </Badge>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      {parsed.metrics && parsed.metrics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {parsed.metrics.slice(0, 4).map((metric, idx) => (
            <div
              key={idx}
              className="group hover:shadow-lg transition-all duration-300"
            >
              <Card className="h-full border-2 hover:border-primary/50 hover:shadow-lg transition-all duration-300 overflow-hidden relative">
                {/* Gradient overlay on hover */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                <CardHeader className="pb-2 relative z-10">
                  <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
                    {metric.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className="text-2xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                    {metric.value}
                  </div>
                  {metric.benchmark && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Benchmark: {metric.benchmark}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* Executive Summary */}
      {parsed.executiveSummary && (
        <Card
          className={`transition-all duration-300 hover:shadow-xl ${
            parsed.executiveSummary.decision === 'GO'
              ? 'border-primary/50 hover:border-primary'
              : parsed.executiveSummary.decision === 'NO-GO'
              ? 'border-destructive/50 hover:border-destructive'
              : parsed.executiveSummary.decision === 'CONDITIONAL'
              ? 'border-secondary/50 hover:border-secondary'
              : ''
          }`}
        >
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
        <Card className="hover:shadow-xl transition-all duration-300">
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

      {/* Problem & Solution */}
      {parsed.problemSolution && (
        <Card className="hover:shadow-xl transition-all duration-300 border-2 hover:border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              Problem & Solution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {parsed.problemSolution.problem && (
              <div className="group">
                <h4 className="font-semibold mb-3 flex items-center gap-2 text-lg">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  Problème addressé
                </h4>
                <p className="text-sm leading-relaxed pl-6 border-l-4 border-destructive/30 bg-destructive/5 p-4 rounded-r-md">
                  {parsed.problemSolution.problem}
                </p>
              </div>
            )}

            {parsed.problemSolution.solution && (
              <div className="group">
                <h4 className="font-semibold mb-3 flex items-center gap-2 text-lg">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Solution proposée
                </h4>
                <p className="text-sm leading-relaxed pl-6 border-l-4 border-success/30 bg-success/5 p-4 rounded-r-md">
                  {parsed.problemSolution.solution}
                </p>
              </div>
            )}

            {parsed.problemSolution.keyPillars && parsed.problemSolution.keyPillars.length > 0 && (
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-primary" />
                  Piliers clés
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {parsed.problemSolution.keyPillars.map((pillar, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors"
                    >
                      <Flag className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{pillar}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {parsed.problemSolution.valueProposition && (
              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Proposition de valeur
                </h4>
                <p className="text-sm leading-relaxed">{parsed.problemSolution.valueProposition}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Market Analysis */}
      {parsed.marketAnalysis && (
        <Card className="hover:shadow-xl transition-all duration-300 border-2 hover:border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Analyse du marché
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* TAM/SAM/SOM Grid */}
            {(parsed.marketAnalysis.tam || parsed.marketAnalysis.sam || parsed.marketAnalysis.som) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {parsed.marketAnalysis.tam && (
                  <div className="group">
                    <Card className="h-full border-2 hover:border-primary/50 hover:shadow-lg transition-all duration-300">
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg" />
                      <CardHeader className="pb-2 relative z-10">
                        <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
                          TAM (Total Addressable Market)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-2xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                          {parsed.marketAnalysis.tam}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {parsed.marketAnalysis.sam && (
                  <div className="group">
                    <Card className="h-full border-2 hover:border-primary/50 hover:shadow-lg transition-all duration-300">
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg" />
                      <CardHeader className="pb-2 relative z-10">
                        <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
                          SAM (Serviceable Addressable Market)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-2xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                          {parsed.marketAnalysis.sam}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {parsed.marketAnalysis.som && (
                  <div className="group">
                    <Card className="h-full border-2 hover:border-primary/50 hover:shadow-lg transition-all duration-300">
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg" />
                      <CardHeader className="pb-2 relative z-10">
                        <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
                          SOM (Serviceable Obtainable Market)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="relative z-10">
                        <div className="text-2xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                          {parsed.marketAnalysis.som}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}

            {parsed.marketAnalysis.marketTrends && parsed.marketAnalysis.marketTrends.length > 0 && (
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Tendances du marché
                </h4>
                <ul className="space-y-2">
                  {parsed.marketAnalysis.marketTrends.map((trend, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <span>{trend}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.marketAnalysis.growthDrivers && parsed.marketAnalysis.growthDrivers.length > 0 && (
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-success" />
                  Moteurs de croissance
                </h4>
                <ul className="space-y-2">
                  {parsed.marketAnalysis.growthDrivers.map((driver, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <div className="h-1.5 w-1.5 rounded-full bg-success mt-2 flex-shrink-0" />
                      <span>{driver}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.marketAnalysis.marketDynamics && (
              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-2">Dynamique du marché</h4>
                <p className="text-sm leading-relaxed">{parsed.marketAnalysis.marketDynamics}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Team & Execution */}
      {parsed.team && (
        <Card className="hover:shadow-xl transition-all duration-300 border-2 hover:border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Équipe & Exécution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {parsed.team.founders && parsed.team.founders.length > 0 && (
              <div>
                <h4 className="font-semibold mb-4 flex items-center gap-2">
                  <Award className="h-4 w-4 text-primary" />
                  Fondateurs
                </h4>
                <div className="space-y-3">
                  {parsed.team.founders.map((founder, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-lg border border-border hover:border-primary/50 hover:shadow-md transition-all duration-300 bg-gradient-to-r from-primary/5 to-transparent"
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <h5 className="font-semibold text-base">{founder.name}</h5>
                          {founder.role && (
                            <p className="text-sm text-primary font-medium mt-0.5">{founder.role}</p>
                          )}
                          {founder.background && (
                            <p className="text-sm text-muted-foreground mt-1">{founder.background}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {parsed.team.keyHires && parsed.team.keyHires.length > 0 && (
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  Recrutements clés
                </h4>
                <ul className="space-y-2">
                  {parsed.team.keyHires.map((hire, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                      <span>{hire}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.team.advisors && parsed.team.advisors.length > 0 && (
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Conseillers
                </h4>
                <ul className="space-y-2">
                  {parsed.team.advisors.map((advisor, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <span>{advisor}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.team.teamStrength && (
              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-2">Forces de l'équipe</h4>
                <p className="text-sm leading-relaxed">{parsed.team.teamStrength}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Business Model */}
      {parsed.businessModel && (
        <Card className="hover:shadow-xl transition-all duration-300 border-2 hover:border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5 text-primary" />
              Modèle économique
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {parsed.businessModel.revenueStreams && parsed.businessModel.revenueStreams.length > 0 && (
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-success" />
                  Flux de revenus
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {parsed.businessModel.revenueStreams.map((stream, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 p-3 rounded-lg bg-success/5 hover:bg-success/10 transition-colors border border-success/20"
                    >
                      <DollarSign className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{stream}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unit Economics Grid */}
            {parsed.businessModel.unitEconomics && (parsed.businessModel.unitEconomics.cac || parsed.businessModel.unitEconomics.ltv || parsed.businessModel.unitEconomics.ltvCacRatio) && (
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Unit Economics
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {parsed.businessModel.unitEconomics.cac && (
                    <div className="group">
                      <Card className="h-full border-2 hover:border-primary/50 hover:shadow-lg transition-all duration-300">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
                            CAC
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-xl font-bold">{parsed.businessModel.unitEconomics.cac}</div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {parsed.businessModel.unitEconomics.ltv && (
                    <div className="group">
                      <Card className="h-full border-2 hover:border-primary/50 hover:shadow-lg transition-all duration-300">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
                            LTV
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-xl font-bold">{parsed.businessModel.unitEconomics.ltv}</div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {parsed.businessModel.unitEconomics.ltvCacRatio && (
                    <div className="group">
                      <Card className="h-full border-2 hover:border-success/50 hover:shadow-lg transition-all duration-300">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-success transition-colors">
                            LTV/CAC Ratio
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-xl font-bold text-success">{parsed.businessModel.unitEconomics.ltvCacRatio}</div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>
              </div>
            )}

            {parsed.businessModel.pricingModel && (
              <div>
                <h4 className="font-semibold mb-2">Modèle de pricing</h4>
                <p className="text-sm leading-relaxed">{parsed.businessModel.pricingModel}</p>
              </div>
            )}

            {parsed.businessModel.customerAcquisition && (
              <div>
                <h4 className="font-semibold mb-2">Acquisition client</h4>
                <p className="text-sm leading-relaxed">{parsed.businessModel.customerAcquisition}</p>
              </div>
            )}

            {parsed.businessModel.scalability && (
              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-success" />
                  Scalabilité
                </h4>
                <p className="text-sm leading-relaxed">{parsed.businessModel.scalability}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Competitive Landscape */}
      {parsed.competitive && (
        <Card className="hover:shadow-xl transition-all duration-300 border-2 hover:border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              Paysage concurrentiel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {parsed.competitive.competitors && parsed.competitive.competitors.length > 0 && (
              <div>
                <h4 className="font-semibold mb-4 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Concurrents principaux
                </h4>
                <div className="space-y-3">
                  {parsed.competitive.competitors.map((competitor, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-lg border border-border hover:border-primary/50 hover:shadow-md transition-all duration-300"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <h5 className="font-semibold text-base">{competitor.name}</h5>
                      </div>
                      {competitor.positioning && (
                        <p className="text-sm text-muted-foreground mt-2">{competitor.positioning}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {parsed.competitive.competitiveAdvantages && parsed.competitive.competitiveAdvantages.length > 0 && (
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-success" />
                  Avantages concurrentiels
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {parsed.competitive.competitiveAdvantages.map((advantage, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 p-3 rounded-lg bg-success/5 hover:bg-success/10 transition-colors"
                    >
                      <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{advantage}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {parsed.competitive.moat && (
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-primary" />
                  Barrières à l'entrée (Moat)
                </h4>
                <p className="text-sm leading-relaxed">{parsed.competitive.moat}</p>
              </div>
            )}

            {parsed.competitive.differentiation && (
              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-2">Différenciation</h4>
                <p className="text-sm leading-relaxed">{parsed.competitive.differentiation}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Traction & Milestones */}
      {parsed.traction && (
        <Card className="hover:shadow-xl transition-all duration-300 border-2 hover:border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineChart className="h-5 w-5 text-primary" />
              Traction & Jalons
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {parsed.traction.keyMetrics && parsed.traction.keyMetrics.length > 0 && (
              <div>
                <h4 className="font-semibold mb-4 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Métriques clés
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {parsed.traction.keyMetrics.map((metric, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-lg border border-border hover:border-primary/50 hover:shadow-md transition-all duration-300"
                    >
                      <p className="text-sm text-muted-foreground mb-1">{metric.metric}</p>
                      <p className="text-xl font-bold">{metric.value}</p>
                      {metric.trend && (
                        <Badge variant="outline" className="mt-2 text-xs">
                          {metric.trend}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {parsed.traction.milestones && parsed.traction.milestones.length > 0 && (
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  Jalons atteints
                </h4>
                <ul className="space-y-2">
                  {parsed.traction.milestones.map((milestone, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                      <span>{milestone}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.traction.partnerships && parsed.traction.partnerships.length > 0 && (
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Partenariats
                </h4>
                <ul className="space-y-2">
                  {parsed.traction.partnerships.map((partnership, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <span>{partnership}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.traction.customerTestimonials && parsed.traction.customerTestimonials.length > 0 && (
              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-3">Témoignages clients</h4>
                <div className="space-y-3">
                  {parsed.traction.customerTestimonials.map((testimonial, idx) => (
                    <blockquote
                      key={idx}
                      className="border-l-4 border-primary pl-4 italic text-sm text-muted-foreground"
                    >
                      {testimonial}
                    </blockquote>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Financials */}
      {parsed.financials && (
        <Card className="hover:shadow-xl transition-all duration-300 border-2 hover:border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Finances & Projections
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Revenue Grid */}
            {parsed.financials.revenue && (parsed.financials.revenue.current || parsed.financials.revenue.projected || parsed.financials.revenue.growth) && (
              <div>
                <h4 className="font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-success" />
                  Revenus
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {parsed.financials.revenue.current && (
                    <div className="group">
                      <Card className="h-full border-2 hover:border-primary/50 hover:shadow-lg transition-all duration-300">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
                            Actuel
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-xl font-bold">{parsed.financials.revenue.current}</div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {parsed.financials.revenue.projected && (
                    <div className="group">
                      <Card className="h-full border-2 hover:border-primary/50 hover:shadow-lg transition-all duration-300">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
                            Projeté
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-xl font-bold">{parsed.financials.revenue.projected}</div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {parsed.financials.revenue.growth && (
                    <div className="group">
                      <Card className="h-full border-2 hover:border-success/50 hover:shadow-lg transition-all duration-300">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-success transition-colors">
                            Croissance
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-xl font-bold text-success">{parsed.financials.revenue.growth}</div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Burn & Runway */}
            {(parsed.financials.burnRate || parsed.financials.runway) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {parsed.financials.burnRate && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Burn rate</p>
                    <p className="text-lg font-semibold">{parsed.financials.burnRate}</p>
                  </div>
                )}

                {parsed.financials.runway && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Runway</p>
                    <p className="text-lg font-semibold">{parsed.financials.runway}</p>
                  </div>
                )}
              </div>
            )}

            {parsed.financials.profitability && (
              <div>
                <h4 className="font-semibold mb-2">Rentabilité</h4>
                <p className="text-sm leading-relaxed">{parsed.financials.profitability}</p>
              </div>
            )}

            {parsed.financials.projections && parsed.financials.projections.length > 0 && (
              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-3">Projections</h4>
                <ul className="space-y-2">
                  {parsed.financials.projections.map((projection, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <span>{projection}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Risk Analysis */}
      {parsed.riskAnalysis && (
        <Card className="hover:shadow-xl transition-all duration-300 border-2 hover:border-destructive/30 border-destructive/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Analyse des risques
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {parsed.riskAnalysis.executionRisks && parsed.riskAnalysis.executionRisks.length > 0 && (
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  Risques d'exécution
                </h4>
                <ul className="space-y-2">
                  {parsed.riskAnalysis.executionRisks.map((risk, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.riskAnalysis.marketRisks && parsed.riskAnalysis.marketRisks.length > 0 && (
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-destructive" />
                  Risques de marché
                </h4>
                <ul className="space-y-2">
                  {parsed.riskAnalysis.marketRisks.map((risk, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.riskAnalysis.competitiveRisks && parsed.riskAnalysis.competitiveRisks.length > 0 && (
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-destructive" />
                  Risques concurrentiels
                </h4>
                <ul className="space-y-2">
                  {parsed.riskAnalysis.competitiveRisks.map((risk, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.riskAnalysis.financialRisks && parsed.riskAnalysis.financialRisks.length > 0 && (
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-destructive" />
                  Risques financiers
                </h4>
                <ul className="space-y-2">
                  {parsed.riskAnalysis.financialRisks.map((risk, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.riskAnalysis.mitigationStrategies && parsed.riskAnalysis.mitigationStrategies.length > 0 && (
              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-3 flex items-center gap-2 text-success">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Stratégies d'atténuation
                </h4>
                <ul className="space-y-2">
                  {parsed.riskAnalysis.mitigationStrategies.map((strategy, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                      <span>{strategy}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Remaining generic sections (fallback) */}
      {parsed.sections && parsed.sections.map((section, idx) => (
        <Card key={idx} className="hover:shadow-xl transition-all duration-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              {section.title}
            </CardTitle>
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
        <Card className={`transition-all duration-300 hover:shadow-2xl ${
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
