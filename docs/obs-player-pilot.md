# Player OBS — versão liberada

O player está disponível na Central do dashboard normal para streamers e moderadores autorizados. A ativação continua opcional por canal. O usuário confirmou o funcionamento no OBS e aprovou a versão final após os ajustes de apresentação.

## Teste no OBS antes da liberação geral
1. Fora de uma live, entre na Central pelo endereço de teste e configure o player. O link é privado e revogável: não publique em capturas nem envie para viewers.
2. Adicione uma Fonte de navegador em 1920 × 1080, cole o link e ative “Controlar áudio via OBS”. Configure monitoramento conforme a saída de áudio, evitando captura duplicada.
3. Coloque dois vídeos curtos e incorporáveis do YouTube na fila. O teste altera os estados desses itens normalmente e pode disparar as mensagens configuradas do bot; faça em um canal de teste ou com essas mensagens desativadas pelo responsável.
4. Reproduza pelo painel. Verifique áudio, título e tempo. O item só deve virar Assistindo depois da confirmação do player.
5. Pause: o tempo deve parar e a fila não avançar. Continue: deve manter a posição.
6. Ative o automático com intervalo de 3 segundos. Ao terminar, deve haver uma única conclusão e contagem regressiva antes do próximo.
7. Cancele durante a contagem; desligue o automático durante reprodução; esvazie a fila. Nenhuma dessas ações deve iniciar outro vídeo involuntariamente.
8. Teste vídeo com incorporação bloqueada, fonte duplicada, troca de cenas, perda de conexão e atualização da fonte. Falhas interrompem o automático. Após recarregar ou perder a concessão de conexão, continuar exige comando do responsável.
9. Se houver bloqueio de autoplay, use Interagir na fonte e o botão de ativação. Confirme que a liberação de áudio funciona nessa instalação do OBS.
10. Parar sem concluir devolve à fila somente o item ainda Assistindo. Regenerar o link invalida a fonte anterior.

## Arquitetura e limites
- Fonte separada `/obs-player`, sem login de usuário no navegador do OBS. O segredo fica no fragmento e é enviado somente ao RPC da sessão; não aparece em consultas públicas, URLs de rede ou referrer.
- Gestores autorizados pelo `can_manage_streamer` controlam o canal. A tabela não tem leitura direta para usuários ou anônimos. Uma concessão de 10 segundos impede duas fontes controlando simultaneamente. Token é uma capacidade: quem o possui pode observar e confirmar eventos dessa sessão, portanto deve permanecer privado.
- Comandos e eventos são serializados por linha, com revisão e geração de vídeo. Mensagens antigas não concluem o próximo item. Eventos duplicados não criam histórico duplicado.
- O modo automático começa desligado. Intervalo é aplicado a transições futuras. Reconexões pausam e desligam o automático. Falha de comunicação local pausa o vídeo.
- API oficial de iframe, controles visíveis, informações fora do vídeo. O tempo na fonte é posição/duração do player; não muda a definição do relatório diário (duração original dos concluídos).
- O player segue a fila existente. Conteúdo não compatível com YouTube interrompe a sequência para decisão do streamer, sem pular ou rejeitar silenciosamente.
- Não extrai mídia nem contorna anúncios, restrições ou bloqueios do YouTube. Transmissões ao vivo do YouTube podem não ter duração finita e não são adequadas ao teste de avanço automático.
- Receptor consulta a sessão a cada segundo; painel a cada dois segundos enquanto montado. Avaliar consumo e latência no piloto antes de ampliar.

## Validação executada
Testes em PostgreSQL isolado: escopo por canal, token inválido/revogado, leitura privada, fonte única, confirmação de início, fim único, revisão antiga, intervalo, fila vazia, pausa/cancelamento, falha, reconexão e URLs inválidas. Suíte de regressão: 90 testes passaram. Simulação no navegador com o componente real confirmou criação do player, contador e troca após intervalo; ela não verifica codec, áudio, cookies ou autoplay do OBS.

Validação no OBS confirmada pelo usuário. Versão final: ícones na faixa inferior, nome público do remetente, progresso e tempo restante. A consulta retorna somente o nome de apresentação, sem dados privados do perfil.
