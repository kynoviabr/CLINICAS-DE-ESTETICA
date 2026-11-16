-- Épico 18: fuso horário por clínica. Brasil não tem horário de verão desde 2019, então cada fuso é um deslocamento fixo.
-- Padrão: America/Sao_Paulo (Brasília). Usado pela agenda online, IA, lembretes e links do paciente.
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo'
  CHECK (timezone IN ('America/Noronha', 'America/Sao_Paulo', 'America/Bahia', 'America/Fortaleza', 'America/Recife', 'America/Belem',
    'America/Maceio', 'America/Araguaina', 'America/Santarem', 'America/Manaus', 'America/Cuiaba', 'America/Campo_Grande',
    'America/Porto_Velho', 'America/Boa_Vista', 'America/Rio_Branco', 'America/Eirunepe'));
