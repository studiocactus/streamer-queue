-- Every automatic chat message must credit the viewer who submitted it.
update public.chat_message_templates
set template = trim(template) || ' — sugestão de {viewer}'
where position('{viewer}' in template) = 0;
