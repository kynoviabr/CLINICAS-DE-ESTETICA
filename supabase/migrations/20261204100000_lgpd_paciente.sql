-- Épico 19: consentimento e direitos do paciente (LGPD).
-- 1) Consentimentos registrados: tratamento de dados, fotos clínicas e uso de imagem em divulgação (separado).
--    Vêm da anamnese (automático) ou da equipe (ex.: paciente revogou).
-- 2) Foto só pode ser marcada para divulgação com consentimento de imagem vigente.
-- 3) Exportar todos os dados de um paciente (pedido de cópia) e anonimizar o cadastro (pedido de exclusão),
--    mantendo o prontuário clínico pelo prazo legal de guarda.

CREATE TABLE IF NOT EXISTS public.patient_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('data_processing', 'photos_clinical', 'image_marketing')),
  granted boolean NOT NULL,
  source text NOT NULL CHECK (source IN ('anamnese', 'staff')),
  anamnese_id uuid,
  note text,
  recorded_by uuid DEFAULT auth.uid(),
  -- clock_timestamp: registros na mesma transação ficam em ordem (o mais recente vale).
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS patient_consents_patient_idx ON public.patient_consents (patient_id, kind, created_at DESC);
ALTER TABLE public.patient_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff views consents" ON public.patient_consents;
CREATE POLICY "Staff views consents" ON public.patient_consents FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
DROP POLICY IF EXISTS "Patient views own consents" ON public.patient_consents;
CREATE POLICY "Patient views own consents" ON public.patient_consents FOR SELECT TO authenticated
  USING (patient_id IN (SELECT public.get_patient_ids_for_user(auth.uid())));
REVOKE INSERT, UPDATE, DELETE ON public.patient_consents FROM anon, authenticated;

-- Consentimento vigente (o registro mais recente de cada tipo).
CREATE OR REPLACE FUNCTION public.patient_consent_granted(p_patient_id uuid, p_kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((SELECT granted FROM public.patient_consents WHERE patient_id = p_patient_id AND kind = p_kind ORDER BY created_at DESC LIMIT 1), false);
$$;

-- Da anamnese: grava os consentimentos marcados no formulário.
CREATE OR REPLACE FUNCTION private.consents_from_anamnese()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE c jsonb := NEW.form_data -> 'consent';
BEGIN
  IF c IS NULL OR jsonb_typeof(c) <> 'object' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.form_data -> 'consent' IS NOT DISTINCT FROM c THEN RETURN NEW; END IF;
  INSERT INTO public.patient_consents (clinic_id, patient_id, kind, granted, source, anamnese_id, recorded_by)
  SELECT NEW.clinic_id, NEW.patient_id, k.kind, coalesce((c ->> k.field)::boolean, false), 'anamnese', NEW.id, auth.uid()
  FROM (VALUES ('data_processing', 'agrees_data_usage'), ('photos_clinical', 'agrees_photos'), ('image_marketing', 'agrees_photos_marketing')) AS k(kind, field)
  WHERE c ? k.field;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS patient_anamneses_consents ON public.patient_anamneses;
CREATE TRIGGER patient_anamneses_consents AFTER INSERT OR UPDATE OF form_data ON public.patient_anamneses
  FOR EACH ROW EXECUTE FUNCTION private.consents_from_anamnese();

-- Equipe registra (ex.: revogação pedida pelo paciente).
CREATE OR REPLACE FUNCTION public.set_patient_consent(p_patient_id uuid, p_kind text, p_granted boolean, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_clinic uuid;
BEGIN
  SELECT clinic_id INTO v_clinic FROM public.patients WHERE id = p_patient_id;
  IF v_clinic IS NULL OR NOT public.is_clinic_staff(auth.uid(), v_clinic) THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.patient_consents (clinic_id, patient_id, kind, granted, source, note)
  VALUES (v_clinic, p_patient_id, p_kind, p_granted, 'staff', left(p_note, 300));
  -- Revogou o uso de imagem: tira as fotos da divulgação.
  IF p_kind = 'image_marketing' AND NOT p_granted THEN
    UPDATE public.patient_photos SET marketing_allowed = false WHERE patient_id = p_patient_id AND marketing_allowed;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_patient_consent(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_patient_consent(uuid, text, boolean, text) TO authenticated;

-- Foto liberada para divulgação só com consentimento de imagem vigente.
ALTER TABLE public.patient_photos ADD COLUMN IF NOT EXISTS marketing_allowed boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION private.photo_marketing_needs_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.marketing_allowed AND NOT public.patient_consent_granted(NEW.patient_id, 'image_marketing') THEN
    RAISE EXCEPTION 'Sem consentimento de uso de imagem para divulgação deste paciente.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS patient_photos_marketing_consent ON public.patient_photos;
CREATE TRIGGER patient_photos_marketing_consent BEFORE INSERT OR UPDATE OF marketing_allowed ON public.patient_photos
  FOR EACH ROW EXECUTE FUNCTION private.photo_marketing_needs_consent();

-- Pedido de cópia: todos os dados do paciente em um arquivo (só administrador).
CREATE OR REPLACE FUNCTION public.export_patient_data(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_clinic uuid; v jsonb;
BEGIN
  SELECT clinic_id INTO v_clinic FROM public.patients WHERE id = p_patient_id;
  IF v_clinic IS NULL OR NOT public.has_clinic_role(auth.uid(), v_clinic, 'admin') THEN RAISE EXCEPTION 'Só administradores.' USING ERRCODE = '42501'; END IF;
  SELECT jsonb_build_object(
    'exported_at', now(),
    'patient', (SELECT to_jsonb(p) - 'user_id' FROM public.patients p WHERE p.id = p_patient_id),
    'consents', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.created_at), '[]') FROM public.patient_consents c WHERE c.patient_id = p_patient_id),
    'anamneses', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at), '[]') FROM public.patient_anamneses a WHERE a.patient_id = p_patient_id),
    'appointments', (SELECT coalesce(jsonb_agg(jsonb_build_object('start_time', a.start_time, 'status', a.status, 'type', a.appointment_type, 'notes', a.notes) ORDER BY a.start_time), '[]') FROM public.appointments a WHERE a.patient_id = p_patient_id),
    'sessions', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.performed_at), '[]') FROM public.session_records s WHERE s.patient_id = p_patient_id),
    'proposals', (SELECT coalesce(jsonb_agg(jsonb_build_object('number', pr.proposal_number, 'status', pr.status, 'final_amount', pr.final_amount, 'created_at', pr.created_at) ORDER BY pr.created_at), '[]') FROM public.proposals pr WHERE pr.patient_id = p_patient_id),
    'contracts', (SELECT coalesce(jsonb_agg(jsonb_build_object('number', c.contract_number, 'status', c.status, 'signed_at', c.signed_at, 'created_at', c.created_at) ORDER BY c.created_at), '[]') FROM public.contracts c WHERE c.patient_id = p_patient_id),
    'photos', (SELECT coalesce(jsonb_agg(jsonb_build_object('taken_at', ph.taken_at, 'type', ph.photo_type, 'description', ph.description, 'file', ph.photo_url) ORDER BY ph.taken_at), '[]') FROM public.patient_photos ph WHERE ph.patient_id = p_patient_id)
  ) INTO v;
  INSERT INTO public.access_logs (clinic_id, user_id, patient_id, action, detail) VALUES (v_clinic, auth.uid(), p_patient_id, 'data_export', 'Pedido de cópia (LGPD)');
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.export_patient_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_patient_data(uuid) TO authenticated;

