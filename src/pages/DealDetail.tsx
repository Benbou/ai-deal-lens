import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Download, Trash2, Loader2, AlertCircle, CheckCircle2, Clock, Activity, TrendingUp, BarChart3, RefreshCw } from "lucide-react";
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { InvestmentMemoDisplay } from "@/components/InvestmentMemoDisplay";
import { DealChatDrawer } from '@/components/DealChatDrawer';

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
  status?: string | null;
  amount_raised_cents?: number | null;
  pre_money_valuation_cents?: number | null;
  current_arr_cents?: number | null;
  yoy_growth_percent?: number | null;
  mom_growth_percent?: number | null;
  solution_summary?: string | null;
  currency?: string;
  memo_content?: { markdown?: string } | null;
  error_message?: string | null;
  analyzed_at?: string | null;
  personal_notes?: string | null;
  deck_files?: DeckFile[];
}

const N8N_WEBHOOK_URL = 'https://n8n.alboteam.com/webhook/2551cfc4-1892-4926-9f17-746c9a51be71';

export default function DealDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [retrying, setRetrying] = useState(false);

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
      } finally {
        setLoading(false);
      }
    };

    load();

    // Subscribe to real-time updates on deals
    const dealChannel = supabase
      .channel(`deal-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'deals',
        filter: `id=eq.${id}`
      }, (payload) => {
        console.log('Deal update:', payload);
        if (payload.new) {
          setDeal(prev => prev ? { ...prev, ...payload.new } as Deal : null);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(dealChannel);
    };
  }, [id]);

  const formatCurrency = (cents?: number | null, currency?: string) => {
    if (!cents) return '-';
    const millions = cents / 100 / 1000000;
    const symbol = currency === 'USD' ? '$' : '€';
    return `${symbol}${millions.toFixed(1)}M`;
  };

  const handleRetryAnalysis = async () => {
    if (!id || !deal) return;
    
    setRetrying(true);
    
    try {
      // Reset status to pending
      await supabase
        .from('deals')
        .update({
          status: 'pending',
          error_message: null,
        })
        .eq('id', id);

      // Get the deck file to re-send
      const { data: deckFile } = await supabase
        .from('deck_files')
        .select('storage_path, file_name')
        .eq('deal_id', id)
        .single();

      if (!deckFile) {
        throw new Error('Deck file not found');
      }

      // Download the file from storage
      const { data: fileData, error: downloadError } = await supabase
        .storage
        .from('deck-files')
        .download(deckFile.storage_path);

      if (downloadError || !fileData) {
        throw new Error('Failed to download deck file');
      }

      // Create a File object from the blob
      const file = new File([fileData], deckFile.file_name, { type: 'application/pdf' });

      // Send to N8N
      const formData = new FormData();
      formData.append('file', file);
      formData.append('deal_id', id);
      formData.append('additional_context', deal.personal_notes || '');

      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`N8N analysis failed: ${response.status}`);
      }

      const n8nResponse = await response.json();

      // Update deal with response
      await supabase
        .from('deals')
        .update({
          company_name: n8nResponse.company_name || deal.startup_name,
          memo_content: { markdown: n8nResponse.memo_content },
          status: 'completed',
          analyzed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', id);

      toast.success('Analyse terminée avec succès');
    } catch (error: any) {
      console.error('Retry error:', error);
      
      await supabase
        .from('deals')
        .update({
          status: 'error',
          error_message: error.message || 'Unknown error',
        })
        .eq('id', id);

      toast.error('L\'analyse a échoué. Veuillez réessayer.');
    } finally {
      setRetrying(false);
    }
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
      const { data, error } = await supabase
        .storage
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
      if (deal.deck_files && deal.deck_files.length > 0) {
        const filePaths = deal.deck_files.map(f => f.storage_path);
        const { error: storageError } = await supabase
          .storage
          .from('deck-files')
          .remove(filePaths);
        
        if (storageError) {
          console.error('Error deleting files from storage:', storageError);
        }
      }

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

  const displayName = deal.company_name || deal.startup_name;
  const status = deal.status || 'pending';
  const isCompleted = status === 'completed';
  const isPending = status === 'pending';
  const isError = status === 'error';
  const memoMarkdown = deal.memo_content?.markdown || '';

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      {/* Header Section */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text">
            {displayName}
          </h1>
          <div className="flex gap-2 flex-wrap">
            <Badge className="hover:scale-110 transition-transform cursor-default">
              {deal.sector}
            </Badge>

            {deal.stage && (
              <Badge variant="outline" className="hover:scale-110 transition-transform cursor-default">
                {deal.stage}
              </Badge>
            )}

            {isPending && (
              <Badge className="bg-warning text-warning-foreground flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                <span>Analyse en cours...</span>
              </Badge>
            )}

            {isCompleted && (
              <Badge className="bg-success text-success-foreground flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3" />
                Analysé
              </Badge>
            )}

            {isError && (
              <Badge className="bg-destructive text-destructive-foreground flex items-center gap-2">
                <AlertCircle className="h-3 w-3" />
                Erreur
              </Badge>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <Button onClick={() => navigate(`/deal/${id}/workflow`)} variant="outline" className="hover:scale-105 transition-transform">
              <Activity className="mr-2 h-4 w-4" />
              Voir workflow
            </Button>
          )}

          {deal.deck_files?.[0] && (
            <Button onClick={handleDownloadDeck} variant="outline" className="hover:scale-105 transition-transform">
              <Download className="mr-2 h-4 w-4" />
              Télécharger le deck
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={deleting} className="hover:scale-105 transition-transform">
                <Trash2 className="mr-2 h-4 w-4" />
                Supprimer
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Êtes-vous sûr ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette action est irréversible. Cela supprimera définitivement le deal
                  et toutes les données associées.
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

      {/* Deal Information Card */}
      <Card className="p-6 hover:shadow-lg transition-shadow duration-300">
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Informations du Deal
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="group">
            <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Montant levé
            </p>
            <p className="text-xl font-semibold group-hover:text-primary transition-colors">
              {formatCurrency(deal.amount_raised_cents, deal.currency)}
            </p>
          </div>

          <div className="group">
            <p className="text-sm text-muted-foreground mb-1">Valorisation pré-money</p>
            <p className="text-xl font-semibold group-hover:text-primary transition-colors">
              {formatCurrency(deal.pre_money_valuation_cents, deal.currency)}
            </p>
          </div>

          {deal.current_arr_cents !== undefined && deal.current_arr_cents !== null && (
            <div className="group">
              <p className="text-sm text-muted-foreground mb-1">CA / ARR actuel</p>
              <p className="text-xl font-semibold group-hover:text-primary transition-colors">
                {formatCurrency(deal.current_arr_cents, deal.currency)}
              </p>
            </div>
          )}

          {deal.yoy_growth_percent !== undefined && deal.yoy_growth_percent !== null && (
            <div className="group">
              <p className="text-sm text-muted-foreground mb-1">Croissance YoY</p>
              <p className="text-xl font-semibold text-green-600 hover:scale-105 transition-transform">
                +{deal.yoy_growth_percent.toFixed(1)}%
              </p>
            </div>
          )}

          {deal.mom_growth_percent !== undefined && deal.mom_growth_percent !== null && (
            <div className="group">
              <p className="text-sm text-muted-foreground mb-1">Croissance MoM</p>
              <p className="text-xl font-semibold text-green-600 hover:scale-105 transition-transform">
                +{deal.mom_growth_percent.toFixed(1)}%
              </p>
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

      {/* Error State */}
      {isError && (
        <Card className="p-8 border-destructive bg-destructive/10 hover:shadow-xl transition-shadow">
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <div>
              <h3 className="text-xl font-semibold mb-2 text-destructive">
                Erreur lors de l'analyse
              </h3>
              {deal.error_message && (
                <p className="text-muted-foreground mb-4">
                  {deal.error_message}
                </p>
              )}
              <Button
                onClick={handleRetryAnalysis}
                disabled={retrying}
                variant="outline"
                className="hover:scale-105 transition-transform"
              >
                {retrying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyse en cours...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Réessayer l'analyse
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Pending State */}
      {isPending && (
        <Card className="p-12 text-center hover:shadow-xl transition-shadow">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <div>
              <h3 className="text-xl font-semibold mb-2">Analyse en cours</h3>
              <p className="text-muted-foreground">
                Le deck est en cours d'analyse. Cela peut prendre quelques minutes...
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Investment Memo Display */}
      {isCompleted && memoMarkdown && (
        <div className="max-w-4xl mx-auto">
          <article className="prose prose-lg dark:prose-invert max-w-none">
            <div className="flex items-center justify-between mb-6">
              <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight mb-0">
                Mémo d'Investissement
              </h1>
            </div>

            <InvestmentMemoDisplay
              memoMarkdown={memoMarkdown}
              dealData={{
                companyName: deal?.company_name,
                sector: deal?.sector,
                arr: deal?.current_arr_cents,
                yoyGrowth: deal?.yoy_growth_percent,
              }}
              isStreaming={false}
            />
          </article>
        </div>
      )}

      {/* No Memo State */}
      {isCompleted && !memoMarkdown && (
        <Card className="p-12 text-center">
          <div className="text-muted-foreground">
            <p>Aucun mémo disponible pour ce deal</p>
          </div>
        </Card>
      )}

      {/* Floating Chat Button */}
      <DealChatDrawer dealId={id || ''} companyName={displayName} />
    </div>
  );
}
