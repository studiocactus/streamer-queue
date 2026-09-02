-- Pendências e rejeições são parte da moderação privada do canal.
-- O público continua vendo itens liberados; o autor acompanha os próprios envios;
-- membros do canal continuam vendo tudo pela policy suggestions_select_member.
DROP POLICY IF EXISTS "suggestions_select_authenticated" ON public.suggestions;

CREATE POLICY "suggestions_select_own" ON public.suggestions
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND auth.uid() = submitted_by
  );
