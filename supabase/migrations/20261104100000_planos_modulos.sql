-- Planos e módulos (fundação)
-- Cada clínica tem um plano (clinics.plan_name). O plano liga módulos; exceções
-- por clínica (extras pagos, liberações) ficam em clinic_module_overrides.
-- Ver uma tela = o plano tem o módulo E o perfil da pessoa tem a permissão.
-- Baixar de plano nunca apaga dados: só esconde.

CREATE TABLE IF NOT EXISTS public.plans (
  key text PRIMARY KEY,
  name text NOT NULL,
  modules text[] NOT NULL,
  max_users integer,            -- null = sem limite
  sort integer NOT NULL DEFAULT 0
);

INSERT INTO public.plans (key, name, modules, max_users, sort) VALUES
  ('essencial',   'Essencial',   ARRAY['core','crm','automation'], 3, 1),
  ('clinica',     'Clínica',     ARRAY['core','crm','automation','clinical'], 10, 2),
  ('performance', 'Performance', ARRAY['core','crm','automation','clinical','performance','governance'], 25, 3),
  ('rede',        'Rede',        ARRAY['core','crm','automation','clinical','performance','governance','whatsapp_ai','white_label'], NULL, 4)
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name, modules = EXCLUDED.modules, max_users = EXCLUDED.max_users, sort = EXCLUDED.sort;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Planos visíveis para usuários" ON public.plans;
CREATE POLICY "Planos visíveis para usuários" ON public.plans FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.clinic_module_overrides (
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  enabled boolean NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, module_key)
);

ALTER TABLE public.clinic_module_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Equipe vê extras da clínica" ON public.clinic_module_overrides;
CREATE POLICY "Equipe vê extras da clínica" ON public.clinic_module_overrides FOR SELECT TO authenticated
  USING (public.user_belongs_to_clinic(auth.uid(), clinic_id));
-- Sem políticas de escrita: só a Kynovia (service role / SQL) altera.

-- Clínicas já existentes não perdem nada: vão para Performance.
UPDATE public.clinics SET plan_name = 'performance'
WHERE plan_name IS NULL OR plan_name NOT IN (SELECT key FROM public.plans);

-- Quem já usa o WhatsApp IA continua com ele como extra.
INSERT INTO public.clinic_module_overrides (clinic_id, module_key, enabled, note)
SELECT s.clinic_id, 'whatsapp_ai', true, 'Mantido na migração para planos'
FROM public.whatsapp_ai_settings s
WHERE s.is_enabled = true
ON CONFLICT (clinic_id, module_key) DO NOTHING;

ALTER TABLE public.clinics ALTER COLUMN plan_name SET DEFAULT 'essencial';
ALTER TABLE public.clinics DROP CONSTRAINT IF EXISTS clinics_plan_name_fkey;
ALTER TABLE public.clinics ADD CONSTRAINT clinics_plan_name_fkey
  FOREIGN KEY (plan_name) REFERENCES public.plans(key) ON UPDATE CASCADE;

-- A clínica não escolhe o próprio plano: pela API (anon/authenticated) o plano
-- não muda e clínica nova sempre nasce no padrão.
CREATE OR REPLACE FUNCTION public.clinics_guard_plan()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.plan_name := 'essencial';
      NEW.white_label_enabled := false;
    ELSIF NEW.plan_name IS DISTINCT FROM OLD.plan_name
       OR NEW.white_label_enabled IS DISTINCT FROM OLD.white_label_enabled THEN
      RAISE EXCEPTION 'O plano da clínica só pode ser alterado pela Kynovia.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clinics_guard_plan ON public.clinics;
CREATE TRIGGER clinics_guard_plan
  BEFORE INSERT OR UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.clinics_guard_plan();

