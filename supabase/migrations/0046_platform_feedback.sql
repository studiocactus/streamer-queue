create table if not exists public.platform_feedback (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete set null,
  message text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.platform_feedback enable row level security;

create policy "Users can insert their own feedback" on public.platform_feedback
  for insert with check (auth.uid() = user_id);

create policy "Admins can view all feedback" on public.platform_feedback
  for select using (public.is_platform_admin(auth.uid()));
