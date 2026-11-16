-- Épico 10: verificação em duas etapas (código do aplicativo autenticador) para a equipe.
-- Obrigatória para administradores; a clínica pode exigir de toda a equipe.
-- O cadastro e o código são do Supabase Auth (TOTP). Perdeu o celular: um administrador zera pela função mfa-reset.

ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS mfa_required_all boolean NOT NULL DEFAULT false;

-- Precisa da segunda etapa? (para a tela decidir se pede cadastro do autenticador)
CREATE OR REPLACE FUNCTION public.my_mfa_policy()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'required', coalesce(bool_or(ur.role = 'admin' OR (c.mfa_required_all AND ur.role::text IN ('receptionist', 'professional', 'sales'))), false),
    'is_admin', coalesce(bool_or(ur.role = 'admin'), false)
  )
  FROM public.user_roles ur JOIN public.clinics c ON c.id = ur.clinic_id
  WHERE ur.user_id = auth.uid() AND ur.is_active;
$$;
REVOKE EXECUTE ON FUNCTION public.my_mfa_policy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_mfa_policy() TO authenticated;

-- Administrador liga/desliga "exigir de toda a equipe".
CREATE OR REPLACE FUNCTION public.set_clinic_mfa_required_all(p_clinic_id uuid, p_value boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_clinic_role(auth.uid(), p_clinic_id, 'admin') THEN RAISE EXCEPTION 'Só administradores.' USING ERRCODE = '42501'; END IF;
  UPDATE public.clinics SET mfa_required_all = coalesce(p_value, false) WHERE id = p_clinic_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_clinic_mfa_required_all(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_clinic_mfa_required_all(uuid, boolean) TO authenticated;
