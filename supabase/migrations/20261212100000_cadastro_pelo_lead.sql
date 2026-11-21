-- Cadastro feito pelo próprio lead.
--
-- A equipe (CRM) ou a Aura IA (WhatsApp) gera um link único (7 dias, uso único). O lead abre,
-- confere/preenche nome completo, data de nascimento, CPF e WhatsApp, aceita o uso dos dados (LGPD)
-- e envia. Os dados vão para o cadastro do LEAD (a paciente é criada a partir dele na venda).
--
-- - A página nunca mostra dados além do primeiro nome e do WhatsApp da conversa.
-- - CPF já usado por outra paciente/lead da clínica não é revelado ao lead: vira um aviso para a equipe.
-- - Telefone diferente do da conversa não substitui o original: fica guardado para a equipe decidir.
-- - O link guarda só o hash do código (mesma função da anamnese).

-- =============================================
-- 1. Situação do cadastro no lead
-- =============================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS signup_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signup_consent jsonb,
  ADD COLUMN IF NOT EXISTS signup_flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS signup_phone text;

-- =============================================
-- 2. Links
-- =============================================

CREATE TABLE IF NOT EXISTS public.lead_signup_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_via text NOT NULL DEFAULT 'staff' CHECK (created_via IN ('staff', 'aura')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_signup_links_lead_idx ON public.lead_signup_links (lead_id, created_at DESC);

ALTER TABLE public.lead_signup_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff views lead signup links" ON public.lead_signup_links;
CREATE POLICY "Staff views lead signup links" ON public.lead_signup_links FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
GRANT SELECT ON public.lead_signup_links TO authenticated;

-- =============================================
-- 3. Regras
-- =============================================

-- CPF pelos dígitos verificadores (mesma regra de src/lib/patients/validation.ts).
CREATE OR REPLACE FUNCTION private.cpf_is_valid(p_cpf text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  d text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  s integer;
  r integer;
  i integer;
BEGIN
  IF length(d) <> 11 OR d ~ '^(\d)\1{10}$' THEN RETURN false; END IF;
  s := 0;
  FOR i IN 1..9 LOOP s := s + substr(d, i, 1)::integer * (11 - i); END LOOP;
  r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
  IF r <> substr(d, 10, 1)::integer THEN RETURN false; END IF;
  s := 0;
  FOR i IN 1..10 LOOP s := s + substr(d, i, 1)::integer * (12 - i); END LOOP;
  r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
  RETURN r = substr(d, 11, 1)::integer;
END;
$$;

-- Gera o link (sem checar quem pede: as funções públicas abaixo checam). Links abertos anteriores
-- do mesmo lead deixam de valer, para só o último funcionar.
CREATE OR REPLACE FUNCTION private.lead_signup_create(p_lead_id uuid, p_via text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_token text;
  v_expires timestamptz := now() + interval '7 days';
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead não encontrado.' USING ERRCODE = '42501'; END IF;
  IF v_lead.patient_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este contato já é paciente: atualize o cadastro na ficha da paciente.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.lead_signup_links SET expires_at = now()
  WHERE lead_id = v_lead.id AND used_at IS NULL AND expires_at > now();

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.lead_signup_links (clinic_id, lead_id, token_hash, expires_at, created_via)
  VALUES (v_lead.clinic_id, v_lead.id, private.anamnese_token_hash(v_token), v_expires, p_via);
  RETURN jsonb_build_object('token', v_token, 'expires_at', v_expires);
END;
$$;

REVOKE EXECUTE ON FUNCTION private.cpf_is_valid(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.lead_signup_create(uuid, text) FROM PUBLIC, anon, authenticated;

-- Equipe (CRM) gera o link.
CREATE OR REPLACE FUNCTION public.create_lead_signup_link(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic uuid;
BEGIN
  SELECT clinic_id INTO v_clinic FROM public.leads WHERE id = p_lead_id AND deleted_at IS NULL;
  IF v_clinic IS NULL OR NOT public.is_clinic_staff(auth.uid(), v_clinic) THEN
    RAISE EXCEPTION 'Lead não encontrado.' USING ERRCODE = '42501';
  END IF;
  RETURN private.lead_signup_create(p_lead_id, 'staff');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_lead_signup_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_lead_signup_link(uuid) TO authenticated;

-- Aura IA (função aura-api, com a chave de serviço) gera o link para um lead da clínica.
CREATE OR REPLACE FUNCTION public.aura_create_lead_signup_link(p_clinic_id uuid, p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = p_lead_id AND clinic_id = p_clinic_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Lead não encontrado.' USING ERRCODE = '42501';
  END IF;
  RETURN private.lead_signup_create(p_lead_id, 'aura');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.aura_create_lead_signup_link(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aura_create_lead_signup_link(uuid, uuid) TO service_role;

-- Situação do link para a página: clínica, primeiro nome e o WhatsApp da conversa (para conferir).
CREATE OR REPLACE FUNCTION public.lead_signup_status(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.lead_signup_links%ROWTYPE;
  v_lead public.leads%ROWTYPE;
  v_clinic public.clinics%ROWTYPE;
BEGIN
  SELECT * INTO v_link FROM public.lead_signup_links WHERE token_hash = private.anamnese_token_hash(p_token);
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO v_clinic FROM public.clinics WHERE id = v_link.clinic_id;
  SELECT * INTO v_lead FROM public.leads WHERE id = v_link.lead_id;
  RETURN jsonb_build_object(
    'status', CASE
      WHEN v_link.used_at IS NOT NULL THEN 'used'
      WHEN v_link.expires_at <= now() OR v_lead.deleted_at IS NOT NULL OR v_lead.patient_id IS NOT NULL THEN 'expired'
      ELSE 'ok' END,
    'clinic_name', v_clinic.name,
    'logo_url', v_clinic.logo_url,
    'first_name', CASE WHEN v_lead.full_name = 'Contato do WhatsApp' THEN NULL ELSE split_part(trim(v_lead.full_name), ' ', 1) END,
    'phone', v_lead.phone
  );
END;
$$;

-- Envio do cadastro.
CREATE OR REPLACE FUNCTION public.lead_signup_submit(
  p_token text,
  p_full_name text,
  p_birth_date date,
  p_cpf text,
  p_phone text,
  p_consent boolean
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
    signup_phone = v_phone,
    signup_flags = v_flags,
    signup_completed_at = now(),
    signup_consent = jsonb_build_object(
      'accepted', true,
      'at', now(),
      'text', 'Autorizo a clínica a usar meus dados (nome, data de nascimento, CPF e WhatsApp) para cadastro, agendamento e atendimento.',
      'ip', split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1),
      'user_agent', left(coalesce(v_headers ->> 'user-agent', ''), 300)
    ),
    last_interaction_at = now()
  WHERE id = v_lead.id;

  UPDATE public.lead_signup_links SET used_at = now() WHERE id = v_link.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lead_signup_status(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lead_signup_submit(text, text, date, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lead_signup_status(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_signup_submit(text, text, date, text, text, boolean) TO anon, authenticated;
