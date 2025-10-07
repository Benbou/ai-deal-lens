-- Remove unused columns from deals table
ALTER TABLE public.deals DROP COLUMN IF EXISTS risk_score;
ALTER TABLE public.deals DROP COLUMN IF EXISTS valuation_gap_percent;
ALTER TABLE public.deals DROP COLUMN IF EXISTS maturity_level;

-- Clear all existing data
DELETE FROM public.investment_kpis;
DELETE FROM public.notes;
DELETE FROM public.analyses;
DELETE FROM public.deck_files;
DELETE FROM public.deals;