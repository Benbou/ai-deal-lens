-- Add traction metrics to deals table
ALTER TABLE deals 
ADD COLUMN current_arr_cents INTEGER,
ADD COLUMN yoy_growth_percent NUMERIC(5,2),
ADD COLUMN mom_growth_percent NUMERIC(5,2);

COMMENT ON COLUMN deals.current_arr_cents IS 'Current Annual Recurring Revenue or CA in cents';
COMMENT ON COLUMN deals.yoy_growth_percent IS 'Year-over-Year growth percentage (e.g., 150.5 for 150.5%)';
COMMENT ON COLUMN deals.mom_growth_percent IS 'Month-over-Month growth percentage (e.g., 25.3 for 25.3%)';