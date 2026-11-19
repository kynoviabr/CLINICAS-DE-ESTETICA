-- Identidade do profissional (conceito do Aura)
-- professionals.id passa a ser a identidade do profissional em toda a agenda:
-- atendimentos, sessões, disponibilidade, bloqueios, lista de espera e avaliações.
-- professionals.user_id fica opcional: só para quem precisa entrar no sistema.
-- Assim dá para ter profissional parceira sem login, sem ocupar vaga do plano,
-- e o histórico não depende da conta de acesso.

-- 1) Login opcional (o UNIQUE (clinic_id, user_id) já existe e aceita vários NULL).
ALTER TABLE public.professionals ALTER COLUMN user_id DROP NOT NULL;

-- 2) Quem aparece na agenda pelo login mas não tem cadastro de profissional ganha um.
WITH refs AS (
  SELECT clinic_id, professional_id AS uid FROM public.appointments WHERE professional_id IS NOT NULL
  UNION SELECT clinic_id, professional_id FROM public.session_records WHERE professional_id IS NOT NULL
  UNION SELECT clinic_id, professional_id FROM public.professional_availability
  UNION SELECT clinic_id, professional_id FROM public.appointment_blocks WHERE professional_id IS NOT NULL
  UNION SELECT clinic_id, preferred_professional_id FROM public.appointment_waitlist WHERE preferred_professional_id IS NOT NULL
  UNION SELECT clinic_id, matched_professional_id FROM public.waitlist_notifications WHERE matched_professional_id IS NOT NULL
  UNION SELECT clinic_id, professional_id FROM public.session_feedback WHERE professional_id IS NOT NULL
)
INSERT INTO public.professionals (clinic_id, user_id, full_name, email, status)
SELECT DISTINCT r.clinic_id, r.uid,
  COALESCE(NULLIF(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1), 'Profissional'),
  u.email, 'active'
FROM refs r
JOIN auth.users u ON u.id = r.uid
WHERE NOT EXISTS (
  SELECT 1 FROM public.professionals p WHERE p.clinic_id = r.clinic_id AND p.user_id = r.uid
);

-- 3) Troca login -> cadastro em cada coluna, com chave estrangeira nova.
CREATE OR REPLACE FUNCTION pg_temp.convert_professional_column(p_table text, p_column text, p_on_delete text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  fk record;
  orphans integer;
BEGIN
  FOR fk IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f' AND c.conrelid = format('public.%I', p_table)::regclass AND a.attname = p_column
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', p_table, fk.conname);
  END LOOP;

  EXECUTE format(
    'UPDATE public.%1$I t SET %2$I = p.id FROM public.professionals p
      WHERE p.user_id = t.%2$I AND p.clinic_id = t.clinic_id
        AND NOT EXISTS (SELECT 1 FROM public.professionals x WHERE x.id = t.%2$I)',
    p_table, p_column);

  EXECUTE format(
    'SELECT count(*) FROM public.%1$I t WHERE t.%2$I IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = t.%2$I AND p.clinic_id = t.clinic_id)',
    p_table, p_column) INTO orphans;
  IF orphans > 0 THEN
    RAISE EXCEPTION '% linha(s) de %.% sem profissional correspondente na mesma clínica', orphans, p_table, p_column;
  END IF;

  EXECUTE format(
    'ALTER TABLE public.%1$I ADD CONSTRAINT %2$I FOREIGN KEY (%3$I) REFERENCES public.professionals(id) ON DELETE %4$s',
    p_table, p_table || '_' || p_column || '_fkey', p_column, p_on_delete);
END;
$$;

SELECT pg_temp.convert_professional_column('appointments', 'professional_id', 'RESTRICT');
SELECT pg_temp.convert_professional_column('session_records', 'professional_id', 'RESTRICT');
SELECT pg_temp.convert_professional_column('professional_availability', 'professional_id', 'CASCADE');
SELECT pg_temp.convert_professional_column('appointment_blocks', 'professional_id', 'CASCADE');
SELECT pg_temp.convert_professional_column('appointment_waitlist', 'preferred_professional_id', 'SET NULL');
SELECT pg_temp.convert_professional_column('waitlist_notifications', 'matched_professional_id', 'SET NULL');
SELECT pg_temp.convert_professional_column('session_feedback', 'professional_id', 'SET NULL');

COMMENT ON COLUMN public.appointments.professional_id IS 'Identidade do profissional: public.professionals.id (não é o login).';
COMMENT ON COLUMN public.professionals.user_id IS 'Login opcional do profissional (auth.users.id). Profissional sem login também tem agenda.';

-- 4) O profissional precisa ser da mesma clínica do registro.
CREATE OR REPLACE FUNCTION public.enforce_agenda_professional_clinic()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_professional uuid := NULLIF(to_jsonb(NEW) ->> TG_ARGV[0], '')::uuid;
BEGIN
  IF v_professional IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = v_professional AND p.clinic_id = NEW.clinic_id) THEN
    RAISE EXCEPTION 'Profissional % não pertence à clínica %', v_professional, NEW.clinic_id USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_agenda_professional_clinic() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS appointments_professional_clinic ON public.appointments;
CREATE TRIGGER appointments_professional_clinic BEFORE INSERT OR UPDATE OF professional_id, clinic_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agenda_professional_clinic('professional_id');
DROP TRIGGER IF EXISTS session_records_professional_clinic ON public.session_records;
CREATE TRIGGER session_records_professional_clinic BEFORE INSERT OR UPDATE OF professional_id, clinic_id ON public.session_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agenda_professional_clinic('professional_id');
DROP TRIGGER IF EXISTS availability_professional_clinic ON public.professional_availability;
CREATE TRIGGER availability_professional_clinic BEFORE INSERT OR UPDATE OF professional_id, clinic_id ON public.professional_availability
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agenda_professional_clinic('professional_id');
DROP TRIGGER IF EXISTS blocks_professional_clinic ON public.appointment_blocks;
CREATE TRIGGER blocks_professional_clinic BEFORE INSERT OR UPDATE OF professional_id, clinic_id ON public.appointment_blocks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agenda_professional_clinic('professional_id');
DROP TRIGGER IF EXISTS waitlist_professional_clinic ON public.appointment_waitlist;
CREATE TRIGGER waitlist_professional_clinic BEFORE INSERT OR UPDATE OF preferred_professional_id, clinic_id ON public.appointment_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agenda_professional_clinic('preferred_professional_id');
DROP TRIGGER IF EXISTS waitlist_notifications_professional_clinic ON public.waitlist_notifications;
CREATE TRIGGER waitlist_notifications_professional_clinic BEFORE INSERT OR UPDATE OF matched_professional_id, clinic_id ON public.waitlist_notifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agenda_professional_clinic('matched_professional_id');
DROP TRIGGER IF EXISTS session_feedback_professional_clinic ON public.session_feedback;
CREATE TRIGGER session_feedback_professional_clinic BEFORE INSERT OR UPDATE OF professional_id, clinic_id ON public.session_feedback
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agenda_professional_clinic('professional_id');

-- 5) Para a tela do profissional logado: "meu cadastro de profissional nesta clínica".
CREATE OR REPLACE FUNCTION public.my_professional_id(p_clinic_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id FROM public.professionals p
  WHERE p.clinic_id = p_clinic_id AND p.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.my_professional_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_professional_id(uuid) TO authenticated;
