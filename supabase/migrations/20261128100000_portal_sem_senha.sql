-- Épico 13: portal do paciente sem senha.
-- A clínica manda pelo WhatsApp um link pessoal (30 dias). O paciente confirma um dado do cadastro
-- e entra direto no portal; a sessão fica salva no aparelho. Não precisa de e-mail nem de senha.
-- A troca do link por uma sessão é feita pela função portal-acesso.

CREATE TABLE IF NOT EXISTS public.portal_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0,
  use_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_links_patient_idx ON public.portal_links (patient_id, created_at DESC);
ALTER TABLE public.portal_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff views portal links" ON public.portal_links;
CREATE POLICY "Staff views portal links" ON public.portal_links FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
REVOKE INSERT, UPDATE, DELETE ON public.portal_links FROM anon, authenticated;

-- Equipe gera o link de acesso.
CREATE OR REPLACE FUNCTION public.create_portal_link(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p public.patients%ROWTYPE;
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires timestamptz := now() + interval '30 days';
BEGIN
  SELECT * INTO v_p FROM public.patients WHERE id = p_patient_id;
  IF NOT FOUND OR NOT public.is_clinic_staff(auth.uid(), v_p.clinic_id) THEN
    RAISE EXCEPTION 'Paciente não encontrado.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.portal_links (clinic_id, patient_id, token_hash, expires_at, created_by)
  VALUES (v_p.clinic_id, v_p.id, private.anamnese_token_hash(v_token), v_expires, auth.uid());
  RETURN jsonb_build_object('token', v_token, 'expires_at', v_expires);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_portal_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_portal_link(uuid) TO authenticated;

-- Página de entrada (sem login): de qual clínica é e o que pedir.
CREATE OR REPLACE FUNCTION public.portal_link_status(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v public.portal_links%ROWTYPE; c public.clinics%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;
  SELECT * INTO v FROM public.portal_links WHERE token_hash = private.anamnese_token_hash(p_token);
  IF v.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;
  IF v.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'revoked'); END IF;
  IF v.expires_at < now() THEN RETURN jsonb_build_object('ok', false, 'reason', 'expired'); END IF;
  IF v.failed_attempts >= 5 THEN RETURN jsonb_build_object('ok', false, 'reason', 'locked'); END IF;
  SELECT * INTO c FROM public.clinics WHERE id = v.clinic_id;
  RETURN jsonb_build_object('ok', true,
    'clinic', jsonb_build_object('name', c.name, 'logo_url', c.logo_url, 'primary_color', c.primary_color),
    'first_name', (SELECT split_part(full_name, ' ', 1) FROM public.patients WHERE id = v.patient_id),
    'identity_check', private.identity_check_kind(v.patient_id));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.portal_link_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_link_status(text) TO anon, authenticated;

-- Só a função portal-acesso (service_role) confere o link e o dado do paciente.
CREATE OR REPLACE FUNCTION public.portal_link_check(p_token text, p_identity text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v public.portal_links%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;
  SELECT * INTO v FROM public.portal_links WHERE token_hash = private.anamnese_token_hash(p_token) FOR UPDATE;
  IF v.id IS NULL OR v.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;
  IF v.expires_at < now() THEN RETURN jsonb_build_object('ok', false, 'reason', 'expired'); END IF;
  IF v.failed_attempts >= 5 THEN RETURN jsonb_build_object('ok', false, 'reason', 'locked'); END IF;
  IF NOT private.identity_matches(v.patient_id, p_identity) THEN
    UPDATE public.portal_links SET failed_attempts = failed_attempts + 1 WHERE id = v.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'identity', 'attempts_left', greatest(0, 4 - v.failed_attempts));
  END IF;
  UPDATE public.portal_links SET use_count = use_count + 1, last_used_at = now() WHERE id = v.id;
  RETURN jsonb_build_object('ok', true, 'patient_id', v.patient_id, 'clinic_id', v.clinic_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.portal_link_check(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_link_check(text, text) TO service_role;

-- Paciente logado no portal gera o próprio link de anamnese (mesmo fluxo do link da clínica).
CREATE OR REPLACE FUNCTION public.create_my_anamnese_link()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pid uuid;
  v_p public.patients%ROWTYPE;
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
BEGIN
  SELECT patient_id INTO v_pid FROM public.patient_users WHERE auth_user_id = auth.uid() AND status = 'active' LIMIT 1;
  IF v_pid IS NULL THEN RAISE EXCEPTION 'Acesso ao portal não encontrado.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_p FROM public.patients WHERE id = v_pid;
  IF v_p.date_of_birth IS NULL THEN
    RAISE EXCEPTION 'Peça à clínica para cadastrar sua data de nascimento antes de preencher a anamnese.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.anamnese_links (clinic_id, patient_id, token_hash, expires_at, created_by)
  VALUES (v_p.clinic_id, v_p.id, private.anamnese_token_hash(v_token), now() + interval '7 days', auth.uid());
  RETURN jsonb_build_object('token', v_token);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_my_anamnese_link() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_anamnese_link() TO authenticated;

-- Situação da anamnese do próprio paciente (para o portal mostrar o próximo passo).
CREATE OR REPLACE FUNCTION public.my_portal_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'anamnese_status', p.current_anamnese_status,
    'has_birth_date', p.date_of_birth IS NOT NULL,
    'contracts_to_sign', (
      SELECT count(*) FROM public.contracts c
      WHERE c.patient_id = p.id AND c.process_status = 'pending_upload'
        AND NOT EXISTS (SELECT 1 FROM public.contract_signatures s WHERE s.contract_id = c.id)
    )
  )
  FROM public.patient_users pu JOIN public.patients p ON p.id = pu.patient_id
  WHERE pu.auth_user_id = auth.uid() AND pu.status = 'active'
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.my_portal_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_portal_summary() TO authenticated;
