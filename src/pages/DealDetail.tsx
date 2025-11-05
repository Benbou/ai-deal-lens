import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Download, Trash2, Loader2, AlertCircle, CheckCircle2, Clock, Search, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from 'sonner';
import { useStreamAnalysis } from '@/hooks/useStreamAnalysis';
import { useAuth } from '@/contexts/AuthContext';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { InvestmentMemoDisplay } from "@/components/InvestmentMemoDisplay";
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
  const {
    id
  } = useParams();
  const navigate = useNavigate();
  const {
    isAdmin
  } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const {
    streamingText,
    isStreaming,
    error,
    currentStatus,
    startAnalysis,
    reset
  } = useStreamAnalysis();
  const [showAIDetails, setShowAIDetails] = useState(false);
  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const {
          data: dealData
        } = await supabase.from('deals').select('*, deck_files(storage_path, file_name)').eq('id', id).single();
        setDeal(dealData as Deal);
        const {
          data: analysisData
        } = await supabase.from('analyses').select('*').eq('deal_id', id).order('created_at', {
          ascending: false
        }).limit(1).maybeSingle();
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
    const analysisChannel = supabase.channel(`analysis-${id}`).on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'analyses',
      filter: `deal_id=eq.${id}`
    }, payload => {
      console.log('Analysis update:', payload);
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        setAnalysis(payload.new as any);

        // If analysis just completed, reset streaming
        if (payload.new.status === 'completed') {
          reset();
        }
      }
    }).subscribe();

    // Subscribe to real-time updates on deals
    const dealChannel = supabase.channel(`deal-${id}`).on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'deals',
      filter: `id=eq.${id}`
    }, payload => {
      console.log('Deal update:', payload);
      if (payload.new) {
        setDeal(prev => prev ? {
          ...prev,
          ...payload.new
        } as Deal : null);
      }
    }).subscribe();
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
    return <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Chargement...</div>
      </div>;
  }
  if (!deal) {
    return <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Deal non trouvé</div>
      </div>;
  }
  const handleDownloadDeck = async () => {
    if (!deal?.deck_files?.[0]) return;
    try {
      const {
        data,
        error
      } = await supabase.storage.from('deck-files').createSignedUrl(deal.deck_files[0].storage_path, 60 * 60);
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
        const {
          error: storageError
        } = await supabase.storage.from('deck-files').remove(filePaths);
        if (storageError) {
          console.error('Error deleting files from storage:', storageError);
        }
      }

      // Delete the deal (cascade will handle related records)
      const {
        error: deleteError
      } = await supabase.from('deals').delete().eq('id', id);
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
  const displayText = isStreaming ? streamingText : analysis?.result?.full_text || '';
  return <div className="space-y-6 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">{displayName}</h1>
          <div className="flex gap-2 mt-2">
            <Badge>{deal.sector}</Badge>
            {deal.stage && <Badge variant="outline">{deal.stage}</Badge>}
            {isProcessing && <Badge className="bg-warning text-warning-foreground flex items-center gap-1">
                Analyse en cours
                <span className="animate-pulse">...</span>
              </Badge>}
            {isCompleted && <Badge className="bg-success text-success-foreground flex items-center gap-2 animate-fade-in">
                <CheckCircle2 className="h-3 w-3" />
                Analysé
              </Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          {isAdmin && <Button onClick={() => navigate(`/deal/${id}/workflow`)} variant="outline">
              <Activity className="mr-2 h-4 w-4" />
              Voir workflow
            </Button>}
          {deal.deck_files?.[0] && <Button onClick={handleDownloadDeck} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Télécharger le deck
            </Button>}
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
          {deal.current_arr_cents !== undefined && deal.current_arr_cents !== null && <div>
              <p className="text-sm text-muted-foreground mb-1">CA / ARR actuel</p>
              <p className="text-xl font-semibold">{formatCurrency(deal.current_arr_cents, deal.currency)}</p>
            </div>}
          {deal.yoy_growth_percent !== undefined && deal.yoy_growth_percent !== null && <div>
              <p className="text-sm text-muted-foreground mb-1">Croissance YoY</p>
              <p className="text-xl font-semibold text-green-600">+{deal.yoy_growth_percent.toFixed(1)}%</p>
            </div>}
          {deal.mom_growth_percent !== undefined && deal.mom_growth_percent !== null && <div>
              <p className="text-sm text-muted-foreground mb-1">Croissance MoM</p>
              <p className="text-xl font-semibold text-green-600">+{deal.mom_growth_percent.toFixed(1)}%</p>
            </div>}
        </div>
        {deal.solution_summary && <div className="mt-6 pt-6 border-t">
            <p className="text-sm text-muted-foreground mb-2">Résumé de la solution</p>
            <p className="text-base leading-relaxed">{deal.solution_summary}</p>
          </div>}
      </Card>

      {error && <Card className="p-8 border-destructive bg-destructive/10">
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
              <Button onClick={() => {
            reset();
            if (id) startAnalysis(id);
          }} variant="outline">
                Réessayer l'analyse
              </Button>
            </div>
          </div>
        </Card>}

      {!error && (isDealProcessing || isStreaming) && !displayText && <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <div>
              <h3 className="text-xl font-semibold mb-2">Analyse en cours</h3>
              {currentStatus && <div className="flex items-center justify-center gap-2 mb-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-medium text-primary">{currentStatus}</span>
                </div>}
              <p className="text-muted-foreground">
                Notre IA analyse le deck en détail. Cela peut prendre quelques minutes...
              </p>
            </div>
          </div>
        </Card>}

      {(isStreaming || isCompleted) && displayText && <div className="max-w-4xl mx-auto">
          <article className="prose prose-lg dark:prose-invert max-w-none">
            <div className="flex items-center justify-between mb-6">
              <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight mb-0">
                Mémo d'Investissement
              </h1>
              {isStreaming && <Badge className="bg-primary animate-pulse flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Génération en cours...
                </Badge>}
            </div>
            {currentStatus && isStreaming && <p className="text-sm text-muted-foreground mb-6">{currentStatus}</p>}
            
            <InvestmentMemoDisplay 
              memoMarkdown={displayText}
              dealData={{
                companyName: deal?.company_name,
                sector: deal?.sector,
                arr: deal?.current_arr_cents,
                yoyGrowth: deal?.yoy_growth_percent,
              }}
              isStreaming={isStreaming}
            />
          </article>
        </div>}

      {isAdmin && (isStreaming || isCompleted) && analysis?.result && <div className="max-w-4xl mx-auto mt-12 pt-8 border-t">
          <details open={showAIDetails} onToggle={(e) => setShowAIDetails((e.target as HTMLDetailsElement).open)}>
            <summary className="cursor-pointer text-lg font-semibold mb-4 list-none flex items-center justify-between">
              <span>Réflexion de l'IA</span>
              <span className="text-sm text-muted-foreground">{showAIDetails ? 'Cliquer pour masquer' : 'Cliquer pour afficher'}</span>
            </summary>
            
            <div className="space-y-6 pt-4">
              {/* Métadonnées */}
              {analysis.result.metadata && <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {analysis.result.metadata.iterations && <div>
                      <p className="text-sm text-muted-foreground">Itérations Claude</p>
                      <p className="text-lg font-semibold">{analysis.result.metadata.iterations}</p>
                    </div>}
                  {analysis.result.metadata.total_tokens && <div>
                      <p className="text-sm text-muted-foreground">Tokens utilisés</p>
                      <p className="text-lg font-semibold">{analysis.result.metadata.total_tokens.toLocaleString()}</p>
                    </div>}
                  {analysis.result.metadata.linkup_searches_count !== undefined && <div>
                      <p className="text-sm text-muted-foreground">Recherches Linkup</p>
                      <p className="text-lg font-semibold">{analysis.result.metadata.linkup_searches_count}</p>
                    </div>}
                  {analysis.result.metadata.processing_time_ms && <div>
                      <p className="text-sm text-muted-foreground">Temps de traitement</p>
                      <p className="text-lg font-semibold">{(analysis.result.metadata.processing_time_ms / 1000).toFixed(1)}s</p>
                    </div>}
                </div>}

              {/* Recherches Linkup */}
              {analysis.result.linkup_searches && analysis.result.linkup_searches.length > 0 && <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    Recherches Web ({analysis.result.linkup_searches.length})
                  </h4>
                  <div className="space-y-3">
                    {analysis.result.linkup_searches.map((search: any, idx: number) => <div key={idx} className="border-l-2 border-primary pl-4 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-sm flex-1">{search.query}</p>
                          <Badge variant="outline" className="text-xs shrink-0">{search.depth}</Badge>
                        </div>
                        {search.timestamp && <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(search.timestamp), {
                        addSuffix: true,
                        locale: fr
                      })}
                          </p>}
                      </div>)}
                  </div>
                </div>}

              {/* Statut détaillé */}
              {analysis.result.status && <div className="border-l-2 pl-4 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    {analysis.result.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-success" />}
                    {analysis.result.status === 'processing' && <Clock className="h-4 w-4 text-warning" />}
                    {analysis.result.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
                    <span className="font-medium capitalize">{analysis.result.status}</span>
                  </div>
                  {analysis.updated_at && <p className="text-xs text-muted-foreground">
                      Mis à jour {formatDistanceToNow(new Date(analysis.updated_at), {
                addSuffix: true,
                locale: fr
              })}
                    </p>}
                </div>}
            </div>
          </details>
        </div>}

      {!isProcessing && !isCompleted && <Card className="p-12 text-center">
          <div className="text-muted-foreground">
            <p>L'analyse n'a pas encore démarré</p>
          </div>
        </Card>}
    </div>;
}