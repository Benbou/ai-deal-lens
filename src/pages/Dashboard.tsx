import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, TrendingUp, Loader2, Eye, RefreshCw, Archive } from 'lucide-react';
import { OnboardingModal } from '@/components/OnboardingModal';
import { formatDistanceToNow } from 'date-fns';

interface DeckFile {
  storage_path: string;
  file_name: string;
}

interface Deal {
  id: string;
  startup_name: string;
  amount_raised_cents: number | null;
  pre_money_valuation_cents: number | null;
  valuation_gap_percent: number | null;
  sector: string;
  maturity_level: string | null;
  risk_score: number | null;
  status: string;
  created_at: string;
  deck_files?: DeckFile[];
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);

  useEffect(() => {
    checkProfile();
  }, [user]);

  useEffect(() => {
    if (profileChecked) {
      loadDeals();
    }
  }, [profileChecked]);

  const checkProfile = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('name, investment_focus')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      
      // Show onboarding if name is just the email (auto-generated)
      if (!data.name || data.name === user.email) {
        setShowOnboarding(true);
      }
      setProfileChecked(true);
    } catch (error) {
      console.error('Error checking profile:', error);
      setProfileChecked(true);
    }
  };

  const loadDeals = async () => {
    try {
      const { data, error } = await supabase
        .from('deals')
        .select('*, deck_files(storage_path, file_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDeals(data || []);
    } catch (error) {
      console.error('Error loading deals:', error);
    } finally {
      setLoading(false);
    }
  };

  const openDeck = async (storagePath: string) => {
    const { data } = await supabase.storage
      .from('deck-files')
      .createSignedUrl(storagePath, 60 * 60);
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank', 'noopener');
    }
  };

  const formatCurrency = (cents: number | null) => {
    if (!cents) return '-';
    return `€${(cents / 100 / 1000).toFixed(1)}M`;
  };

  const getValuationGapBadge = (gap: number | null) => {
    if (!gap) return <Badge variant="outline">-</Badge>;
    if (gap > 30) return <Badge className="bg-danger">{gap.toFixed(1)}% above</Badge>;
    if (gap < -15) return <Badge className="bg-success">{gap.toFixed(1)}% below</Badge>;
    return <Badge className="bg-warning">{gap.toFixed(1)}% at market</Badge>;
  };

  const getRiskScoreDots = (score: number | null) => {
    if (!score) return <span className="text-muted-foreground">-</span>;
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className={`h-2 w-2 rounded-full ${i <= score ? 'bg-primary' : 'bg-muted'}`}
          />
        ))}
      </div>
    );
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { className: string; label: string }> = {
      pending: { className: 'bg-muted text-muted-foreground', label: 'Pending' },
      analyzing: { className: 'bg-warning text-warning-foreground', label: 'Analyzing...' },
      completed: { className: 'bg-success text-success-foreground', label: 'Completed' },
      failed: { className: 'bg-destructive text-destructive-foreground', label: 'Failed' },
    };
    const config = variants[status] || variants.pending;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const filteredDeals = deals.filter(deal =>
    deal.startup_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    deal.sector.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="text-sm text-muted-foreground">
          Analyse en cours… Cela peut prendre 2–3 minutes pendant que nous traitons le deck.
        </div>
      </div>
    );
  }

  return (
    <>
      <OnboardingModal open={showOnboarding} onComplete={() => setShowOnboarding(false)} />

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold">My Deals</h1>
            <p className="text-muted-foreground mt-2">
              Track and analyze your investment opportunities
            </p>
          </div>
          <Button onClick={() => navigate('/submit')} size="lg">
            <FileText className="mr-2 h-5 w-5" />
            Submit Deal
          </Button>
        </div>

        {deals.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-2xl font-semibold mb-2">No deals yet</h2>
            <p className="text-muted-foreground mb-6">
              Submit your first investment deck to get AI-powered insights
            </p>
            <Button onClick={() => navigate('/submit')}>
              Submit Your First Deal
            </Button>
          </Card>
        ) : (
          <>
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search deals by name or sector..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr className="border-b">
                    <th className="text-left p-4 font-semibold">Startup</th>
                    <th className="text-left p-4 font-semibold">Amount Raised</th>
                    <th className="text-left p-4 font-semibold">Valuation</th>
                    <th className="text-left p-4 font-semibold">Gap</th>
                    <th className="text-left p-4 font-semibold">Sector</th>
                    <th className="text-left p-4 font-semibold">Maturity</th>
                    <th className="text-left p-4 font-semibold">Risk</th>
                    <th className="text-left p-4 font-semibold">Status</th>
                    <th className="text-left p-4 font-semibold">Submitted</th>
                    <th className="text-right p-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeals.map(deal => (
                    <tr key={deal.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-4 font-medium">{deal.startup_name}</td>
                      <td className="p-4">{formatCurrency(deal.amount_raised_cents)}</td>
                      <td className="p-4">{formatCurrency(deal.pre_money_valuation_cents)}</td>
                      <td className="p-4">{getValuationGapBadge(deal.valuation_gap_percent)}</td>
                      <td className="p-4">
                        <Badge variant="outline">{deal.sector}</Badge>
                      </td>
                      <td className="p-4">{deal.maturity_level || '-'}</td>
                      <td className="p-4">{getRiskScoreDots(deal.risk_score)}</td>
                      <td className="p-4">{getStatusBadge(deal.status)}</td>
                      <td className="p-4 text-muted-foreground text-sm">
                        {formatDistanceToNow(new Date(deal.created_at), { addSuffix: true })}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2 justify-end items-center">
                          {deal.deck_files?.[0]?.storage_path && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => { e.stopPropagation(); openDeck(deal.deck_files![0].storage_path); }}
                            >
                              Télécharger
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(`/deals/${deal.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
