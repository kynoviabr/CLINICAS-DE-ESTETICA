-- Épico 22: indicação de amigos.
-- Cada paciente tem um link pessoal (/indicar/<código>) no portal. Quem indica compartilha pelo WhatsApp;
-- o indicado deixa nome e WhatsApp e entra no CRM com a origem "indicação". Quando o indicado fecha,
-- a recompensa configurada pela clínica fica liberada e a equipe marca como entregue.

ALTER TABLE public.clinic_service_settings ADD COLUMN IF NOT EXISTS referral_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.clinic_service_settings ADD COLUMN IF NOT EXISTS referral_reward text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS referral_code text;
CREATE UNIQUE INDEX IF NOT EXISTS patients_referral_code_key ON public.patients (referral_code) WHERE referral_code IS NOT NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS referred_by_patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS referral_reward_given_at timestamptz;
CREATE INDEX IF NOT EXISTS leads_referred_by_idx ON public.leads (referred_by_patient_id) WHERE referred_by_patient_id IS NOT NULL;

-- Paciente no portal: o próprio link (cria o código na primeira vez).
CREATE OR REPLACE FUNCTION public.my_referral()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_pid uuid; v_code text; v_clinic uuid; s public.clinic_service_settings%ROWTYPE;
BEGIN
  SELECT patient_id, clinic_id INTO v_pid, v_clinic FROM public.patient_users WHERE auth_user_id = auth.uid() AND status = 'active' LIMIT 1;
  IF v_pid IS NULL THEN RAISE EXCEPTION 'Acesso ao portal não encontrado.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM public.clinic_service_settings WHERE clinic_id = v_clinic;
  IF NOT coalesce(s.referral_enabled, false) THEN RETURN jsonb_build_object('enabled', false); END IF;
  SELECT referral_code INTO v_code FROM public.patients WHERE id = v_pid;
  IF v_code IS NULL THEN
    LOOP
      v_code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      BEGIN
        UPDATE public.patients SET referral_code = v_code WHERE id = v_pid;
        EXIT;
      EXCEPTION WHEN unique_violation THEN END;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('enabled', true, 'code', v_code, 'reward', s.referral_reward,
    'referred', (SELECT count(*) FROM public.leads WHERE referred_by_patient_id = v_pid AND deleted_at IS NULL),
    'closed', (SELECT count(*) FROM public.leads WHERE referred_by_patient_id = v_pid AND deleted_at IS NULL AND kanban_stage = 'closed_won'));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.my_referral() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_referral() TO authenticated;

-- Página pública do indicado.
CREATE OR REPLACE FUNCTION public.public_referral_page(p_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'ok', coalesce(s.referral_enabled, false),
    'referrer_first_name', split_part(p.full_name, ' ', 1),
    'clinic', jsonb_build_object('name', c.name, 'logo_url', c.logo_url, 'primary_color', c.primary_color, 'slug', c.slug),
    'online_booking', coalesce(s.online_booking_enabled, false)
  )
  FROM public.patients p
  JOIN public.clinics c ON c.id = p.clinic_id
  LEFT JOIN public.clinic_service_settings s ON s.clinic_id = c.id
  WHERE p.referral_code = lower(trim(p_code));
$$;
REVOKE EXECUTE ON FUNCTION public.public_referral_page(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_referral_page(text) TO anon, authenticated;

-- Indicado deixa nome e WhatsApp: vira lead no CRM.
CREATE OR REPLACE FUNCTION public.submit_referral(p_code text, p_name text, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p public.patients%ROWTYPE;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
BEGIN
  SELECT * INTO p FROM public.patients WHERE referral_code = lower(trim(p_code));
  IF p.id IS NULL OR NOT coalesce((SELECT referral_enabled FROM public.clinic_service_settings WHERE clinic_id = p.clinic_id), false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'disabled');
  END IF;
  IF array_length(string_to_array(v_name, ' '), 1) < 2 OR length(v_name) > 120 THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_name'); END IF;
  IF length(v_phone) NOT BETWEEN 10 AND 13 THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_phone'); END IF;
  IF (SELECT count(*) FROM public.leads WHERE referred_by_patient_id = p.id AND created_at > now() - interval '1 day') >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many');
  END IF;
  IF EXISTS (SELECT 1 FROM public.leads WHERE clinic_id = p.clinic_id AND phone = v_phone AND deleted_at IS NULL AND created_at > now() - interval '90 days') THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;
  INSERT INTO public.leads (clinic_id, full_name, phone, source, kanban_stage, referred_by_patient_id, last_interaction_at, notes)
  VALUES (p.clinic_id, v_name, v_phone, 'indicacao', 'new_lead', p.id, now(), format('Indicado(a) por %s.', p.full_name));
  PERFORM private.notify_clinic_staff(p.clinic_id, p.id, 'Nova indicação', format('%s indicou %s. Já está no CRM.', p.full_name, v_name));
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_referral(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_referral(text, text, text) TO anon, authenticated;

-- Equipe: indicações e recompensas.
CREATE OR REPLACE FUNCTION public.referral_list(p_clinic_id uuid)
RETURNS TABLE (lead_id uuid, lead_name text, lead_stage text, created_at timestamptz, referrer_id uuid, referrer_name text, referrer_phone text, reward_given_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_clinic_staff(auth.uid(), p_clinic_id) THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT l.id, l.full_name, l.kanban_stage::text, l.created_at, p.id, p.full_name, p.phone, l.referral_reward_given_at
  FROM public.leads l JOIN public.patients p ON p.id = l.referred_by_patient_id
  WHERE l.clinic_id = p_clinic_id AND l.deleted_at IS NULL
  ORDER BY l.created_at DESC LIMIT 200;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.referral_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.referral_list(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_referral_reward(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE l public.leads%ROWTYPE;
BEGIN
  SELECT * INTO l FROM public.leads WHERE id = p_lead_id;
  IF l.id IS NULL OR NOT public.is_clinic_staff(auth.uid(), l.clinic_id) THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501'; END IF;
  IF l.kanban_stage::text <> 'closed_won' THEN RAISE EXCEPTION 'A recompensa só é liberada quando o indicado fecha.' USING ERRCODE = '22023'; END IF;
  UPDATE public.leads SET referral_reward_given_at = now() WHERE id = p_lead_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mark_referral_reward(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_referral_reward(uuid) TO authenticated;
