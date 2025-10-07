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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">My Deals</h1>
            <p className="text-muted-foreground">Track and analyze your investment opportunities</p>
          </div>
          <Button onClick={() => navigate('/submit')}>
            <Plus className="mr-2 h-4 w-4" />
            Submit Deal
          </Button>
        </div>

        <div className="grid gap-4">
          {deals.map((deal) => {
            const latestAnalysis = deal.analyses?.[0];
            const analysisStatus = latestAnalysis?.status || 'pending';
            const displayName = deal.company_name || deal.startup_name;
            
            return (
              <Card key={deal.id} className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 
                        className="text-lg font-semibold hover:underline cursor-pointer"
                        onClick={() => navigate(`/deal/${deal.id}`)}
                      >
                        {displayName}
                      </h3>
                      <Badge variant="outline">{deal.sector}</Badge>
                      {deal.stage && <Badge variant="outline">{deal.stage}</Badge>}
                      {getStatusBadge(analysisStatus)}
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div className="flex gap-4">
                        <span>Amount: {formatCurrency(deal.amount_raised_cents)}</span>
                        <span>Valuation: {formatCurrency(deal.pre_money_valuation_cents)}</span>
                      </div>
                      {deal.solution_summary && (
                        <div className="text-xs mt-2 line-clamp-2">{deal.solution_summary}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
                            <p>{t('downloadDeck')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {analysisStatus === 'completed' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(`/deal/${deal.id}`)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}