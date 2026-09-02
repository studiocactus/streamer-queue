-- Keep cover uploads lightweight while accepting the common web formats.
update storage.buckets
set
  file_size_limit = 1048576,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'streamer-assets';