-- Pedido de exclusão: apaga os dados pessoais e mantém o prontuário clínico (guarda obrigatória).
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;
CREATE OR REPLACE FUNCTION public.anonymize_patient(p_patient_id uuid, p_confirm text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_clinic uuid;
BEGIN
  SELECT clinic_id INTO v_clinic FROM public.patients WHERE id = p_patient_id;
  IF v_clinic IS NULL OR NOT public.has_clinic_role(auth.uid(), v_clinic, 'admin') THEN RAISE EXCEPTION 'Só administradores.' USING ERRCODE = '42501'; END IF;
  IF upper(trim(coalesce(p_confirm, ''))) <> 'ANONIMIZAR' THEN RAISE EXCEPTION 'Digite ANONIMIZAR para confirmar.' USING ERRCODE = '22023'; END IF;
  UPDATE public.patients SET
    full_name = 'Paciente anonimizado ' || left(id::text, 8), cpf = NULL, email = NULL, phone = NULL, date_of_birth = NULL,
    address = NULL, address_number = NULL, address_complement = NULL, zip_code = NULL, city = NULL, state = NULL,
    avatar_url = NULL, notes = NULL, gender = NULL, referral_code = NULL, status = 'inactive', anonymized_at = now()
  WHERE id = p_patient_id;
  UPDATE public.patient_users SET status = 'inactive' WHERE patient_id = p_patient_id;
  UPDATE public.patient_photos SET marketing_allowed = false WHERE patient_id = p_patient_id;
  UPDATE public.leads SET full_name = 'Contato anonimizado', phone = NULL, email = NULL WHERE patient_id = p_patient_id;
  INSERT INTO public.access_logs (clinic_id, user_id, patient_id, action, detail) VALUES (v_clinic, auth.uid(), p_patient_id, 'data_anonymize', 'Pedido de exclusão (LGPD)');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.anonymize_patient(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anonymize_patient(uuid, text) TO authenticated;
