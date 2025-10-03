-- Create storage bucket for deck files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('deck-files', 'deck-files', false, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for deck files
CREATE POLICY "Users can upload own deck files" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'deck-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view own deck files" ON storage.objects
FOR SELECT USING (
  bucket_id = 'deck-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Admins can view all deck files" ON storage.objects
FOR SELECT USING (
  bucket_id = 'deck-files' AND
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);