-- Módulos ativos da clínica (plano + extras - bloqueios).
-- Quem chama precisa ser da clínica (ou ser o servidor, sem usuário).
CREATE OR REPLACE FUNCTION public.clinic_modules(p_clinic_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND NOT public.user_belongs_to_clinic(auth.uid(), p_clinic_id)
         AND NOT EXISTS (SELECT 1 FROM public.patient_users pu WHERE pu.auth_user_id = auth.uid() AND pu.clinic_id = p_clinic_id)
      THEN ARRAY[]::text[]
    ELSE COALESCE((
      SELECT array_agg(DISTINCT m ORDER BY m)
      FROM (
        SELECT unnest(p.modules) AS m
        FROM public.clinics c JOIN public.plans p ON p.key = c.plan_name
        WHERE c.id = p_clinic_id
        UNION
        SELECT o.module_key FROM public.clinic_module_overrides o
        WHERE o.clinic_id = p_clinic_id AND o.enabled
      ) all_modules
      WHERE m NOT IN (
        SELECT o.module_key FROM public.clinic_module_overrides o
        WHERE o.clinic_id = p_clinic_id AND NOT o.enabled
      )
    ), ARRAY[]::text[])
  END;
$$;

CREATE OR REPLACE FUNCTION public.clinic_has_module(p_clinic_id uuid, p_module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_module = ANY (public.clinic_modules(p_clinic_id));
$$;

-- A qual módulo pertence cada permissão de tela (espelha src/lib/accessPermissions.ts).
CREATE OR REPLACE FUNCTION public.permission_module(p_permission_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_permission_key
    WHEN 'crm.view' THEN 'crm'
    WHEN 'whatsapp_ai.view' THEN 'whatsapp_ai'
    WHEN 'sessions.view' THEN 'clinical'
    WHEN 'evolution.view' THEN 'clinical'
    WHEN 'photos.view' THEN 'clinical'
    WHEN 'feedback.view' THEN 'clinical'
    WHEN 'goals.view' THEN 'performance'
    WHEN 'reports.view' THEN 'performance'
    ELSE 'core'
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.clinic_modules(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_modules(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.clinic_has_module(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_has_module(uuid, text) TO authenticated;

-- Acesso a tela passa a exigir também o módulo do plano.
CREATE OR REPLACE FUNCTION public.has_menu_access(
  _user_id uuid,
  _clinic_id uuid,
  _permission_key text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.clinic_has_module(_clinic_id, public.permission_module(_permission_key)) THEN
    RETURN false;
  END IF;

  IF public.has_clinic_role(_user_id, _clinic_id, 'admin') THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_access_groups uag
    JOIN public.access_group_permissions agp ON agp.group_id = uag.group_id
    WHERE uag.clinic_id = _clinic_id
      AND uag.user_id = _user_id
      AND uag.is_active = true
      AND agp.clinic_id = _clinic_id
      AND agp.permission_key = _permission_key
      AND agp.can_view = true
  );
END;
$$;

-- Vagas de usuários: equipe ativa + convites pendentes válidos.
CREATE OR REPLACE FUNCTION public.clinic_seats(p_clinic_id uuid)
RETURNS TABLE (used integer, max_users integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    (
      (SELECT count(DISTINCT ur.user_id) FROM public.user_roles ur
        WHERE ur.clinic_id = p_clinic_id AND ur.is_active AND ur.role::text <> 'patient')
      +
      (SELECT count(*) FROM public.team_invitations ti
        WHERE ti.clinic_id = p_clinic_id AND ti.status = 'pending'
          AND (ti.expires_at IS NULL OR ti.expires_at > now()))
    )::integer,
    p.max_users
  FROM public.clinics c JOIN public.plans p ON p.key = c.plan_name
  WHERE c.id = p_clinic_id
    AND (auth.uid() IS NULL OR public.user_belongs_to_clinic(auth.uid(), p_clinic_id));
$$;

REVOKE EXECUTE ON FUNCTION public.clinic_seats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_seats(uuid) TO authenticated;

-- Convite novo (ou renovado) respeita o limite de usuários do plano.
CREATE OR REPLACE FUNCTION public.team_invitations_check_seats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max integer;
  v_used integer;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND (OLD.expires_at IS NULL OR OLD.expires_at > now()) THEN
    RETURN NEW; -- só renovou um convite que já ocupava a vaga
  END IF;

  SELECT p.max_users INTO v_max
  FROM public.clinics c JOIN public.plans p ON p.key = c.plan_name
  WHERE c.id = NEW.clinic_id;
  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    (SELECT count(DISTINCT ur.user_id) FROM public.user_roles ur
      WHERE ur.clinic_id = NEW.clinic_id AND ur.is_active AND ur.role::text <> 'patient')
    +
    (SELECT count(*) FROM public.team_invitations ti
      WHERE ti.clinic_id = NEW.clinic_id AND ti.status = 'pending'
        AND (ti.expires_at IS NULL OR ti.expires_at > now())
        AND ti.id IS DISTINCT FROM NEW.id
        AND lower(ti.email) <> lower(NEW.email))
  INTO v_used;

  IF v_used >= v_max THEN
    RAISE EXCEPTION 'Seu plano permite até % usuários. Desative alguém da equipe ou fale com a Kynovia para mudar de plano.', v_max
      USING ERRCODE = 'P0001', HINT = 'limite_usuarios';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.team_invitations_check_seats() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS team_invitations_check_seats ON public.team_invitations;
CREATE TRIGGER team_invitations_check_seats
  BEFORE INSERT OR UPDATE OF status, expires_at ON public.team_invitations
  FOR EACH ROW EXECUTE FUNCTION public.team_invitations_check_seats();
