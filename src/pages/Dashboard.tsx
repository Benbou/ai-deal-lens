import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Eye, Plus, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
  const navigate = useNavigate();
  const { toast } = useToast();
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
    } catch (error) {
      console.error('Error loading deals:', error);
      toast({
        title: 'Error',
        description: 'Failed to load deals',
        variant: 'destructive',
      });
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
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to download deck',
        variant: 'destructive',
      });
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
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-full overflow-x-hidden">
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
              <div className="col-span-2">Secteur / Stage</div>
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

                    {/* Sector / Stage */}
                    <div className="col-span-2 space-y-1">
                      <Badge variant="outline" className="text-xs">{deal.sector}</Badge>
                      {deal.stage && <Badge variant="outline" className="text-xs ml-1">{deal.stage}</Badge>}
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
                    <Badge 
                      className={
                        deal.status === 'completed' ? 'bg-success text-success-foreground' : 
                        deal.status === 'processing' ? 'bg-primary text-primary-foreground' : 
                        'bg-destructive text-destructive-foreground'
                      }
                    >
                      {deal.status === 'completed' && t('dashboard.status.completed')}
                      {deal.status === 'processing' && t('dashboard.status.analyzing')}
                      {deal.status === 'pending' && t('dashboard.status.pending')}
                    </Badge>

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
                              <p>{t('common.downloadDeck')}</p>
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
                            <p>{t('common.view')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}