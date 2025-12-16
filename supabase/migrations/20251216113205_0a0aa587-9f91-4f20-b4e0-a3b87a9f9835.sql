-- Add memo_html column to store the complete HTML memo from N8N
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS memo_html text;

-- Add comment for documentation
COMMENT ON COLUMN public.deals.memo_html IS 'Complete HTML memo from N8N workflow analysis';