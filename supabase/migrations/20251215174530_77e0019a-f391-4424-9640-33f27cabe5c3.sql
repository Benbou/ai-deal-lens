-- Add columns for N8N integration
ALTER TABLE deals 
  ADD COLUMN IF NOT EXISTS memo_content JSONB,
  ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS error_message TEXT;