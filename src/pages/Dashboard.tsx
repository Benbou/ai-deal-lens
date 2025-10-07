import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Eye, Plus, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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

interface Deal {
  id: string;
  startup_name: string;
  company_name?: string;
  sector: string;
  stage?: string;
  amount_raised_cents?: number;
  pre_money_valuation_cents?: number;
  status: string;
  solution_summary?: string;
  deck_files?: { storage_path: string; file_name: string }[];
  analyses?: { status: string }[];
}

export default function Dashboard() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    loadDeals();
  }, []);

  const loadDeals = async () => {
    try {
      const { data, error } = await supabase
        .from('deals')
        .select('*, deck_files(storage_path, file_name), analyses(status)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setDeals(data || []);
    } catch (error: any) {
      console.error('Error loading deals:', error);
      toast.error('Échec du chargement des deals');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents?: number) => {
    if (!cents) return '-';
    const millions = cents / 100 / 1000000;
    return `€${millions.toFixed(1)}M`;
  };

  const handleDownloadDeck = async (deal: Deal, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!deal.deck_files?.[0]) return;
    
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

  const handleDeleteDeal = async (dealId: string, deal: Deal) => {
    setDeleting(dealId);
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
        .eq('id', dealId);

      if (deleteError) throw deleteError;

      toast.success('Deal supprimé avec succès');
      
      // Reload deals
      await loadDeals();
    } catch (error: any) {
      console.error('Error deleting deal:', error);
      toast.error('Échec de la suppression du deal');
    } finally {
      setDeleting(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      processing: { label: t('analyzing'), className: 'bg-primary' },
      completed: { label: t('completed'), className: 'bg-success' },
      failed: { label: t('failed'), className: '' },
    };
    
    const statusInfo = statusMap[status] || { label: status, className: '' };
    
    return (
      <Badge variant={status === 'failed' ? 'destructive' : 'default'} className={statusInfo.className}>
        {statusInfo.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold">Mes Deals</h1>
            <p className="text-muted-foreground">Suivez et analysez vos opportunités d'investissement</p>
          </div>
          <Button onClick={() => navigate('/submit')}>
            <Plus className="mr-2 h-4 w-4" />
            Soumettre un Deal
          </Button>
        </div>

        {deals.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">Aucun deal pour le moment</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Header Row */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/50 rounded-lg text-sm font-medium">
              <div className="col-span-3">Entreprise</div>
              <div className="col-span-1">Secteur</div>
              <div className="col-span-1">Stage</div>
              <div className="col-span-2">Montant levé</div>
              <div className="col-span-2">Valorisation</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>

            {/* Data Rows */}
            {deals.map((deal) => {
              const latestAnalysis = deal.analyses?.[0];
              const analysisStatus = latestAnalysis?.status || 'pending';
              const displayName = deal.company_name || deal.startup_name;
              
              return (
                <Card key={deal.id} className="hover:shadow-md transition-shadow">
                  <div className="grid grid-cols-12 gap-4 px-6 py-4 items-center">
                    {/* Company Name + Summary */}
                    <div className="col-span-3">
                      <h3 
                        className="text-base font-semibold hover:underline cursor-pointer mb-1"
                        onClick={() => navigate(`/deal/${deal.id}`)}
                      >
                        {displayName}
                      </h3>
                      {deal.solution_summary && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {deal.solution_summary}
                        </p>
                      )}
                    </div>

                    {/* Sector */}
                    <div className="col-span-1">
                      <Badge variant="outline" className="text-xs">{deal.sector}</Badge>
                    </div>

                    {/* Stage */}
                    <div className="col-span-1">
                      {deal.stage && <Badge variant="outline" className="text-xs">{deal.stage}</Badge>}
                    </div>

                    {/* Amount Raised */}
                    <div className="col-span-2">
                      <p className="text-sm font-medium">{formatCurrency(deal.amount_raised_cents)}</p>
                    </div>

                    {/* Valuation */}
                    <div className="col-span-2">
                      <p className="text-sm font-medium">{formatCurrency(deal.pre_money_valuation_cents)}</p>
                    </div>

                    {/* Status */}
                    <div className="col-span-2">
                      <Badge 
                        className={
                          deal.status === 'completed' ? 'bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]' : 
                          deal.status === 'processing' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 
                          'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]'
                        }
                      >
                        {deal.status === 'completed' && t('dashboard.status.completed')}
                        {deal.status === 'processing' && t('dashboard.status.analyzing')}
                        {deal.status === 'pending' && t('dashboard.status.pending')}
                      </Badge>
                    </div>

                    {/* Actions */}
                    <div className="col-span-1 flex items-center justify-end gap-2">
                      {deal.deck_files?.[0] && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={(e) => handleDownloadDeck(deal, e)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Télécharger le deck</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/deal/${deal.id}`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Voir les détails</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={deleting === deal.id}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
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
                            <AlertDialogAction 
                              onClick={() => handleDeleteDeal(deal.id, deal)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Supprimer définitivement
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
    </div>
  );
}