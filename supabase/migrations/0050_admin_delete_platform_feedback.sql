-- Apenas administradores da plataforma podem remover feedbacks enviados pelos usuários.
create policy "Admins can delete platform feedback" on public.platform_feedback
  for delete using (public.is_platform_admin(auth.uid()));
