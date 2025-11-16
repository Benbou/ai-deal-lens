import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, TrendingUp, Users, DollarSign, Target, Zap } from 'lucide-react';
import { useAnalysisRealtime } from '@/hooks/useAnalysisRealtime';

interface DealAnalysisDashboardProps {
  dealId: string;
}

export function DealAnalysisDashboard({ dealId }: DealAnalysisDashboardProps) {
  const analysis = useAnalysisRealtime(dealId);
  
  const quickContext = analysis?.quick_context;
  const hasContext = analysis && analysis.progress_percent !== null && analysis.progress_percent >= 40;

  if (!hasContext) {
    return (
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 animate-pulse text-blue-600" />
            <p className="text-sm font-medium text-blue-900">Analyse du contexte en cours...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header avec nom entreprise + secteur */}
      <Card className="border-green-200 bg-gradient-to-r from-green-50 to-emerald-50">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <CardTitle className="text-2xl flex items-center gap-3">
                <Building2 className="w-6 h-6 text-green-600" />
                {quickContext?.company_name || 'Entreprise'}
              </CardTitle>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                  {quickContext?.sector || 'Secteur'}
                </Badge>
                {quickContext?.funding_stage && (
                  <Badge variant="outline">
                    {quickContext.funding_stage}
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Contexte disponible</p>
              <p className="text-lg font-bold text-green-600">✓</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Métriques clés en grille */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Montant levé */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="w-4 h-4" />
                <p className="text-xs font-medium">Montant Levé</p>
              </div>
              <p className="text-2xl font-bold">
                {quickContext?.funding_amount_eur 
                  ? `${(quickContext.funding_amount_eur / 1000000).toFixed(1)}M€`
                  : 'N/A'
                }
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Taille équipe */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="w-4 h-4" />
                <p className="text-xs font-medium">Équipe</p>
              </div>
              <p className="text-2xl font-bold">
                {quickContext?.team_size || 'N/A'}
                {quickContext?.team_size && (
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    {quickContext.team_size === 1 ? 'personne' : 'personnes'}
                  </span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Stage */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <TrendingUp className="w-4 h-4" />
                <p className="text-xs font-medium">Stage</p>
              </div>
              <p className="text-xl font-bold">
                {quickContext?.funding_stage || 'N/A'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Solution summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4" />
            Solution en Bref
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {quickContext?.solution_summary || 'Analyse en cours...'}
          </p>
        </CardContent>
      </Card>

      {/* Status du mémo */}
      {analysis && analysis.progress_percent !== null && analysis.progress_percent < 100 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 animate-pulse text-blue-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">
                  Génération du mémo détaillé en cours...
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Le mémo complet apparaîtra ci-dessous token par token
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
