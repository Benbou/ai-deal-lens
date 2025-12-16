-- Add recommandation column to store GO/NO GO/GO Conditionnel
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS recommandation text;

-- Add comment for documentation
COMMENT ON COLUMN public.deals.recommandation IS 'Investment recommendation: GO, NO GO, GO Conditionnel';