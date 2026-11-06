-- Atendimento automático da Aura IA: marca as mensagens escritas pela IA (a tela mostra "Aura IA").
-- O modo da IA da clínica fica em clinic_settings (chave aura_ai_mode: copilot ou auto), gravado pela função whatsapp.
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS sent_by_ai boolean NOT NULL DEFAULT false;
