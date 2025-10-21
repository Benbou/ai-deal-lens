import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

export async function logWorkflowStep(
  supabase: SupabaseClient,
  dealId: string,
  stepName: string,
  status: 'pending' | 'running' | 'success' | 'error',
  data?: {
    input?: any;
    output?: any;
    error_message?: string;
    duration_ms?: number;
  }
) {
  const now = new Date().toISOString();
  
  const logData = {
    deal_id: dealId,
    step_name: stepName,
    status,
    input: data?.input || null,
    output: data?.output || null,
    error_message: data?.error_message || null,
    started_at: now,
    completed_at: status === 'success' || status === 'error' ? now : null,
    duration_ms: data?.duration_ms || null,
  };

  const { error } = await supabase
    .from('workflow_logs')
    .insert(logData);

  if (error) {
    console.error('Failed to log workflow step:', error);
  }
}
