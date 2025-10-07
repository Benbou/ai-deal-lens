import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AnalysisResult {
  full_text?: string;
  summary?: string;
  maturity_level?: string | null;
  risk_score?: number | null;
  valuation_gap_percent?: number | null;
}

interface DeckFile {
  storage_path: string;
  file_name: string;
}

interface Deal {
  id: string;
  startup_name: string;
  company_name?: string | null;
  sector: string;
  stage?: string | null;
  amount_raised_cents?: number | null;
  pre_money_valuation_cents?: number | null;
  solution_summary?: string | null;
  deck_files?: DeckFile[];
}

export default function DealDetail() {
  const { id } = useParams();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const { data: dealData } = await supabase
          .from('deals')
          .select('*, deck_files(storage_path, file_name)')
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
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" fill="none" />
          </svg>
          <span>Analyse en cours… Cela peut prendre 2–3 minutes.</span>
        </div>
      </div>
    );
  }

  if (!deal) {
    return <div className="p-6 text-destructive">Deal introuvable.</div>;
  }

  const handleDownloadDeck = async () => {
    if (!deal?.deck_files?.[0]) return;
    
    const { data } = await supabase.storage
      .from('deck-files')
      .createSignedUrl(deal.deck_files[0].storage_path, 60 * 60);
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank', 'noopener');
    }
  };

  const displayName = deal.company_name || deal.startup_name;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{displayName}</h1>
        <div className="flex items-center gap-3">
          <Badge variant="outline">{deal.sector}</Badge>
          {deal.deck_files?.[0] && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleDownloadDeck}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('downloadDeck')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Montant levé</div>
            <div className="font-medium">{formatCurrency(deal.amount_raised_cents)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Pré-money</div>
            <div className="font-medium">{formatCurrency(deal.pre_money_valuation_cents)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Secteur</div>
            <div className="font-medium">{deal.sector}</div>
          </div>
        </div>
        {deal.solution_summary && (
          <div className="mt-4 pt-4 border-t">
            <div className="text-sm text-muted-foreground mb-1">Résumé de la solution</div>
            <div className="text-sm">{deal.solution_summary}</div>
          </div>
        )}
      </Card>

      <Separator />

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Mémo d'analyse</h2>
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown
            components={{
              h1: ({node, ...props}) => <h1 className="text-2xl font-bold mt-6 mb-4" {...props} />,
              h2: ({node, ...props}) => <h2 className="text-xl font-semibold mt-5 mb-3" {...props} />,
              h3: ({node, ...props}) => <h3 className="text-lg font-semibold mt-4 mb-2" {...props} />,
              p: ({node, ...props}) => <p className="mb-3 leading-7" {...props} />,
              ul: ({node, ...props}) => <ul className="list-disc pl-6 mb-3 space-y-1" {...props} />,
              ol: ({node, ...props}) => <ol className="list-decimal pl-6 mb-3 space-y-1" {...props} />,
              li: ({node, ...props}) => <li className="leading-7" {...props} />,
              strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
              em: ({node, ...props}) => <em className="italic" {...props} />,
              code: ({node, ...props}) => <code className="bg-muted px-1 py-0.5 rounded text-sm" {...props} />,
              blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-primary pl-4 italic my-4" {...props} />,
            }}
          >
            {analysis?.full_text || analysis?.summary || 'Aucune analyse disponible pour le moment.'}
          </ReactMarkdown>
        </div>
      </Card>
    </div>
  );
}


