-- Épico 7: automações reais (fim das simulações em Configurações > Automações).
-- Lembrete automático de atendimento pelo WhatsApp oficial (modelo aprovado pela Meta, via Aura),
-- com o link de confirmar/remarcar/cancelar do épico 6. Histórico de cada disparo.

CREATE TABLE IF NOT EXISTS public.clinic_automations (
  clinic_id uuid PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  reminder_enabled boolean NOT NULL DEFAULT false,
  reminder_hours_before integer NOT NULL DEFAULT 24 CHECK (reminder_hours_before BETWEEN 2 AND 72),
  reminder_template text NOT NULL DEFAULT 'aura_lembrete_horario',
  reminder_language text NOT NULL DEFAULT 'pt_BR',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid()
);

ALTER TABLE public.clinic_automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff views automations" ON public.clinic_automations;
CREATE POLICY "Staff views automations" ON public.clinic_automations FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
DROP POLICY IF EXISTS "Admin inserts automations" ON public.clinic_automations;
CREATE POLICY "Admin inserts automations" ON public.clinic_automations FOR INSERT TO authenticated
  WITH CHECK (public.has_clinic_role(auth.uid(), clinic_id, 'admin'));
DROP POLICY IF EXISTS "Admin updates automations" ON public.clinic_automations;
CREATE POLICY "Admin updates automations" ON public.clinic_automations FOR UPDATE TO authenticated
  USING (public.has_clinic_role(auth.uid(), clinic_id, 'admin'))
  WITH CHECK (public.has_clinic_role(auth.uid(), clinic_id, 'admin'));

-- Um registro por atendimento e tipo de automação (evita mandar duas vezes).
CREATE TABLE IF NOT EXISTS public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'reminder',
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  detail text,
  attempts integer NOT NULL DEFAULT 1,
  recipient_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS automation_runs_once ON public.automation_runs (appointment_id, kind) WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS automation_runs_clinic_idx ON public.automation_runs (clinic_id, created_at DESC);

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff views automation runs" ON public.automation_runs;
CREATE POLICY "Staff views automation runs" ON public.automation_runs FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
REVOKE INSERT, UPDATE, DELETE ON public.automation_runs FROM anon, authenticated;

-- Agendador: a cada 15 minutos chama a função automacoes.
-- Precisa de pg_cron, pg_net e de dois segredos no Vault: project_url e automations_runner_token.
-- Em bancos sem essas extensões (testes locais) esta parte é ignorada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    CREATE EXTENSION IF NOT EXISTS pg_net;
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'klinova-automacoes';
    PERFORM cron.schedule('klinova-automacoes', '*/15 * * * *', $job$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/automacoes',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-runner-token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'automations_runner_token')
        ),
        body := '{"action":"run"}'::jsonb
      );
    $job$);
  END IF;
END $$;

-- A função automacoes confere o x-runner-token com o segredo do Vault (sem precisar de segredo duplicado na função).
CREATE OR REPLACE FUNCTION public.automations_token_ok(p_token text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v text;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL OR coalesce(p_token, '') = '' THEN RETURN false; END IF;
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1' INTO v USING 'automations_runner_token';
  RETURN v IS NOT NULL AND v = p_token;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.automations_token_ok(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automations_token_ok(text) TO service_role;
