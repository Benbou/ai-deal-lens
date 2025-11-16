-- Add quick_context column to analyses table
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS quick_context JSONB;

-- Add index for quick_context queries
CREATE INDEX IF NOT EXISTS idx_analyses_quick_context ON public.analyses USING GIN (quick_context);

-- Update RLS policies (already covered by existing policies)