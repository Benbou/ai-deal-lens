import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface AnalysisResult {
  full_text?: string;
  summary?: string;
  maturity_level?: string | null;
  risk_score?: number | null;
  valuation_gap_percent?: number | null;
}

interface Deal {
  id: string;
  startup_name: string;
  sector: string;
  stage?: string | null;
  amount_raised_cents?: number | null;
  pre_money_valuation_cents?: number | null;
  maturity_level?: string | null;
  risk_score?: number | null;
  valuation_gap_percent?: number | null;
}

export default function DealDetail() {
  const { id } = useParams();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const { data: dealData } = await supabase
          .from('deals')
          .select('*')
          .eq('id', id)
          .single();

        setDeal(dealData as Deal);

        const { data: analysisData } = await supabase
          .from('analyses')
          .select('*')
          .eq('deal_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        setAnalysis((analysisData?.result as AnalysisResult) || null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const formatCurrency = (cents?: number | null) => {
    if (!cents) return '-';
    return `€${(cents / 100 / 1000).toFixed(1)}M`;
  };

  if (loading) {
    return <div className="p-6 text-muted-foreground">Chargement…</div>;
  }

  if (!deal) {
    return <div className="p-6 text-destructive">Deal introuvable.</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{deal.startup_name}</h1>
        <Badge variant="outline">{deal.sector}</Badge>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Montant levé</div>
            <div className="font-medium">{formatCurrency(deal.amount_raised_cents)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Pré-money</div>
            <div className="font-medium">{formatCurrency(deal.pre_money_valuation_cents)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Maturité</div>
            <div className="font-medium">{analysis?.maturity_level ?? deal.maturity_level ?? '-'}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Risque</div>
            <div className="font-medium">{analysis?.risk_score ?? deal.risk_score ?? '-'}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Écart de valo</div>
            <div className="font-medium">{(analysis?.valuation_gap_percent ?? deal.valuation_gap_percent ?? 0).toString()}%</div>
          </div>
        </div>
      </Card>

      <Separator />

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-3">Mémo d'analyse</h2>
        <div className="prose prose-sm max-w-none whitespace-pre-wrap">
          {analysis?.full_text || analysis?.summary || 'Aucune analyse disponible pour le moment.'}
        </div>
      </Card>
    </div>
  );
}


