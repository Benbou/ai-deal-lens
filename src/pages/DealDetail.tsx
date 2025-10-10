import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Download, Trash2, CheckCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useStreamAnalysis } from '@/hooks/useStreamAnalysis';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface AnalysisResult {
  status?: string;
  full_text?: string;
  summary?: string;
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
  current_arr_cents?: number | null;
  yoy_growth_percent?: number | null;
  mom_growth_percent?: number | null;
  solution_summary?: string | null;
  currency?: string;
  deck_files?: DeckFile[];
}

export default function DealDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const { t } = useTranslation();
  const { streamingText, isStreaming, startAnalysis, reset } = useStreamAnalysis();

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

        setAnalysis(analysisData);

        // Auto-start analysis if no analysis exists yet OR if processing
        if (dealData && (!analysisData || analysisData.status === 'processing')) {
          startAnalysis(id);
        }
      } finally {
        setLoading(false);
      }
    };
    load();

    // Subscribe to real-time updates on analyses
    const analysisChannel = supabase
      .channel(`analysis-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'analyses',
          filter: `deal_id=eq.${id}`,
        },
        (payload) => {
          console.log('Analysis update:', payload);
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setAnalysis(payload.new as any);
            
            // If analysis just completed, reset streaming
            if (payload.new.status === 'completed') {
              reset();
            }
          }
        }
      )
      .subscribe();

    // Subscribe to real-time updates on deals
    const dealChannel = supabase
      .channel(`deal-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deals',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          console.log('Deal update:', payload);
          if (payload.new) {
            setDeal(prev => prev ? { ...prev, ...payload.new } as Deal : null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(analysisChannel);
      supabase.removeChannel(dealChannel);
    };
  }, [id, startAnalysis, reset]);

  const formatCurrency = (cents?: number | null, currency?: string) => {
    if (!cents) return '-';
    const millions = cents / 100 / 1000000;
    const symbol = currency === 'USD' ? '$' : '€';
    return `${symbol}${millions.toFixed(1)}M`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Deal non trouvé</div>
      </div>
    );
  }

  const handleDownloadDeck = async () => {
    if (!deal?.deck_files?.[0]) return;
    
    try {
      const { data, error } = await supabase.storage
        .from('deck-files')
        .createSignedUrl(deal.deck_files[0].storage_path, 60 * 60);
      
      if (error) throw error;
      
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener');
      }
    } catch (error: any) {
      console.error('Error downloading deck:', error);
      toast.error('Échec du téléchargement du deck');
    }
  };

  const handleDeleteDeal = async () => {
    if (!id || !deal) return;
    
    setDeleting(true);
    try {
      // Delete files from storage first
      if (deal.deck_files && deal.deck_files.length > 0) {
        const filePaths = deal.deck_files.map(f => f.storage_path);
        const { error: storageError } = await supabase.storage
          .from('deck-files')
          .remove(filePaths);
        
        if (storageError) {
          console.error('Error deleting files from storage:', storageError);
        }
      }

      // Delete the deal (cascade will handle related records)
      const { error: deleteError } = await supabase
        .from('deals')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      toast.success('Deal supprimé avec succès');
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Error deleting deal:', error);
      toast.error('Échec de la suppression du deal');
    } finally {
      setDeleting(false);
    }
  };

  const analysisStatus = analysis?.status || 'pending';
  const isDealProcessing = (deal as any)?.status === 'processing';
  const isProcessing = isDealProcessing || analysisStatus === 'processing' || isStreaming;
  const isCompleted = analysisStatus === 'completed' && !isStreaming;
  const displayName = deal.company_name || deal.startup_name;
  const displayText = isStreaming ? streamingText : (analysis?.result?.full_text || '');

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">{displayName}</h1>
          <div className="flex gap-2 mt-2">
            <Badge>{deal.sector}</Badge>
            {deal.stage && <Badge variant="outline">{deal.stage}</Badge>}
            {isProcessing && (
              <Badge className="bg-warning text-warning-foreground flex items-center gap-1">
                Analyse en cours
                <span className="animate-pulse">...</span>
              </Badge>
            )}
            {isCompleted && (
              <Badge className="bg-success text-success-foreground flex items-center gap-2 animate-fade-in">
                <CheckCircle className="h-3 w-3" />
                Analysé
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {deal.deck_files?.[0] && (
            <Button onClick={handleDownloadDeck} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Télécharger le deck
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={deleting}>
                <Trash2 className="mr-2 h-4 w-4" />
                Supprimer
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Êtes-vous sûr ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette action est irréversible. Cela supprimera définitivement le deal,
                  les analyses, les fichiers et toutes les données associées.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteDeal} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Supprimer définitivement
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Card className="p-6">
        <h2 className="text-2xl font-semibold mb-4">Informations du Deal</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Montant levé</p>
            <p className="text-xl font-semibold">{formatCurrency(deal.amount_raised_cents, deal.currency)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Valorisation pré-money</p>
            <p className="text-xl font-semibold">{formatCurrency(deal.pre_money_valuation_cents, deal.currency)}</p>
          </div>
          {deal.current_arr_cents !== undefined && deal.current_arr_cents !== null && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">CA / ARR actuel</p>
              <p className="text-xl font-semibold">{formatCurrency(deal.current_arr_cents, deal.currency)}</p>
            </div>
          )}
          {deal.yoy_growth_percent !== undefined && deal.yoy_growth_percent !== null && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">Croissance YoY</p>
              <p className="text-xl font-semibold text-green-600">+{deal.yoy_growth_percent.toFixed(1)}%</p>
            </div>
          )}
          {deal.mom_growth_percent !== undefined && deal.mom_growth_percent !== null && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">Croissance MoM</p>
              <p className="text-xl font-semibold text-green-600">+{deal.mom_growth_percent.toFixed(1)}%</p>
            </div>
          )}
        </div>
        {deal.solution_summary && (
          <div className="mt-6 pt-6 border-t">
            <p className="text-sm text-muted-foreground mb-2">Résumé de la solution</p>
            <p className="text-base leading-relaxed">{deal.solution_summary}</p>
          </div>
        )}
      </Card>

      {(isDealProcessing || isStreaming) && !displayText && (
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <div>
              <h3 className="text-xl font-semibold mb-2">Analyse en cours</h3>
              <p className="text-muted-foreground">
                Notre IA analyse le deck en détail. Cela peut prendre quelques minutes...
              </p>
            </div>
          </div>
        </Card>
      )}

      {(isStreaming || isCompleted) && displayText && (
        <Card className="p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold">Mémo d'Investissement</h2>
            {isStreaming && (
              <Badge className="bg-primary animate-pulse">
                Analyse en cours...
              </Badge>
            )}
          </div>
          <div className="prose prose-lg max-w-none dark:prose-invert
            prose-headings:scroll-mt-16
            prose-h1:text-4xl prose-h1:font-extrabold prose-h1:mb-8 prose-h1:pb-6 prose-h1:border-b-4 prose-h1:border-primary/40
            prose-h2:text-3xl prose-h2:font-bold prose-h2:mt-16 prose-h2:mb-8 prose-h2:pb-4 prose-h2:border-b-2 prose-h2:border-primary/20
            prose-h2:bg-gradient-to-r prose-h2:from-primary/5 prose-h2:to-transparent prose-h2:px-4 prose-h2:py-3 prose-h2:rounded-md prose-h2:-mx-4
            prose-h3:text-2xl prose-h3:font-semibold prose-h3:mt-10 prose-h3:mb-5 prose-h3:text-primary
            prose-h4:text-xl prose-h4:font-semibold prose-h4:mt-8 prose-h4:mb-4
            prose-p:text-base prose-p:leading-relaxed prose-p:mb-6 prose-p:text-foreground/90
            prose-p:first-of-type:text-lg prose-p:first-of-type:font-medium prose-p:first-of-type:leading-relaxed
            prose-strong:font-bold prose-strong:text-primary prose-strong:bg-primary/5 prose-strong:px-1 prose-strong:rounded
            prose-ul:my-6 prose-ul:space-y-3 prose-ul:pl-6
            prose-ol:my-6 prose-ol:space-y-3 prose-ol:pl-6
            prose-li:text-base prose-li:leading-relaxed prose-li:text-foreground/90
            prose-li:marker:text-primary prose-li:marker:font-bold
            prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:bg-primary/5 
            prose-blockquote:pl-6 prose-blockquote:pr-6 prose-blockquote:py-4 prose-blockquote:my-8
            prose-blockquote:italic prose-blockquote:rounded-r-md
            prose-code:bg-muted prose-code:text-primary prose-code:px-2 prose-code:py-1 prose-code:rounded prose-code:text-sm prose-code:font-mono
            prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:p-4 prose-pre:rounded-lg prose-pre:my-6
            prose-table:my-8 prose-table:border-collapse prose-table:w-full
            prose-th:bg-primary/10 prose-th:font-bold prose-th:text-left prose-th:py-3 prose-th:px-4 prose-th:border prose-th:border-border
            prose-td:border prose-td:border-border prose-td:py-3 prose-td:px-4
            prose-hr:border-2 prose-hr:border-primary/20 prose-hr:my-12
            prose-a:text-primary prose-a:font-medium prose-a:underline prose-a:decoration-primary/30 hover:prose-a:decoration-primary">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText}</ReactMarkdown>
          </div>
        </Card>
      )}

      {!isProcessing && !isCompleted && (
        <Card className="p-12 text-center">
          <div className="text-muted-foreground">
            <p>L'analyse n'a pas encore démarré</p>
          </div>
        </Card>
      )}
    </div>
  );
}


