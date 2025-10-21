-- Create workflow_logs table for tracking edge function execution
CREATE TABLE public.workflow_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  step_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'success', 'error')),
  input jsonb,
  output jsonb,
  error_message text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.workflow_logs ENABLE ROW LEVEL SECURITY;

-- Users can view logs for their own deals
CREATE POLICY "Users can view own workflow logs"
ON public.workflow_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.deals
    WHERE deals.id = workflow_logs.deal_id
    AND deals.user_id = auth.uid()
  )
);

-- System can insert logs
CREATE POLICY "System can insert workflow logs"
ON public.workflow_logs
FOR INSERT
WITH CHECK (true);

-- System can update logs
CREATE POLICY "System can update workflow logs"
ON public.workflow_logs
FOR UPDATE
USING (true);

-- Create index for faster queries
CREATE INDEX idx_workflow_logs_deal_id ON public.workflow_logs(deal_id);
CREATE INDEX idx_workflow_logs_created_at ON public.workflow_logs(created_at DESC);