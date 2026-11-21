-- Anamnese por tratamento.
--
-- Além da anamnese inicial (geral), cada categoria de tratamento tem uma anamnese específica,
-- focada nos princípios e riscos daquele tratamento. A Dra escolhe no envio quais a paciente
-- responde (a inicial, uma ou mais específicas) e tudo vai num único link.
--
-- - patient_anamneses.kind: 'general' (inicial) ou 'treatment' (específica de uma categoria).
-- - Uma anamnese "vigente" por paciente E por tipo/categoria (antes era uma por paciente).
-- - patients.current_anamnese_* continua refletindo só a anamnese inicial (compatível com o app atual).
-- - anamnese_links guarda o que a Dra escolheu (include_general + template_ids).
-- - Os modelos continuam em clinic_settings 'anamnese_templates' (JSON).

-- =============================================
-- 1. Tipo e categoria da anamnese
-- =============================================

ALTER TABLE public.patient_anamneses
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.treatment_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_id text,
  ADD COLUMN IF NOT EXISTS template_name text;

ALTER TABLE public.patient_anamneses DROP CONSTRAINT IF EXISTS patient_anamneses_kind_check;
ALTER TABLE public.patient_anamneses
  ADD CONSTRAINT patient_anamneses_kind_check CHECK (
    kind = 'general' AND category_id IS NULL
    OR kind = 'treatment' AND template_id IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_patient_anamneses_patient_kind
  ON public.patient_anamneses (patient_id, kind, category_id);

-- =============================================
-- 2. Vigente por paciente + tipo + categoria
-- =============================================

CREATE OR REPLACE FUNCTION public.anamnese_before_upsert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.filled_at IS NOT NULL AND (
    TG_OP = 'INSERT' OR
    OLD.filled_at IS DISTINCT FROM NEW.filled_at OR
    OLD.validity_days IS DISTINCT FROM NEW.validity_days
  ) THEN
    NEW.expires_at := NEW.filled_at + (NEW.validity_days || ' days')::interval;
  END IF;

  IF NEW.expires_at IS NOT NULL AND NEW.expires_at < now() AND NEW.status IN ('filled', 'validated') THEN
    NEW.status := 'expired';
  END IF;

  -- Uma vigente por paciente, tipo e categoria.
  IF NEW.is_current = true THEN
    UPDATE public.patient_anamneses
    SET is_current = false
    WHERE patient_id = NEW.patient_id
      AND kind = NEW.kind
      AND category_id IS NOT DISTINCT FROM NEW.category_id
      AND id IS DISTINCT FROM NEW.id
      AND is_current = true;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_patient_anamnese_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.patient_anamneses%ROWTYPE;
  _best RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN _row := OLD; ELSE _row := NEW; END IF;

  -- Melhor anamnese do mesmo grupo (paciente + tipo + categoria).
  SELECT id, status, expires_at
  INTO _best
  FROM public.patient_anamneses
  WHERE patient_id = _row.patient_id
    AND kind = _row.kind
    AND category_id IS NOT DISTINCT FROM _row.category_id
    AND status NOT IN ('cancelled', 'archived')
  ORDER BY
    CASE status
      WHEN 'validated' THEN 1
      WHEN 'filled' THEN 2
      WHEN 'in_progress' THEN 3
      WHEN 'pending' THEN 4
      WHEN 'expired' THEN 5
      ELSE 6
    END,
    COALESCE(filled_at, created_at) DESC
  LIMIT 1;

  IF _best IS NOT NULL THEN
    UPDATE public.patient_anamneses
    SET is_current = false
    WHERE patient_id = _row.patient_id
      AND kind = _row.kind
      AND category_id IS NOT DISTINCT FROM _row.category_id
      AND id <> _best.id AND is_current = true;

    UPDATE public.patient_anamneses
    SET is_current = true
    WHERE id = _best.id AND is_current = false;
  END IF;

  -- O resumo no cadastro da paciente continua sendo só da anamnese inicial.
  IF _row.kind = 'general' THEN
    IF _best IS NULL THEN
      UPDATE public.patients
      SET current_anamnese_id = NULL,
          current_anamnese_status = 'none',
          current_anamnese_expires_at = NULL,
          has_valid_anamnese = false
      WHERE id = _row.patient_id;
    ELSE
      UPDATE public.patients
      SET current_anamnese_id = _best.id,
          current_anamnese_expires_at = _best.expires_at,
          current_anamnese_status = CASE
            WHEN _best.status IN ('validated', 'filled') AND (_best.expires_at IS NULL OR _best.expires_at > now()) THEN 'valid'
            WHEN _best.status = 'expired' OR (_best.expires_at IS NOT NULL AND _best.expires_at <= now()) THEN 'expired'
            WHEN _best.status IN ('pending', 'in_progress') THEN 'pending'
            ELSE 'none'
          END,
          has_valid_anamnese = (_best.status IN ('validated', 'filled') AND (_best.expires_at IS NULL OR _best.expires_at > now()))
      WHERE id = _row.patient_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- =============================================
-- 3. O link guarda o que a Dra escolheu
-- =============================================

ALTER TABLE public.anamnese_links
  ADD COLUMN IF NOT EXISTS include_general boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS template_ids text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.anamnese_links DROP CONSTRAINT IF EXISTS anamnese_links_something_chosen;
ALTER TABLE public.anamnese_links
  ADD CONSTRAINT anamnese_links_something_chosen CHECK (include_general OR cardinality(template_ids) > 0);

-- Modelos ativos da clínica (do JSON em clinic_settings).
CREATE OR REPLACE FUNCTION private.anamnese_active_templates(p_clinic_id uuid)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT t
  FROM public.clinic_settings s,
       jsonb_array_elements(CASE WHEN jsonb_typeof(s.value::jsonb) = 'array' THEN s.value::jsonb ELSE '[]'::jsonb END) t
  WHERE s.clinic_id = p_clinic_id
    AND s.key = 'anamnese_templates'
    AND coalesce((t ->> 'active')::boolean, false);
$$;

REVOKE EXECUTE ON FUNCTION private.anamnese_active_templates(uuid) FROM PUBLIC, anon, authenticated;

-- Gera o link com as anamneses escolhidas. A assinatura antiga (só p_patient_id) continua valendo:
-- sem escolha, manda só a inicial, como antes.
DROP FUNCTION IF EXISTS public.create_anamnese_link(uuid);

CREATE OR REPLACE FUNCTION public.create_anamnese_link(
  p_patient_id uuid,
  p_include_general boolean DEFAULT true,
  p_template_ids text[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_patient public.patients%ROWTYPE;
  v_token text;
  v_expires timestamptz := now() + interval '7 days';
  v_ids text[] := ARRAY(SELECT DISTINCT unnest(coalesce(p_template_ids, '{}')));
  v_found integer;
BEGIN
  SELECT * INTO v_patient FROM public.patients WHERE id = p_patient_id;
  IF NOT FOUND OR NOT public.is_clinic_staff(auth.uid(), v_patient.clinic_id) THEN
    RAISE EXCEPTION 'Paciente não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF v_patient.date_of_birth IS NULL THEN
    RAISE EXCEPTION 'Cadastre a data de nascimento da paciente: é com ela que a paciente confirma que é ela.' USING ERRCODE = '22023';
  END IF;
  IF NOT coalesce(p_include_general, true) AND cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Escolha pelo menos uma anamnese para enviar.' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_ids) > 0 THEN
    SELECT count(*) INTO v_found
    FROM private.anamnese_active_templates(v_patient.clinic_id) t
    WHERE t ->> 'id' = ANY (v_ids);
    IF v_found <> cardinality(v_ids) THEN
      RAISE EXCEPTION 'Algum modelo de anamnese escolhido não existe ou está inativo.' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.anamnese_links (clinic_id, patient_id, token_hash, expires_at, created_by, include_general, template_ids)
  VALUES (v_patient.clinic_id, v_patient.id, private.anamnese_token_hash(v_token), v_expires, auth.uid(),
          coalesce(p_include_general, true), v_ids);
  RETURN jsonb_build_object('token', v_token, 'expires_at', v_expires);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_anamnese_link(uuid, boolean, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_anamnese_link(uuid, boolean, text[]) TO authenticated;

-- Data certa: devolve o primeiro nome, se inclui a inicial e só os modelos escolhidos.
-- Links antigos (sem escolha) seguem devolvendo todos os modelos ativos, como antes.
CREATE OR REPLACE FUNCTION public.anamnese_link_open(p_token text, p_birth_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.anamnese_links%ROWTYPE;
  v_name text;
  v_templates jsonb;
BEGIN
  v_link := private.anamnese_link_check(p_token, p_birth_date);
  IF v_link.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'A data de nascimento não confere.');
  END IF;
  SELECT split_part(full_name, ' ', 1) INTO v_name FROM public.patients WHERE id = v_link.patient_id;
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO v_templates
  FROM private.anamnese_active_templates(v_link.clinic_id) t
  WHERE cardinality(v_link.template_ids) = 0 OR t ->> 'id' = ANY (v_link.template_ids);
  RETURN jsonb_build_object(
    'ok', true,
    'first_name', v_name,
    'include_general', v_link.include_general,
    'selected', cardinality(v_link.template_ids) > 0,
    'templates', v_templates::text
  );
END;
$$;

-- Envio: grava a inicial (se escolhida) e uma anamnese por modelo escolhido, e encerra o link.
-- p_form_data: respostas da inicial + consent (assinatura) + treatment_anamneses: [{template_id, answers, risk_ack}].
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
  v_submission jsonb;
  v_treatments jsonb := coalesce(p_form_data -> 'treatment_anamneses', '[]'::jsonb);
  v_general jsonb := p_form_data - 'treatment_anamneses';
  v_entry jsonb;
  v_template jsonb;
  v_id uuid;
  v_first_id uuid;
BEGIN
  v_link := private.anamnese_link_check(p_token, p_birth_date);
  IF v_link.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'A data de nascimento não confere.');
  END IF;
  IF jsonb_typeof(p_form_data) IS DISTINCT FROM 'object' OR jsonb_typeof(v_treatments) IS DISTINCT FROM 'array'
     OR pg_column_size(p_form_data) > 300000 THEN
    RAISE EXCEPTION 'Formulário inválido.' USING ERRCODE = '22023';
  END IF;
  IF coalesce((p_form_data #>> '{consent,agrees_terms}')::boolean, false) IS NOT TRUE
     OR length(trim(coalesce(p_form_data #>> '{consent,signature_name}', ''))) < 3 THEN
    RAISE EXCEPTION 'Aceite os termos e digite seu nome completo para assinar.' USING ERRCODE = '22023';
  END IF;

  -- Toda anamnese escolhida pela Dra precisa vir respondida, com a ciência de riscos marcada.
  IF cardinality(v_link.template_ids) > 0 THEN
    IF (SELECT count(DISTINCT e ->> 'template_id') FROM jsonb_array_elements(v_treatments) e
        WHERE e ->> 'template_id' = ANY (v_link.template_ids)) <> cardinality(v_link.template_ids)
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_treatments) e WHERE NOT (e ->> 'template_id' = ANY (v_link.template_ids))) THEN
      RAISE EXCEPTION 'Responda todas as anamneses de tratamento.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_treatments) e WHERE coalesce((e ->> 'risk_ack')::boolean, false) IS NOT TRUE) THEN
      RAISE EXCEPTION 'Confirme a ciência dos riscos de cada tratamento.' USING ERRCODE = '22023';
    END IF;
  ELSIF jsonb_array_length(v_treatments) > 0 THEN
    RAISE EXCEPTION 'Formulário inválido.' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(nullif(regexp_replace(value, '\D', '', 'g'), '')::integer, 180) INTO v_validity
  FROM public.clinic_settings WHERE clinic_id = v_link.clinic_id AND key = 'anamnese_validity_days';
  v_headers := nullif(current_setting('request.headers', true), '')::json;
  v_submission := jsonb_build_object('submission', jsonb_build_object(
    'filled_by', 'patient', 'via', 'link', 'at', now(),
    'ip', split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1),
    'user_agent', left(coalesce(v_headers ->> 'user-agent', ''), 300)
  ));

  IF v_link.include_general THEN
    INSERT INTO public.patient_anamneses (
      anamnese_number, clinic_id, patient_id, form_data, filled_at, source_type, status,
      validity_days, is_current, created_by, kind
    ) VALUES (
      '', v_link.clinic_id, v_link.patient_id, v_general || v_submission,
      now(), 'patient_link', 'filled', coalesce(v_validity, 180), true, v_link.created_by, 'general'
    ) RETURNING id INTO v_first_id;
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(v_treatments) LOOP
    SELECT t INTO v_template
    FROM private.anamnese_active_templates(v_link.clinic_id) t
    WHERE t ->> 'id' = v_entry ->> 'template_id'
    LIMIT 1;
    IF v_template IS NULL THEN
      RAISE EXCEPTION 'Um dos modelos de anamnese foi desativado pela clínica. Peça um novo link.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.patient_anamneses (
      anamnese_number, clinic_id, patient_id, form_data, filled_at, source_type, status,
      validity_days, is_current, created_by, kind, category_id, template_id, template_name, title
    ) VALUES (
      '', v_link.clinic_id, v_link.patient_id,
      jsonb_build_object(
        'template', jsonb_build_object('name', v_template ->> 'name', 'category', v_template ->> 'category_name'),
        'treatment_answers', coalesce(v_entry -> 'answers', '{}'::jsonb),
        'risk', jsonb_build_object('terms', v_template ->> 'risk_terms', 'acknowledged', true),
        'consent', jsonb_build_object(
          'signature_name', p_form_data #>> '{consent,signature_name}',
          'signature_date', p_form_data #>> '{consent,signature_date}'
        )
      ) || v_submission,
      now(), 'patient_link', 'filled', coalesce(v_validity, 180), true, v_link.created_by,
      'treatment',
      (SELECT c.id FROM public.treatment_categories c
        WHERE c.clinic_id = v_link.clinic_id AND c.id::text = v_template ->> 'category_id'),
      v_template ->> 'id', v_template ->> 'name', v_template ->> 'name'
    ) RETURNING id INTO v_id;
    v_first_id := coalesce(v_first_id, v_id);
  END LOOP;

  UPDATE public.anamnese_links SET used_at = now(), anamnese_id = v_first_id WHERE id = v_link.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.anamnese_link_open(text, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.anamnese_link_submit(text, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anamnese_link_open(text, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anamnese_link_submit(text, date, jsonb) TO anon, authenticated;
