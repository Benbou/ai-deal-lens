import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from "@/components/ui/button";
import { Download, Trash2 } from "lucide-react";
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import AnalysisLoader from '@/components/AnalysisLoader';
interface DeckFile {
  storage_path: string;
  file_name: string;
}

interface Deal {
  id: string;
  startup_name: string;
  company_name?: string | null;
  status?: string | null;
  memo_html?: string | null;
  sent_at?: string | null;
  deck_files?: DeckFile[];
}

// Format date for display
const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).replace(' ', ' à ');
};

export default function DealDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      try {
        const { data: dealData } = await supabase
          .from('deals')
          .select('id, startup_name, company_name, status, memo_html, sent_at, deck_files(storage_path, file_name)')
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
  const hasMemoHtml = !!deal.memo_html;

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">{displayName}</h1>
          {deal.sent_at && (
            <p className="text-sm text-muted-foreground mt-1">
              Reçu le {formatDate(deal.sent_at)}
            </p>
          )}
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

      {/* Memo Content */}
      {isCompleted && hasMemoHtml ? (
        <div 
          className="memo-container bg-white rounded-lg shadow overflow-hidden"
          dangerouslySetInnerHTML={{ __html: deal.memo_html! }} 
        />
      ) : (
        <AnalysisLoader />
      )}
    </div>
  );
}