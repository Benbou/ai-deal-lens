-- Add sent_at column to track when deals were submitted/received
ALTER TABLE deals ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;