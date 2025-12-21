-- Create analysis_requests table for tracking analysis status
CREATE TABLE IF NOT EXISTS public.analysis_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'cancelled', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  company_name TEXT,
  deck_filename TEXT
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_analysis_requests_status ON public.analysis_requests(status);

-- Enable RLS with permissive policy for N8N access
ALTER TABLE public.analysis_requests ENABLE ROW LEVEL SECURITY;

-- Policy permettant toutes les opérations (nécessaire pour N8N)
CREATE POLICY "Allow all operations on analysis_requests" 
ON public.analysis_requests
FOR ALL 
USING (true)
WITH CHECK (true);

-- Trigger pour mettre à jour updated_at automatiquement
CREATE TRIGGER update_analysis_requests_updated_at 
    BEFORE UPDATE ON public.analysis_requests 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();