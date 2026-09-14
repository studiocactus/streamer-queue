-- The dashboard and channel RLS policies call this helper as authenticated.
-- It checks auth.uid() internally and grants no access to other channels.
grant execute on function public.can_manage_streamer(uuid) to authenticated;
