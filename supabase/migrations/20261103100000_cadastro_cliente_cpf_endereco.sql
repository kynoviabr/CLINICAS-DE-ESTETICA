-- Cadastro de cliente (CK-6 e CK-7)
-- 1) Número e complemento do endereço em campos próprios (vão para o contrato).
-- 2) CPF único por clínica, comparando só os dígitos. Vale para cadastros novos
--    e para quem trocar o CPF; registros antigos repetidos não são bloqueados
--    até alguém editar o CPF deles.
-- 3) Função para a tela avisar sobre CPF/telefone já usados (respeita RLS).

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS address_complement text;

CREATE INDEX IF NOT EXISTS idx_patients_cpf_digits
  ON public.patients (clinic_id, (regexp_replace(cpf, '\D', '', 'g')))
  WHERE cpf IS NOT NULL AND cpf <> '';

CREATE INDEX IF NOT EXISTS idx_patients_phone_digits
  ON public.patients (clinic_id, (regexp_replace(phone, '\D', '', 'g')))
  WHERE phone IS NOT NULL AND phone <> '';

CREATE OR REPLACE FUNCTION public.patients_block_duplicate_cpf()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_digits text := regexp_replace(coalesce(NEW.cpf, ''), '\D', '', 'g');
  v_other text;
BEGIN
  IF v_digits = '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND regexp_replace(coalesce(OLD.cpf, ''), '\D', '', 'g') = v_digits
     AND OLD.clinic_id = NEW.clinic_id THEN
    RETURN NEW;
  END IF;

  SELECT p.full_name INTO v_other
  FROM public.patients p
  WHERE p.clinic_id = NEW.clinic_id
    AND p.id <> NEW.id
    AND regexp_replace(coalesce(p.cpf, ''), '\D', '', 'g') = v_digits
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'CPF já cadastrado para outro cliente: %', v_other
      USING ERRCODE = 'unique_violation', HINT = 'cpf_duplicado';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.patients_block_duplicate_cpf() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS patients_block_duplicate_cpf ON public.patients;
CREATE TRIGGER patients_block_duplicate_cpf
  BEFORE INSERT OR UPDATE OF cpf, clinic_id ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.patients_block_duplicate_cpf();

-- Procura clientes da clínica com o mesmo CPF ou telefone (só dígitos).
-- SECURITY INVOKER: quem chama só enxerga o que o RLS já permite.
CREATE OR REPLACE FUNCTION public.find_patient_duplicates(
  p_clinic_id uuid,
  p_cpf text,
  p_phone text,
  p_exclude_id uuid DEFAULT NULL
)
RETURNS TABLE (match_type text, patient_id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT 'cpf'::text, p.id, p.full_name
  FROM public.patients p
  WHERE p.clinic_id = p_clinic_id
    AND (p_exclude_id IS NULL OR p.id <> p_exclude_id)
    AND length(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')) > 0
    AND p.cpf IS NOT NULL AND p.cpf <> ''
    AND regexp_replace(p.cpf, '\D', '', 'g') = regexp_replace(p_cpf, '\D', '', 'g')
  UNION ALL
  SELECT 'phone'::text, p.id, p.full_name
  FROM public.patients p
  WHERE p.clinic_id = p_clinic_id
    AND (p_exclude_id IS NULL OR p.id <> p_exclude_id)
    AND length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) > 0
    AND p.phone IS NOT NULL AND p.phone <> ''
    AND regexp_replace(p.phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
  LIMIT 20;
$$;

REVOKE EXECUTE ON FUNCTION public.find_patient_duplicates(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_patient_duplicates(uuid, text, text, uuid) TO authenticated;
