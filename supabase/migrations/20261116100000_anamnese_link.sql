-- Anamnese por link: a clínica gera um link único (7 dias, uso único) e manda pelo WhatsApp.
-- A paciente confirma a data de nascimento, preenche no celular e a anamnese entra no cadastro dela
-- como "preenchida" (a equipe revisa e valida). O link guarda só o hash do código.

CREATE TABLE IF NOT EXISTS public.anamnese_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  anamnese_id uuid REFERENCES public.patient_anamneses(id) ON DELETE SET NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS anamnese_links_patient_idx ON public.anamnese_links (patient_id, created_at DESC);

ALTER TABLE public.anamnese_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff views anamnese links" ON public.anamnese_links;
CREATE POLICY "Staff views anamnese links" ON public.anamnese_links FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
GRANT SELECT ON public.anamnese_links TO authenticated;

CREATE OR REPLACE FUNCTION private.anamnese_token_hash(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') $$;

-- Equipe gera o link. Exige data de nascimento no cadastro (é o que a paciente confirma).
CREATE OR REPLACE FUNCTION public.create_anamnese_link(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_patient public.patients%ROWTYPE;
  v_token text;
  v_expires timestamptz := now() + interval '7 days';
BEGIN
  SELECT * INTO v_patient FROM public.patients WHERE id = p_patient_id;
  IF NOT FOUND OR NOT public.is_clinic_staff(auth.uid(), v_patient.clinic_id) THEN
    RAISE EXCEPTION 'Paciente não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF v_patient.date_of_birth IS NULL THEN
    RAISE EXCEPTION 'Cadastre a data de nascimento da paciente: é com ela que a paciente confirma que é ela.' USING ERRCODE = '22023';
  END IF;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.anamnese_links (clinic_id, patient_id, token_hash, expires_at, created_by)
  VALUES (v_patient.clinic_id, v_patient.id, private.anamnese_token_hash(v_token), v_expires, auth.uid());
  RETURN jsonb_build_object('token', v_token, 'expires_at', v_expires);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_anamnese_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_anamnese_link(uuid) TO authenticated;

-- Situação do link (sem dado da paciente): para a página mostrar a clínica ou o motivo de não abrir.
CREATE OR REPLACE FUNCTION public.anamnese_link_status(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.anamnese_links%ROWTYPE;
  v_clinic public.clinics%ROWTYPE;
BEGIN
  SELECT * INTO v_link FROM public.anamnese_links WHERE token_hash = private.anamnese_token_hash(p_token);
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO v_clinic FROM public.clinics WHERE id = v_link.clinic_id;
  RETURN jsonb_build_object(
    'status', CASE
      WHEN v_link.used_at IS NOT NULL THEN 'used'
      WHEN v_link.expires_at < now() THEN 'expired'
      WHEN v_link.failed_attempts >= 5 THEN 'locked'
      ELSE 'ok' END,
    'clinic_name', v_clinic.name,
    'logo_url', v_clinic.logo_url,
    'primary_color', v_clinic.primary_color
  );
END;
$$;

-- Confere o link e a data de nascimento. 5 erros bloqueiam o link.
CREATE OR REPLACE FUNCTION private.anamnese_link_check(p_token text, p_birth_date date)
RETURNS public.anamnese_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.anamnese_links%ROWTYPE;
  v_birth date;
BEGIN
  SELECT * INTO v_link FROM public.anamnese_links WHERE token_hash = private.anamnese_token_hash(p_token) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Link inválido.' USING ERRCODE = '22023'; END IF;
  IF v_link.used_at IS NOT NULL THEN RAISE EXCEPTION 'Esta anamnese já foi enviada.' USING ERRCODE = '22023'; END IF;
  IF v_link.expires_at < now() THEN RAISE EXCEPTION 'Link vencido. Peça um novo à clínica.' USING ERRCODE = '22023'; END IF;
  IF v_link.failed_attempts >= 5 THEN RAISE EXCEPTION 'Link bloqueado por tentativas erradas. Peça um novo à clínica.' USING ERRCODE = '22023'; END IF;
  SELECT date_of_birth INTO v_birth FROM public.patients WHERE id = v_link.patient_id;
  IF v_birth IS DISTINCT FROM p_birth_date THEN
    UPDATE public.anamnese_links SET failed_attempts = failed_attempts + 1 WHERE id = v_link.id;
    RETURN NULL;
  END IF;
  RETURN v_link;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.anamnese_link_check(text, date) FROM PUBLIC, anon, authenticated;

-- Data certa: devolve o primeiro nome e as perguntas da clínica (modelos de anamnese).
CREATE OR REPLACE FUNCTION public.anamnese_link_open(p_token text, p_birth_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.anamnese_links%ROWTYPE;
  v_name text;
  v_templates text;
BEGIN
  v_link := private.anamnese_link_check(p_token, p_birth_date);
  IF v_link.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'A data de nascimento não confere.');
  END IF;
  SELECT split_part(full_name, ' ', 1) INTO v_name FROM public.patients WHERE id = v_link.patient_id;
  SELECT value INTO v_templates FROM public.clinic_settings WHERE clinic_id = v_link.clinic_id AND key = 'anamnese_templates';
  RETURN jsonb_build_object('ok', true, 'first_name', v_name, 'templates', coalesce(v_templates, '[]'));
END;
$$;

-- Envio: grava a anamnese no cadastro da paciente e encerra o link.
CREATE OR REPLACE FUNCTION public.anamnese_link_submit(p_token text, p_birth_date date, p_form_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.anamnese_links%ROWTYPE;
  v_validity integer;
  v_headers json;
  v_id uuid;
BEGIN
  v_link := private.anamnese_link_check(p_token, p_birth_date);
  IF v_link.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'A data de nascimento não confere.');
  END IF;
  IF jsonb_typeof(p_form_data) IS DISTINCT FROM 'object' OR pg_column_size(p_form_data) > 200000 THEN
    RAISE EXCEPTION 'Formulário inválido.' USING ERRCODE = '22023';
  END IF;
  IF coalesce((p_form_data #>> '{consent,agrees_terms}')::boolean, false) IS NOT TRUE
     OR length(trim(coalesce(p_form_data #>> '{consent,signature_name}', ''))) < 3 THEN
    RAISE EXCEPTION 'Aceite os termos e digite seu nome completo para assinar.' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(nullif(regexp_replace(value, '\D', '', 'g'), '')::integer, 180) INTO v_validity
  FROM public.clinic_settings WHERE clinic_id = v_link.clinic_id AND key = 'anamnese_validity_days';
  v_headers := nullif(current_setting('request.headers', true), '')::json;

  INSERT INTO public.patient_anamneses (
    anamnese_number, clinic_id, patient_id, form_data, filled_at, source_type, status,
    validity_days, is_current, created_by
  ) VALUES (
    '', v_link.clinic_id, v_link.patient_id,
    p_form_data || jsonb_build_object('submission', jsonb_build_object(
      'filled_by', 'patient', 'via', 'link', 'at', now(),
      'ip', split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1),
      'user_agent', left(coalesce(v_headers ->> 'user-agent', ''), 300)
    )),
    now(), 'patient_link', 'filled', coalesce(v_validity, 180), true, v_link.created_by
  ) RETURNING id INTO v_id;

  UPDATE public.anamnese_links SET used_at = now(), anamnese_id = v_id WHERE id = v_link.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.anamnese_link_status(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.anamnese_link_open(text, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.anamnese_link_submit(text, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anamnese_link_status(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anamnese_link_open(text, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anamnese_link_submit(text, date, jsonb) TO anon, authenticated;
