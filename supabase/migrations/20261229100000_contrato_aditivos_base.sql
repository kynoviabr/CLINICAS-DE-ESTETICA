-- Revisão de contrato (entrega 1): aditivos com histórico.
-- Toda revisão vira um aditivo: tipo, motivo (obrigatório), o que mudou (antes -> depois), quem e quando.
-- Tipos: patient_data (corrigir dados do paciente; não exige novo aceite) e review_approved (aprovar revisão).
-- As próximas entregas usam a mesma tabela para payment, items e cancellation (com novo aceite do paciente).

CREATE TABLE IF NOT EXISTS public.contract_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('patient_data', 'review_approved', 'payment', 'items', 'cancellation')),
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'pending_acceptance', 'discarded')),
  requires_acceptance boolean NOT NULL DEFAULT false,
  reason text NOT NULL CHECK (length(trim(reason)) >= 5),
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  applied_at timestamptz
);
CREATE INDEX IF NOT EXISTS contract_amendments_contract_idx ON public.contract_amendments (contract_id, created_at DESC);
ALTER TABLE public.contract_amendments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff views contract amendments" ON public.contract_amendments;
CREATE POLICY "Staff views contract amendments" ON public.contract_amendments FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
REVOKE INSERT, UPDATE, DELETE ON public.contract_amendments FROM anon, authenticated;

-- Corrigir dados do paciente a partir do contrato (fica registrado; não exige novo aceite).
CREATE OR REPLACE FUNCTION public.amend_contract_patient_data(p_contract_id uuid, p_changes jsonb, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c public.contracts%ROWTYPE;
  v_before jsonb; v_after jsonb; v_diff jsonb := '{}'::jsonb;
  k text;
  allowed text[] := ARRAY['full_name','cpf','email','phone','date_of_birth','address','address_number','address_complement','zip_code','city','state'];
  v_id uuid;
BEGIN
  SELECT * INTO v_c FROM public.contracts WHERE id = p_contract_id;
  IF v_c.id IS NULL OR NOT public.is_clinic_staff(auth.uid(), v_c.clinic_id) THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501'; END IF;
  IF v_c.process_status = 'cancelled' THEN RAISE EXCEPTION 'Contrato cancelado não pode ser revisado.' USING ERRCODE = '22023'; END IF;
  IF length(trim(coalesce(p_reason, ''))) < 5 THEN RAISE EXCEPTION 'Informe o motivo da revisão.' USING ERRCODE = '22023'; END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' THEN RAISE EXCEPTION 'Nada para alterar.' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_changes) LOOP
    IF NOT k = ANY(allowed) THEN RAISE EXCEPTION 'Campo não pode ser alterado: %', k USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF p_changes ? 'full_name' AND length(trim(coalesce(p_changes->>'full_name', ''))) < 2 THEN
    RAISE EXCEPTION 'Nome do paciente é obrigatório.' USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(p) INTO v_before FROM public.patients p WHERE p.id = v_c.patient_id FOR UPDATE;

  UPDATE public.patients p SET
    full_name = CASE WHEN p_changes ? 'full_name' THEN trim(p_changes->>'full_name') ELSE p.full_name END,
    cpf = CASE WHEN p_changes ? 'cpf' THEN nullif(trim(p_changes->>'cpf'), '') ELSE p.cpf END,
    email = CASE WHEN p_changes ? 'email' THEN nullif(trim(p_changes->>'email'), '') ELSE p.email END,
    phone = CASE WHEN p_changes ? 'phone' THEN nullif(trim(p_changes->>'phone'), '') ELSE p.phone END,
    date_of_birth = CASE WHEN p_changes ? 'date_of_birth' THEN nullif(p_changes->>'date_of_birth', '')::date ELSE p.date_of_birth END,
    address = CASE WHEN p_changes ? 'address' THEN nullif(trim(p_changes->>'address'), '') ELSE p.address END,
    address_number = CASE WHEN p_changes ? 'address_number' THEN nullif(trim(p_changes->>'address_number'), '') ELSE p.address_number END,
    address_complement = CASE WHEN p_changes ? 'address_complement' THEN nullif(trim(p_changes->>'address_complement'), '') ELSE p.address_complement END,
    zip_code = CASE WHEN p_changes ? 'zip_code' THEN nullif(trim(p_changes->>'zip_code'), '') ELSE p.zip_code END,
    city = CASE WHEN p_changes ? 'city' THEN nullif(trim(p_changes->>'city'), '') ELSE p.city END,
    state = CASE WHEN p_changes ? 'state' THEN nullif(trim(p_changes->>'state'), '') ELSE p.state END,
    updated_at = now()
  WHERE p.id = v_c.patient_id;

  SELECT to_jsonb(p) INTO v_after FROM public.patients p WHERE p.id = v_c.patient_id;
  FOREACH k IN ARRAY allowed LOOP
    IF (v_before->k) IS DISTINCT FROM (v_after->k) THEN
      v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('before', v_before->k, 'after', v_after->k));
    END IF;
  END LOOP;
  IF v_diff = '{}'::jsonb THEN RAISE EXCEPTION 'Nenhum dado foi alterado.' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.contract_amendments (clinic_id, contract_id, kind, status, requires_acceptance, reason, changes, applied_at)
  VALUES (v_c.clinic_id, v_c.id, 'patient_data', 'applied', false, trim(p_reason), jsonb_build_object('patient', v_diff), now())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.amend_contract_patient_data(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.amend_contract_patient_data(uuid, jsonb, text) TO authenticated;

-- Contrato em "Precisam de revisão": aprovar e voltar para Ativo (motivo registrado).
CREATE OR REPLACE FUNCTION public.approve_contract_review(p_contract_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_c public.contracts%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO v_c FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF v_c.id IS NULL OR NOT public.is_clinic_staff(auth.uid(), v_c.clinic_id) THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501'; END IF;
  IF v_c.process_status <> 'overdue' THEN RAISE EXCEPTION 'Este contrato não está aguardando revisão.' USING ERRCODE = '22023'; END IF;
  IF length(trim(coalesce(p_reason, ''))) < 5 THEN RAISE EXCEPTION 'Informe o motivo da aprovação.' USING ERRCODE = '22023'; END IF;
  UPDATE public.contracts SET process_status = 'confirmed', status = 'active', confirmed_at = coalesce(confirmed_at, now()), updated_at = now()
  WHERE id = v_c.id;
  INSERT INTO public.contract_amendments (clinic_id, contract_id, kind, status, reason, changes, applied_at)
  VALUES (v_c.clinic_id, v_c.id, 'review_approved', 'applied', trim(p_reason),
          jsonb_build_object('process_status', jsonb_build_object('before', 'overdue', 'after', 'confirmed')), now())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.approve_contract_review(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_contract_review(uuid, text) TO authenticated;
