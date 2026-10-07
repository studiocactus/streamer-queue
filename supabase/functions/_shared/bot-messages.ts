export const SYSTEM_BOT_MESSAGES = {
  chat_suggestion_received: { label: 'Sugestão recebida pelo chat', template: '{viewer}, “{titulo}” foi enviado para aprovação.' },
  suggestions_paused: { label: 'Sugestões pausadas', template: '{viewer}, as sugestões estão pausadas.' },
  suggestion_usage: { label: 'Sugestão sem título', template: '{viewer}, use {comando} seguido do nome ou link do conteúdo.' },
  suggestion_too_long: { label: 'Título muito longo', template: '{viewer}, use no máximo 200 caracteres.' },
  suggestion_duplicate: { label: 'Sugestão repetida', template: '{viewer}, essa sugestão já está na lista.' },
  queue_list: { label: '!fila — com próximos conteúdos', template: '{viewer}, agora: {atual}. A seguir: {fila}. {link}' },
  queue_empty: { label: '!fila — sem próximos conteúdos', template: '{viewer}, agora: {atual}. A fila está vazia. {link}' },
  queue_next: { label: '!proximo — próximo conteúdo', template: '{viewer}, o próximo é “{titulo}”. {link}' },
  queue_next_empty: { label: '!proximo — fila vazia', template: '{viewer}, a fila está vazia. {link}' },
  queue_idle: { label: 'Texto quando nada está em reprodução', template: 'nenhum conteúdo' },
  queue_item: { label: 'Formato de cada item em !fila', template: '{posicao}. {titulo}' },
  poll_opening: { label: 'Abertura da votação', template: '🎬 Votação aberta! {filmes}' },
  command_usage: { label: 'Ajuda para gerenciar comandos', template: '{viewer}, use !command add !nome resposta, edit !nome resposta, remove !nome ou show !nome.' },
  command_forbidden: { label: 'Comando sem permissão', template: '{viewer}, você não pode gerenciar comandos neste canal.' },
  command_invalid: { label: 'Nome de comando inválido', template: '{viewer}, use um comando válido, como !discord.' },
  command_reserved: { label: 'Comando reservado', template: '{viewer}, esse comando é reservado.' },
  command_response_invalid: { label: 'Resposta de comando inválida', template: '{viewer}, a resposta precisa ter entre 1 e 500 caracteres.' },
  command_exists: { label: 'Comando já existe', template: '{viewer}, esse comando já existe.' },
  command_added: { label: 'Comando criado', template: '{viewer}, comando {comando} adicionado.' },
  command_updated: { label: 'Comando alterado', template: '{viewer}, comando {comando} atualizado.' },
  command_removed: { label: 'Comando removido', template: '{viewer}, comando {comando} removido.' },
  command_missing: { label: 'Comando não encontrado', template: '{viewer}, não encontrei esse comando.' },
  command_show: { label: 'Exibir comando', template: '{viewer}, {comando}: {resposta}' },
  command_action_invalid: { label: 'Ação de comando inválida', template: '{viewer}, use add, edit, remove ou show.' },
} as const
export type SystemBotEvent = keyof typeof SYSTEM_BOT_MESSAGES

// Substitute once: viewer-provided content must never become a second template.
export function renderBotMessage(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (token, key: string) => values[key] ?? token).trim().slice(0, 500)
}
