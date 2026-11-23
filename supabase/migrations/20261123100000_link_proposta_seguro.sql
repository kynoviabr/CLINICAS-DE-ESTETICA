-- Link de proposta seguro (épico 4).
-- Antes: /proposta/<id da proposta>, sem validade. Agora: código secreto de 64 caracteres,
-- guardado só como hash, vale 15 dias (padrão), pode ser invalidado pela equipe
-- e registra quando o cliente abriu. O link antigo por id deixa de funcionar.

CREATE TABLE IF NOT EXISTS public.proposal_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proposal_links_proposal_idx ON public.proposal_links (proposal_id, created_at DESC);

ALTER TABLE public.proposal_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff views proposal links" ON public.proposal_links;
CREATE POLICY "Staff views proposal links" ON public.proposal_links FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
REVOKE INSERT, UPDATE, DELETE ON public.proposal_links FROM anon, authenticated;

-- Equipe gera um link novo. Links anteriores continuam valendo até vencer ou serem invalidados.
CREATE OR REPLACE FUNCTION public.create_proposal_link(p_proposal_id uuid, p_days integer DEFAULT 15)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic uuid;
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires timestamptz;
BEGIN
  SELECT clinic_id INTO v_clinic FROM public.proposals WHERE id = p_proposal_id;
  IF v_clinic IS NULL OR NOT public.is_clinic_staff(auth.uid(), v_clinic) THEN
    RAISE EXCEPTION 'Proposta não encontrada.' USING ERRCODE = '42501';
  END IF;
  v_expires := now() + make_interval(days => least(greatest(coalesce(p_days, 15), 1), 90));
  INSERT INTO public.proposal_links (clinic_id, proposal_id, token_hash, expires_at, created_by)
  VALUES (v_clinic, p_proposal_id, private.anamnese_token_hash(v_token), v_expires, auth.uid());
  RETURN jsonb_build_object('token', v_token, 'expires_at', v_expires);
END;
$$;

-- Equipe invalida todos os links ativos da proposta (ex.: mandou para a pessoa errada).
CREATE OR REPLACE FUNCTION public.revoke_proposal_links(p_proposal_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic uuid;
  v_count integer;
BEGIN
  SELECT clinic_id INTO v_clinic FROM public.proposals WHERE id = p_proposal_id;
  IF v_clinic IS NULL OR NOT public.is_clinic_staff(auth.uid(), v_clinic) THEN
    RAISE EXCEPTION 'Proposta não encontrada.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.proposal_links SET revoked_at = now()
  WHERE proposal_id = p_proposal_id AND revoked_at IS NULL AND expires_at > now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_proposal_link(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_proposal_links(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_proposal_link(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_proposal_links(uuid) TO authenticated;

-- A versão antiga (por id) deixa de existir: links antigos não abrem mais.
DROP FUNCTION IF EXISTS public.get_public_proposal(uuid);

-- Cliente abre pelo código. Devolve {ok:false, reason} para link inválido, vencido ou invalidado.
-- Não expõe telefone, CPF, e-mail nem nascimento do cliente.
CREATE OR REPLACE FUNCTION public.get_public_proposal(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.proposal_links%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  SELECT * INTO v_link FROM public.proposal_links WHERE token_hash = private.anamnese_token_hash(p_token);
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;
  IF v_link.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'revoked'); END IF;
  IF v_link.expires_at < now() THEN RETURN jsonb_build_object('ok', false, 'reason', 'expired'); END IF;

  UPDATE public.proposal_links
  SET first_opened_at = coalesce(first_opened_at, now()), last_opened_at = now(), open_count = open_count + 1
  WHERE id = v_link.id;

  SELECT jsonb_build_object(
    'ok', true,
    'link_expires_at', v_link.expires_at,
    'id', p.id,
    'proposal_number', p.proposal_number,
    'created_at', p.created_at,
    'valid_until', p.valid_until,
    'status', p.status,
    'total_amount', p.total_amount,
    'final_amount', p.final_amount,
    'discount_amount', p.discount_amount,
    'discount_percent', p.discount_percent,
    'notes', p.notes,
    'patient', jsonb_build_object('full_name', pt.full_name),
    'clinic', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'phone', c.phone,
      'email', c.email,
      'city', c.city,
      'state', c.state,
      'address', c.address,
      'primary_color', c.primary_color,
      'logo_url', c.logo_url
    ),
    'items', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', pi.id,
        'treatment_id', pi.treatment_id,
        'treatment_name', t.name,
        'quantity', pi.quantity,
        'unit_price', pi.unit_price,
        'num_sessions', t.num_sessions
      )), '[]'::jsonb)
      FROM public.proposal_items pi
      LEFT JOIN public.treatments t ON t.id = pi.treatment_id
      WHERE pi.proposal_id = p.id
    )
  ) INTO v_result
  FROM public.proposals p
  LEFT JOIN public.patients pt ON pt.id = p.patient_id
  LEFT JOIN public.clinics c ON c.id = p.clinic_id
  WHERE p.id = v_link.proposal_id;

  RETURN coalesce(v_result, jsonb_build_object('ok', false, 'reason', 'invalid'));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_proposal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_proposal(text) TO anon, authenticated, service_role;
