-- Permite que apenas o dono do canal exclua sugestões definitivamente.
-- Rejeitar continua sendo a alternativa reversível para moderadores.
CREATE POLICY "suggestions_delete_owner" ON public.suggestions
  FOR DELETE USING (
    auth.uid() IS NOT NULL
    AND public.is_streamer_owner(streamer_id, auth.uid())
  );
