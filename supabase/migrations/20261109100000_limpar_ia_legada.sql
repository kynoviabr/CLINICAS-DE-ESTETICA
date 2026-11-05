-- Limpeza final da IA de WhatsApp legada do Clínicas.
-- O atendimento com IA é o produto Aura, conectado como integração.
-- As tabelas estavam vazias na homolog e na produção quando esta migração foi criada.
-- (whatsapp_command_logs NÃO é da IA: é dos comandos de agenda por WhatsApp e continua.)

DROP TABLE IF EXISTS public.whatsapp_ai_messages;
DROP TABLE IF EXISTS public.whatsapp_ai_conversations;
DROP TABLE IF EXISTS public.whatsapp_ai_settings;

-- Origem antiga de lead vira "whatsapp".
UPDATE public.leads SET source = 'whatsapp'
WHERE lower(coalesce(source, '')) IN ('whatsapp_ai', 'whatsapp ia', 'whatsapp-ai');
