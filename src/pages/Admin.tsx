import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DataTable } from "@/components/ui/data-table";
import { Deal, createColumns } from "@/pages/Dashboard/columns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Admin() {
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    // Redirect non-admins
    if (!authLoading && !isAdmin) {
      navigate("/dashboard");
      return;
    }

    if (!authLoading && isAdmin) {
      loadAllDeals();
    }
  }, [isAdmin, authLoading, navigate]);

  const loadAllDeals = async () => {
    try {
      const { data, error } = await supabase
        .from("deals")
        .select("*, deck_files(storage_path, file_name), analyses(status)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDeals(data as Deal[] || []);
    } catch (error) {
      console.error("Error loading deals:", error);
      toast.error("Erreur lors du chargement des deals");
    } finally {
      setLoading(false);
    }
  };

  const handleView = (id: string) => {
    navigate(`/deal/${id}`);
  };

  const handleDownload = async (deal: Deal, e: React.MouseEvent) => {
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
      console.error('Error downloading deck:', error);
      toast.error('Erreur lors du téléchargement');
    }
  };

  const handleDelete = async (dealId: string, deal: Deal) => {
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

      const { error } = await supabase.from("deals").delete().eq("id", dealId);
      if (error) throw error;
      
      setDeals(deals.filter((d) => d.id !== dealId));
      toast.success("Deal supprimé");
    } catch (error) {
      console.error("Error deleting deal:", error);
      toast.error("Erreur lors de la suppression");
    } finally {
      setDeleting(null);
    }
  };

  const columns = createColumns(handleView, handleDownload, handleDelete, deleting);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Administration</h1>
        <p className="text-muted-foreground mt-2">
          Vue d'ensemble de tous les deals de la plateforme
        </p>
      </div>

      <DataTable columns={columns} data={deals} />
    </div>
  );
}
