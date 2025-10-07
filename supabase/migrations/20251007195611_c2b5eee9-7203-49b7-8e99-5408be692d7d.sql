-- Ensure full row data is captured for realtime updates
ALTER TABLE public.analyses REPLICA IDENTITY FULL;