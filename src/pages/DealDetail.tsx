import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Download, Trash2, CheckCircle, AlertCircle, FileText, Loader2 } from 'lucide-react';
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
  const { streamingText, isStreaming, error, startAnalysis, reset } = useStreamAnalysis();

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

      {error && (
        <Card className="p-8 border-destructive bg-destructive/10">
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <div>
              <h3 className="text-xl font-semibold mb-2 text-destructive">
                Erreur lors de l'analyse
              </h3>
              <p className="text-muted-foreground mb-4">
                {error}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Notre équipe technique a été automatiquement notifiée. 
                Vous pouvez réessayer ou nous contacter si le problème persiste.
              </p>
              <Button 
                onClick={() => {
                  reset();
                  if (id) startAnalysis(id);
                }}
                variant="outline"
              >
                Réessayer l'analyse
              </Button>
            </div>
          </div>
        </Card>
      )}

      {!error && (isDealProcessing || isStreaming) && !displayText && (
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
        <Card className="p-8 backdrop-blur-sm bg-card/95 border-2 animate-fade-in">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Mémo d'Investissement
              </h2>
            </div>
            {isStreaming && (
              <Badge className="bg-primary animate-pulse flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Génération en cours...
              </Badge>
            )}
          </div>
          
          <div className="prose prose-lg max-w-none dark:prose-invert
            prose-headings:scroll-mt-20
            prose-h1:text-5xl prose-h1:font-black prose-h1:mb-10 prose-h1:pb-8 
            prose-h1:bg-gradient-to-r prose-h1:from-primary prose-h1:via-primary/80 prose-h1:to-primary/60
            prose-h1:bg-clip-text prose-h1:text-transparent
            prose-h1:border-b-4 prose-h1:border-primary/30
            
            prose-h2:text-3xl prose-h2:font-bold prose-h2:mt-20 prose-h2:mb-8 
            prose-h2:bg-gradient-to-r prose-h2:from-primary/10 prose-h2:via-primary/5 prose-h2:to-transparent 
            prose-h2:px-6 prose-h2:py-4 prose-h2:rounded-xl prose-h2:-mx-2
            prose-h2:border-l-4 prose-h2:border-primary
            prose-h2:shadow-sm prose-h2:transition-all hover:prose-h2:shadow-md
            
            prose-h3:text-2xl prose-h3:font-semibold prose-h3:mt-12 prose-h3:mb-6 
            prose-h3:text-primary prose-h3:flex prose-h3:items-center prose-h3:gap-2
            
            prose-p:text-lg prose-p:leading-relaxed prose-p:mb-6 prose-p:text-foreground/95
            prose-p:first-of-type:text-xl prose-p:first-of-type:font-medium prose-p:first-of-type:leading-relaxed
            
            prose-strong:font-bold prose-strong:text-primary 
            prose-strong:bg-primary/10 prose-strong:px-2 prose-strong:py-0.5 
            prose-strong:rounded-md prose-strong:shadow-sm
            
            prose-ul:my-8 prose-ul:space-y-4 prose-ul:pl-8
            prose-ol:my-8 prose-ol:space-y-4 prose-ol:pl-8
            prose-li:text-lg prose-li:leading-relaxed prose-li:text-foreground/95
            prose-li:marker:text-primary prose-li:marker:font-bold prose-li:marker:text-xl
            
            prose-blockquote:border-l-4 prose-blockquote:border-primary 
            prose-blockquote:bg-gradient-to-r prose-blockquote:from-primary/10 prose-blockquote:to-transparent
            prose-blockquote:pl-8 prose-blockquote:pr-8 prose-blockquote:py-6 prose-blockquote:my-10
            prose-blockquote:italic prose-blockquote:rounded-r-xl prose-blockquote:shadow-md
            
            prose-code:bg-muted/80 prose-code:text-primary prose-code:px-2.5 prose-code:py-1 
            prose-code:rounded-md prose-code:text-base prose-code:font-mono prose-code:font-semibold
            prose-code:border prose-code:border-primary/20
            
            prose-table:my-10 prose-table:border-collapse prose-table:w-full prose-table:shadow-lg prose-table:rounded-lg
            prose-th:bg-primary/20 prose-th:font-bold prose-th:text-left prose-th:py-4 prose-th:px-6 
            prose-th:border prose-th:border-border prose-th:text-lg
            prose-td:border prose-td:border-border prose-td:py-4 prose-td:px-6 prose-td:text-base
            prose-td:hover:bg-muted/50 prose-td:transition-colors
            
            prose-hr:border-2 prose-hr:border-primary/30 prose-hr:my-16
            
            prose-a:text-primary prose-a:font-semibold prose-a:underline 
            prose-a:decoration-primary/40 prose-a:decoration-2
            hover:prose-a:decoration-primary hover:prose-a:decoration-wavy">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {displayText}
            </ReactMarkdown>
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


