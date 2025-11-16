import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AnalysisProgress {
  id: string;
  deal_id: string;
  status: string | null;
  progress_percent: number | null;
  current_step: string | null;
  quick_context: any;
  result: any;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export function useAnalysisRealtime(dealId: string) {
  const [analysis, setAnalysis] = useState<AnalysisProgress | null>(null);

  useEffect(() => {
    if (!dealId) return;

    // Fetch initial state
    const fetchInitial = async () => {
      const { data } = await supabase
        .from('analyses')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setAnalysis(data);
      }
    };

    fetchInitial();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`analysis-${dealId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'analyses',
          filter: `deal_id=eq.${dealId}`
        },
        (payload) => {
          console.log('[REALTIME] Analysis update:', payload.new);
          setAnalysis(payload.new as AnalysisProgress);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'analyses',
          filter: `deal_id=eq.${dealId}`
        },
        (payload) => {
          console.log('[REALTIME] Analysis created:', payload.new);
          setAnalysis(payload.new as AnalysisProgress);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dealId]);

  return analysis;
}
