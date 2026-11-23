-- Login seguro: convites de equipe só valem com e-mail confirmado, expiram,
-- e cada pessoa pertence a uma clínica só (até existir o seletor de clínicas).

-- 1) Convite com validade
ALTER TABLE public.team_invitations
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE public.team_invitations
   SET expires_at = now() + interval '7 days'
 WHERE expires_at IS NULL AND status = 'pending';

ALTER TABLE public.team_invitations
  ALTER COLUMN expires_at SET DEFAULT now() + interval '7 days';

-- E-mails do convite sempre minúsculos e sem espaços
UPDATE public.team_invitations SET email = lower(trim(email)) WHERE email <> lower(trim(email));

-- 2) Uma clínica ativa por pessoa
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_active_clinic_per_user
  ON public.user_roles (user_id) WHERE is_active;

-- 3) Aceite do convite só com e-mail confirmado
CREATE OR REPLACE FUNCTION public.process_team_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv record;
BEGIN
  IF NEW.email IS NULL OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Já pertence a uma clínica: o convite fica pendente (não troca de clínica sozinho).
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id AND is_active) THEN
    RETURN NEW;
  END IF;

  SELECT id, clinic_id, role
    INTO inv
    FROM public.team_invitations
   WHERE email = lower(trim(NEW.email))
     AND status = 'pending'
     AND (expires_at IS NULL OR expires_at > now())
   ORDER BY created_at DESC
   LIMIT 1;

  IF inv.id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.user_roles (user_id, clinic_id, role, is_active)
    VALUES (NEW.id, inv.clinic_id, inv.role, true);

    UPDATE public.team_invitations
       SET status = 'accepted', accepted_at = now()
     WHERE id = inv.id;
  EXCEPTION WHEN others THEN
    -- Nunca impedir o cadastro/confirmação da conta por causa do convite.
    RAISE WARNING 'process_team_invitation: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.process_team_invitation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_process_invitations ON auth.users;
CREATE TRIGGER on_auth_user_created_process_invitations
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN (NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.process_team_invitation();

DROP TRIGGER IF EXISTS on_auth_user_confirmed_process_invitations ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_process_invitations
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.process_team_invitation();

-- 4) Busca de conta por e-mail para as Edge Functions (só service_role)
CREATE OR REPLACE FUNCTION public.find_auth_user_by_email(p_email text)
RETURNS TABLE (id uuid, email_confirmed boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email_confirmed_at IS NOT NULL
    FROM auth.users u
   WHERE lower(u.email) = lower(trim(p_email))
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.find_auth_user_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_auth_user_by_email(text) TO service_role;
