-- Perfil público estendido do streamer.
ALTER TABLE public.streamers
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}'::JSONB;

-- Bucket público para capas dos canais.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'streamer-assets',
  'streamer-assets',
  TRUE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "streamer_assets_insert_owner" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'streamer-assets'
    AND EXISTS (
      SELECT 1 FROM public.streamers
      WHERE owner_id = auth.uid()
        AND id::TEXT = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "streamer_assets_update_owner" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'streamer-assets'
    AND EXISTS (
      SELECT 1 FROM public.streamers
      WHERE owner_id = auth.uid()
        AND id::TEXT = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "streamer_assets_delete_owner" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'streamer-assets'
    AND EXISTS (
      SELECT 1 FROM public.streamers
      WHERE owner_id = auth.uid()
        AND id::TEXT = (storage.foldername(name))[1]
    )
  );
