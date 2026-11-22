-- CPF do lead já usado em outro cadastro: a equipe decide.
--
-- - lead_cpf_matches: quem tem o mesmo CPF (pacientes e outros leads da clínica).
-- - lead_link_to_patient: "é a mesma pessoa" -> o lead passa a apontar para a paciente existente
--   (propostas, vendas e a conversa do WhatsApp usam a ficha dela; nenhuma paciente nova é criada).
-- - Ao corrigir o CPF do lead, o aviso "cpf_duplicate" é recalculado sozinho.

-- Quem tem o mesmo CPF (só dígitos) na clínica, fora o próprio lead.
CREATE OR REPLACE FUNCTION private.lead_cpf_matches_for(p_clinic_id uuid, p_lead_id uuid, p_cpf text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH d AS (SELECT regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') AS cpf)
  SELECT coalesce(jsonb_agg(m ORDER BY m ->> 'type' DESC, m ->> 'created_at'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object('type', 'patient', 'id', p.id, 'full_name', p.full_name, 'created_at', p.created_at) AS m
    FROM public.patients p, d
    WHERE d.cpf <> '' AND p.clinic_id = p_clinic_id AND regexp_replace(coalesce(p.cpf, ''), '\D', '', 'g') = d.cpf
    UNION ALL
    SELECT jsonb_build_object('type', 'lead', 'id', l.id, 'full_name', l.full_name, 'created_at', l.created_at,
                              'patient_id', l.patient_id)
    FROM public.leads l, d
    WHERE d.cpf <> '' AND l.clinic_id = p_clinic_id AND l.id <> p_lead_id AND l.deleted_at IS NULL
      AND regexp_replace(coalesce(l.cpf, ''), '\D', '', 'g') = d.cpf
  ) s;
$$;

REVOKE EXECUTE ON FUNCTION private.lead_cpf_matches_for(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- Equipe: com quem o CPF do lead coincide.
CREATE OR REPLACE FUNCTION public.lead_cpf_matches(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.is_clinic_staff(auth.uid(), v_lead.clinic_id) THEN
    RAISE EXCEPTION 'Lead não encontrado.' USING ERRCODE = '42501';
  END IF;
  RETURN private.lead_cpf_matches_for(v_lead.clinic_id, v_lead.id, v_lead.cpf);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lead_cpf_matches(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_cpf_matches(uuid) TO authenticated;

-- Equipe: "é a mesma pessoa" -> liga o lead à paciente que já tem esse CPF.
CREATE OR REPLACE FUNCTION public.lead_link_to_patient(p_lead_id uuid, p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_patient public.patients%ROWTYPE;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT public.is_clinic_staff(auth.uid(), v_lead.clinic_id) THEN
    RAISE EXCEPTION 'Lead não encontrado.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_patient FROM public.patients WHERE id = p_patient_id AND clinic_id = v_lead.clinic_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paciente não encontrada.' USING ERRCODE = '42501'; END IF;
  IF v_lead.patient_id IS NOT NULL AND v_lead.patient_id <> v_patient.id THEN
    RAISE EXCEPTION 'Este lead já está ligado a outra paciente.' USING ERRCODE = '22023';
  END IF;
  IF regexp_replace(coalesce(v_lead.cpf, ''), '\D', '', 'g') = ''
     OR regexp_replace(coalesce(v_lead.cpf, ''), '\D', '', 'g') <> regexp_replace(coalesce(v_patient.cpf, ''), '\D', '', 'g') THEN
    RAISE EXCEPTION 'O CPF do lead não é o mesmo da paciente.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.leads SET
    patient_id = v_patient.id,
    converted_at = coalesce(converted_at, now()),
    signup_flags = array_remove(signup_flags, 'cpf_duplicate'),
    last_interaction_at = now()
  WHERE id = v_lead.id;

  RETURN jsonb_build_object('ok', true, 'patient_id', v_patient.id, 'patient_name', v_patient.full_name);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lead_link_to_patient(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_link_to_patient(uuid, uuid) TO authenticated;

-- CPF do lead mudou: recalcula o aviso de CPF repetido (só para quem fez o cadastro pelo link).
CREATE OR REPLACE FUNCTION private.leads_recheck_cpf_duplicate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.signup_completed_at IS NULL OR NEW.patient_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF regexp_replace(coalesce(NEW.cpf, ''), '\D', '', 'g') IS NOT DISTINCT FROM regexp_replace(coalesce(OLD.cpf, ''), '\D', '', 'g') THEN
    RETURN NEW;
  END IF;
  NEW.signup_flags := array_remove(coalesce(NEW.signup_flags, '{}'), 'cpf_duplicate');
  IF jsonb_array_length(private.lead_cpf_matches_for(NEW.clinic_id, NEW.id, NEW.cpf)) > 0 THEN
    NEW.signup_flags := array_append(NEW.signup_flags, 'cpf_duplicate');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.leads_recheck_cpf_duplicate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS leads_recheck_cpf_duplicate ON public.leads;
CREATE TRIGGER leads_recheck_cpf_duplicate BEFORE UPDATE OF cpf ON public.leads
  FOR EACH ROW EXECUTE FUNCTION private.leads_recheck_cpf_duplicate();
