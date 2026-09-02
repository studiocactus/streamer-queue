-- Storage upserts require SELECT in addition to INSERT and UPDATE. Restrict it
-- to the owner whose streamer ID is the first folder in the object path.
drop policy if exists "streamer_assets_select_owner" on storage.objects;
create policy "streamer_assets_select_owner" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'streamer-assets'
    and exists (
      select 1 from public.streamers
      where owner_id = auth.uid()
        and id::text = (storage.foldername(name))[1]
    )
  );

