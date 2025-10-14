-- Add dust_conversation_url field to analyses table
ALTER TABLE public.analyses 
ADD COLUMN dust_conversation_url text;