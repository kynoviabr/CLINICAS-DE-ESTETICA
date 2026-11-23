-- Cadastro pelo lead: e-mail opcional.
-- Se preenchido, é validado e gravado no lead (e daí vai para a ficha quando ela vira cliente).
-- Em branco, o e-mail que o lead já tinha fica como está.

DROP FUNCTION IF EXISTS public.lead_signup_submit(text, text, date, text, text, boolean);

CREATE OR REPLACE FUNCTION public.lead_signup_submit(
  p_token text,
  p_full_name text,
  p_birth_date date,
  p_cpf text,
  p_phone text,
  p_consent boolean,
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.lead_signup_links%ROWTYPE;
  v_lead public.leads%ROWTYPE;
  v_name text := regexp_replace(trim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
  v_old_phone text;
  v_flags text[] := '{}';
  v_headers json;
BEGIN
  SELECT * INTO v_link FROM public.lead_signup_links WHERE token_hash = private.anamnese_token_hash(p_token) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Link inválido.' USING ERRCODE = '22023'; END IF;
  IF v_link.used_at IS NOT NULL THEN RAISE EXCEPTION 'Este cadastro já foi enviado. Obrigada!' USING ERRCODE = '22023'; END IF;
  IF v_link.expires_at <= now() THEN RAISE EXCEPTION 'Este link venceu. Peça um novo à clínica.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_lead FROM public.leads WHERE id = v_link.lead_id FOR UPDATE;
  IF v_lead.deleted_at IS NOT NULL OR v_lead.patient_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este link venceu. Peça um novo à clínica.' USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_consent, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Para continuar, autorize o uso dos seus dados.' USING ERRCODE = '22023';
  END IF;
  IF length(v_name) < 5 OR position(' ' IN v_name) = 0 THEN
    RAISE EXCEPTION 'Digite seu nome completo.' USING ERRCODE = '22023';
  END IF;
  IF p_birth_date IS NULL OR p_birth_date < DATE '1900-01-01' OR p_birth_date > current_date THEN
    RAISE EXCEPTION 'Confira a data de nascimento.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.cpf_is_valid(v_cpf) THEN
    RAISE EXCEPTION 'CPF inválido. Confira os números.' USING ERRCODE = '22023';
  END IF;
  IF v_phone LIKE '55%' AND length(v_phone) > 11 THEN v_phone := substr(v_phone, 3); END IF;
  IF length(v_phone) NOT IN (10, 11) THEN
    RAISE EXCEPTION 'Confira o WhatsApp com DDD.' USING ERRCODE = '22023';
  END IF;

  IF v_email IS NOT NULL AND (length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
    RAISE EXCEPTION 'Confira o e-mail (ou deixe em branco).' USING ERRCODE = '22023';
  END IF;

  -- CPF de outro cadastro: a equipe decide (o lead não fica sabendo).
  IF EXISTS (SELECT 1 FROM public.patients p WHERE p.clinic_id = v_lead.clinic_id
               AND regexp_replace(coalesce(p.cpf, ''), '\D', '', 'g') = v_cpf)
     OR EXISTS (SELECT 1 FROM public.leads l WHERE l.clinic_id = v_lead.clinic_id AND l.id <> v_lead.id AND l.deleted_at IS NULL
               AND regexp_replace(coalesce(l.cpf, ''), '\D', '', 'g') = v_cpf) THEN
    v_flags := array_append(v_flags, 'cpf_duplicate');
  END IF;

  -- WhatsApp diferente do da conversa: guarda à parte, sem trocar o original.
  v_old_phone := regexp_replace(coalesce(v_lead.phone, ''), '\D', '', 'g');
  IF v_old_phone LIKE '55%' AND length(v_old_phone) > 11 THEN v_old_phone := substr(v_old_phone, 3); END IF;
  IF v_old_phone <> '' AND v_old_phone <> v_phone THEN
    v_flags := array_append(v_flags, 'phone_changed');
  END IF;

  v_headers := nullif(current_setting('request.headers', true), '')::json;
  UPDATE public.leads SET
    full_name = v_name,
    birth_date = p_birth_date,
    cpf = v_cpf,
    phone = CASE WHEN v_old_phone = '' THEN v_phone ELSE phone END,
    email = coalesce(v_email, email),
    signup_phone = v_phone,
    signup_flags = v_flags,
    signup_completed_at = now(),
    signup_consent = jsonb_build_object(
      'accepted', true,
      'at', now(),
      'text', 'Autorizo a clínica a usar meus dados (nome, data de nascimento, CPF, WhatsApp e e-mail) para cadastro, agendamento e atendimento.',
      'ip', split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1),
      'user_agent', left(coalesce(v_headers ->> 'user-agent', ''), 300)
    ),
    last_interaction_at = now()
  WHERE id = v_lead.id;

  UPDATE public.lead_signup_links SET used_at = now() WHERE id = v_link.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lead_signup_submit(text, text, date, text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lead_signup_submit(text, text, date, text, text, boolean, text) TO anon, authenticated;
