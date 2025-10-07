-- Add structured data fields to deals table
ALTER TABLE deals 
ADD COLUMN IF NOT EXISTS company_name TEXT,
ADD COLUMN IF NOT EXISTS solution_summary TEXT;

-- Remove deprecated fields from display (keep for backward compat but will no longer populate)
-- maturity_level, risk_score, valuation_gap_percent will remain but not be actively used