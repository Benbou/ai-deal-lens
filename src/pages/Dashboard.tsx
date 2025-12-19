import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Plus, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '@/components/ui/data-table';
import { Deal, createColumns } from './Dashboard/columns';

export default function Dashboard() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadDeals();

    // Subscribe to real-time updates on deals table
    const channel = supabase
      .channel('deals-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deals'
        },
        (payload) => {
          console.log('Deal updated:', payload);
          setDeals(prev => 
            prev.map(deal => 
              deal.id === payload.new.id ? { ...deal, ...payload.new } as Deal : deal
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadDeals = async () => {
    try {
      const { data, error } = await supabase
        .from('deals')
        .select('id, startup_name, company_name, sector, status, memo_html, sent_at, deck_files(storage_path, file_name)')
        .order('sent_at', { ascending: false, nullsFirst: false });

      if (error) throw error;

      setDeals((data || []) as Deal[]);
    } catch (error: any) {
      console.error('Error loading deals:', error);
      toast.error('Échec du chargement des deals');
    } finally {
      setLoading(false);
    }
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
      if (deal.deck_files && deal.deck_files.length > 0) {
        const filePaths = deal.deck_files.map(f => f.storage_path);
        const { error: storageError } = await supabase.storage
          .from('deck-files')
          .remove(filePaths);
        
        if (storageError) {
          console.error('Error deleting files from storage:', storageError);
        }
      }

      const { error: deleteError } = await supabase
        .from('deals')
        .delete()
        .eq('id', dealId);

      if (deleteError) throw deleteError;

      toast.success('Deal supprimé avec succès');
      await loadDeals();
    } catch (error: any) {
      console.error('Error deleting deal:', error);
      toast.error('Échec de la suppression du deal');
    } finally {
      setDeleting(null);
    }
  };

  const columns = useMemo(
    () => createColumns(
      (id) => navigate(`/deal/${id}`),
      handleDownloadDeck,
      handleDeleteDeal,
      deleting
    ),
    [navigate, deleting]
  );

  const statuses = [
    { label: "En cours", value: "pending", icon: BarChart3 },
    { label: "Analysé", value: "completed", icon: BarChart3 },
  ];

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

      <DataTable 
        columns={columns} 
        data={deals}
        searchKey="company_name"
        searchPlaceholder="Rechercher une entreprise..."
        facetedFilters={[
          {
            column: "status",
            title: "Status",
            options: statuses,
          },
        ]}
      />
    </div>
  );
}