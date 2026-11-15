-- Épico 6: confirmar, remarcar e cancelar pelo link (sem login).
-- A equipe gera o link no agendamento e manda pelo WhatsApp. O paciente abre no celular.
-- O código fica só como hash; vale até o horário do atendimento.
-- As ações do paciente passam pela função agendamento-paciente (usa o mesmo cálculo de horários da agenda).

CREATE TABLE IF NOT EXISTS public.appointment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  last_action text CHECK (last_action IN ('confirmed', 'cancelled', 'rescheduled')),
  last_action_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appointment_links_appointment_idx ON public.appointment_links (appointment_id, created_at DESC);

ALTER TABLE public.appointment_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff views appointment links" ON public.appointment_links;
CREATE POLICY "Staff views appointment links" ON public.appointment_links FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
REVOKE INSERT, UPDATE, DELETE ON public.appointment_links FROM anon, authenticated;

-- Quem confirmou: 'patient_link' quando foi o paciente pelo link.
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS confirmed_via text;

CREATE OR REPLACE FUNCTION public.create_appointment_link(p_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND OR NOT public.is_clinic_staff(auth.uid(), v_appt.clinic_id) THEN
    RAISE EXCEPTION 'Agendamento não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF v_appt.start_time <= now() THEN
    RAISE EXCEPTION 'Este atendimento já passou.' USING ERRCODE = '22023';
  END IF;
  IF v_appt.status NOT IN ('scheduled', 'confirmed') THEN
    RAISE EXCEPTION 'Só dá para enviar link de agendamento marcado ou confirmado.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.appointment_links (clinic_id, appointment_id, token_hash, expires_at, created_by)
  VALUES (v_appt.clinic_id, v_appt.id, private.anamnese_token_hash(v_token), v_appt.start_time, auth.uid());
  RETURN jsonb_build_object('token', v_token, 'expires_at', v_appt.start_time);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_appointment_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_appointment_link(uuid) TO authenticated;
