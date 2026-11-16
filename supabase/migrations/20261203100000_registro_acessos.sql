-- Épico 11: registro de acesso a prontuário, fotos, anamnese e contratos (LGPD: dado sensível de saúde).
-- Quem, quando, qual paciente e o quê. Só o administrador consulta. Ninguém altera nem apaga (nem pelo app).
-- Guardado por 5 anos (limpeza só por rotina de retenção do próprio banco).

CREATE TABLE IF NOT EXISTS public.access_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('record_view', 'anamnese_view', 'anamnese_document', 'photos_view', 'contract_view', 'file_view', 'data_export', 'data_anonymize')),
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS access_logs_patient_idx ON public.access_logs (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS access_logs_clinic_idx ON public.access_logs (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS access_logs_user_idx ON public.access_logs (clinic_id, user_id, created_at DESC);
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin views access logs" ON public.access_logs;
CREATE POLICY "Admin views access logs" ON public.access_logs FOR SELECT TO authenticated
  USING (public.has_clinic_role(auth.uid(), clinic_id, 'admin'));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.access_logs FROM anon, authenticated;

-- Registro imutável: bloqueia alteração e exclusão linha a linha (só a retenção de 5 anos apaga).
CREATE OR REPLACE FUNCTION private.access_logs_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Retenção de 5 anos e clínica excluída (cascata) podem apagar.
  IF TG_OP = 'DELETE' AND (OLD.created_at < now() - interval '5 years' OR NOT EXISTS (SELECT 1 FROM public.clinics WHERE id = OLD.clinic_id)) THEN RETURN OLD; END IF;
  -- Paciente excluído: o registro fica, só perde o vínculo (ON DELETE SET NULL).
  IF TG_OP = 'UPDATE' AND NEW.patient_id IS NULL AND OLD.patient_id IS NOT NULL
     AND NEW.clinic_id = OLD.clinic_id AND NEW.user_id = OLD.user_id AND NEW.action = OLD.action
     AND NEW.detail IS NOT DISTINCT FROM OLD.detail AND NEW.created_at = OLD.created_at THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'O registro de acessos não pode ser alterado nem apagado.' USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS access_logs_immutable ON public.access_logs;
CREATE TRIGGER access_logs_immutable BEFORE UPDATE OR DELETE ON public.access_logs
  FOR EACH ROW EXECUTE FUNCTION private.access_logs_immutable();

-- Equipe registra o acesso (o servidor confere que o paciente é da clínica de quem acessa).
CREATE OR REPLACE FUNCTION public.log_patient_access(p_patient_id uuid, p_action text, p_detail text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_clinic uuid;
BEGIN
  SELECT clinic_id INTO v_clinic FROM public.patients WHERE id = p_patient_id;
  IF v_clinic IS NULL OR NOT public.is_clinic_staff(auth.uid(), v_clinic) THEN RETURN; END IF;
  -- Evita repetir o mesmo registro em sequência (ex.: recarregar a tela).
  IF EXISTS (SELECT 1 FROM public.access_logs WHERE user_id = auth.uid() AND patient_id = p_patient_id AND action = p_action
             AND coalesce(detail, '') = coalesce(p_detail, '') AND created_at > now() - interval '5 minutes') THEN RETURN; END IF;
  INSERT INTO public.access_logs (clinic_id, user_id, patient_id, action, detail)
  VALUES (v_clinic, auth.uid(), p_patient_id, p_action, left(p_detail, 200));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.log_patient_access(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_patient_access(uuid, text, text) TO authenticated;

-- Consulta do administrador, com o nome de quem acessou e do paciente.
CREATE OR REPLACE FUNCTION public.access_log_list(p_clinic_id uuid, p_patient_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_limit integer DEFAULT 200)
RETURNS TABLE (id bigint, created_at timestamptz, user_id uuid, user_name text, patient_id uuid, patient_name text, action text, detail text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_clinic_role(auth.uid(), p_clinic_id, 'admin') THEN RAISE EXCEPTION 'Só administradores.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT l.id, l.created_at, l.user_id,
    (SELECT coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email::text) FROM auth.users u WHERE u.id = l.user_id),
    l.patient_id, p.full_name, l.action, l.detail
  FROM public.access_logs l LEFT JOIN public.patients p ON p.id = l.patient_id
  WHERE l.clinic_id = p_clinic_id
    AND (p_patient_id IS NULL OR l.patient_id = p_patient_id)
    AND (p_user_id IS NULL OR l.user_id = p_user_id)
  ORDER BY l.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 200), 1), 1000);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.access_log_list(uuid, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.access_log_list(uuid, uuid, uuid, integer) TO authenticated;
