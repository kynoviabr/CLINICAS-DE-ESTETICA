-- Revisão de contrato (entrega 2): alterar a forma de pagamento com novo aceite do paciente.
-- 1) A equipe propõe as novas formas para o SALDO EM ABERTO (parcelas ainda não pagas). Parcelas pagas não mudam.
-- 2) O aditivo fica "aguardando aceite": nada muda no financeiro até o paciente aceitar pelo link.
-- 3) No aceite (nome + data de nascimento/CPF, com registro de IP, aparelho e data), as parcelas em aberto
--    são substituídas pelas novas. A equipe pode desistir antes do aceite.

ALTER TABLE public.contract_amendments
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_name text,
  ADD COLUMN IF NOT EXISTS accepted_verified_by text,
  ADD COLUMN IF NOT EXISTS accepted_ip text,
  ADD COLUMN IF NOT EXISTS accepted_user_agent text,
  ADD COLUMN IF NOT EXISTS accepted_hash text,
  ADD COLUMN IF NOT EXISTS discarded_at timestamptz;

-- No máximo um aditivo aguardando aceite por contrato.
CREATE UNIQUE INDEX IF NOT EXISTS contract_amendments_one_pending ON public.contract_amendments (contract_id) WHERE status = 'pending_acceptance';

-- Links do aditivo usam a mesma tabela de links do contrato.
ALTER TABLE public.contract_links ADD COLUMN IF NOT EXISTS amendment_id uuid REFERENCES public.contract_amendments(id) ON DELETE CASCADE;
ALTER TABLE public.contract_links DROP CONSTRAINT IF EXISTS contract_links_purpose_check;
ALTER TABLE public.contract_links ADD CONSTRAINT contract_links_purpose_check CHECK (purpose IN ('sign', 'copy', 'amendment'));

-- Só link de assinatura registra assinatura do contrato.
CREATE OR REPLACE FUNCTION private.contract_signature_not_from_copy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.link_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.contract_links WHERE id = NEW.link_id AND purpose <> 'sign') THEN
    RAISE EXCEPTION 'Este link não serve para assinar o contrato.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Saldo em aberto = soma das parcelas previstas (não pagas, não canceladas).
CREATE OR REPLACE FUNCTION private.contract_open_balance(p_contract_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(sum(amount), 0)::numeric(12,2) FROM public.contract_installments WHERE contract_id = p_contract_id AND status = 'previsto';
$$;

-- Valida a lista de formas: [{method, amount, installments, card_brand?, card_last4?}]
CREATE OR REPLACE FUNCTION private.validate_payment_methods(p_methods jsonb, p_total numeric)
RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE m jsonb; v_sum numeric := 0; v_n int; v_method text;
BEGIN
  IF p_methods IS NULL OR jsonb_typeof(p_methods) <> 'array' OR jsonb_array_length(p_methods) NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'Informe de 1 a 4 formas de pagamento.' USING ERRCODE = '22023';
  END IF;
  FOR m IN SELECT * FROM jsonb_array_elements(p_methods) LOOP
    v_method := m->>'method';
    IF v_method NOT IN ('pix', 'credit', 'debit', 'cash', 'boleto', 'transfer') THEN
      RAISE EXCEPTION 'Forma de pagamento inválida: %', coalesce(v_method, '?') USING ERRCODE = '22023';
    END IF;
    IF coalesce((m->>'amount')::numeric, 0) <= 0 THEN RAISE EXCEPTION 'Informe o valor de cada forma.' USING ERRCODE = '22023'; END IF;
    v_n := coalesce((m->>'installments')::int, 1);
    IF v_n < 1 OR v_n > 48 OR (v_n > 1 AND v_method NOT IN ('credit', 'boleto')) THEN
      RAISE EXCEPTION 'Só cartão de crédito e boleto podem ser parcelados (até 48x).' USING ERRCODE = '22023';
    END IF;
    v_sum := v_sum + (m->>'amount')::numeric;
  END LOOP;
  IF abs(v_sum - p_total) > 0.01 THEN
    RAISE EXCEPTION 'A soma das formas (R$ %) precisa ser igual ao saldo em aberto (R$ %).', to_char(v_sum, 'FM999999990.00'), to_char(p_total, 'FM999999990.00') USING ERRCODE = '22023';
  END IF;
END;
$$;

-- Equipe propõe nova forma de pagamento (fica aguardando aceite do paciente).
CREATE OR REPLACE FUNCTION public.propose_contract_payment_amendment(p_contract_id uuid, p_methods jsonb, p_first_due date, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_c public.contracts%ROWTYPE; v_open numeric; v_before jsonb; v_id uuid;
BEGIN
  SELECT * INTO v_c FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF v_c.id IS NULL OR NOT public.is_clinic_staff(auth.uid(), v_c.clinic_id) THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501'; END IF;
  IF v_c.process_status = 'cancelled' OR v_c.status = 'cancelled' THEN RAISE EXCEPTION 'Contrato cancelado não pode ser revisado.' USING ERRCODE = '22023'; END IF;
  IF length(trim(coalesce(p_reason, ''))) < 5 THEN RAISE EXCEPTION 'Informe o motivo da revisão.' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.contract_amendments WHERE contract_id = v_c.id AND status = 'pending_acceptance') THEN
    RAISE EXCEPTION 'Já existe uma revisão aguardando o aceite do paciente. Desista dela antes de criar outra.' USING ERRCODE = '22023';
  END IF;
  IF p_first_due IS NULL OR p_first_due < (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1 THEN
    RAISE EXCEPTION 'Informe a data do primeiro vencimento (hoje ou depois).' USING ERRCODE = '22023';
  END IF;
  v_open := private.contract_open_balance(v_c.id);
  IF v_open <= 0 THEN RAISE EXCEPTION 'Este contrato não tem parcelas em aberto para reorganizar.' USING ERRCODE = '22023'; END IF;
  PERFORM private.validate_payment_methods(p_methods, v_open);

  SELECT coalesce(jsonb_agg(jsonb_build_object('method', payment_method, 'number', installment_number, 'count', installments_count, 'due_date', due_date, 'amount', amount) ORDER BY due_date, installment_number), '[]')
    INTO v_before FROM public.contract_installments WHERE contract_id = v_c.id AND status = 'previsto';

  INSERT INTO public.contract_amendments (clinic_id, contract_id, kind, status, requires_acceptance, reason, changes)
  VALUES (v_c.clinic_id, v_c.id, 'payment', 'pending_acceptance', true, trim(p_reason),
    jsonb_build_object('open_balance', v_open, 'before', v_before, 'after', jsonb_build_object('methods', p_methods, 'first_due', p_first_due)))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.propose_contract_payment_amendment(uuid, jsonb, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_contract_payment_amendment(uuid, jsonb, date, text) TO authenticated;

-- Link para o paciente aceitar o aditivo (15 dias). Precisa da data de nascimento ou CPF para conferir a identidade.
CREATE OR REPLACE FUNCTION public.create_amendment_link(p_amendment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_a public.contract_amendments%ROWTYPE; v_c public.contracts%ROWTYPE;
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires timestamptz := now() + interval '15 days';
BEGIN
  SELECT * INTO v_a FROM public.contract_amendments WHERE id = p_amendment_id;
  IF v_a.id IS NULL OR NOT public.is_clinic_staff(auth.uid(), v_a.clinic_id) THEN RAISE EXCEPTION 'Revisão não encontrada.' USING ERRCODE = '42501'; END IF;
  IF v_a.status <> 'pending_acceptance' THEN RAISE EXCEPTION 'Esta revisão não está aguardando aceite.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_c FROM public.contracts WHERE id = v_a.contract_id;
  IF private.identity_check_kind(v_c.patient_id) = 'none' THEN
    RAISE EXCEPTION 'Cadastre a data de nascimento do paciente antes (Corrigir dados do paciente).' USING ERRCODE = '22023';
  END IF;
  UPDATE public.contract_links SET revoked_at = now() WHERE amendment_id = v_a.id AND revoked_at IS NULL;
  INSERT INTO public.contract_links (clinic_id, contract_id, token_hash, expires_at, created_by, purpose, amendment_id)
  VALUES (v_a.clinic_id, v_a.contract_id, private.anamnese_token_hash(v_token), v_expires, auth.uid(), 'amendment', v_a.id);
  RETURN jsonb_build_object('token', v_token, 'expires_at', v_expires);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_amendment_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_amendment_link(uuid) TO authenticated;

-- Equipe desiste do aditivo antes do aceite.
CREATE OR REPLACE FUNCTION public.discard_contract_amendment(p_amendment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_a public.contract_amendments%ROWTYPE;
BEGIN
  SELECT * INTO v_a FROM public.contract_amendments WHERE id = p_amendment_id FOR UPDATE;
  IF v_a.id IS NULL OR NOT public.is_clinic_staff(auth.uid(), v_a.clinic_id) THEN RAISE EXCEPTION 'Revisão não encontrada.' USING ERRCODE = '42501'; END IF;
  IF v_a.status <> 'pending_acceptance' THEN RAISE EXCEPTION 'Esta revisão não está aguardando aceite.' USING ERRCODE = '22023'; END IF;
  UPDATE public.contract_amendments SET status = 'discarded', discarded_at = now() WHERE id = v_a.id;
  UPDATE public.contract_links SET revoked_at = now() WHERE amendment_id = v_a.id AND revoked_at IS NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.discard_contract_amendment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discard_contract_amendment(uuid) TO authenticated;

-- Aplica a nova forma de pagamento: troca só as parcelas em aberto.
CREATE OR REPLACE FUNCTION private.apply_payment_amendment(p_amendment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_a public.contract_amendments%ROWTYPE; v_c public.contracts%ROWTYPE;
  v_plan uuid; m jsonb; v_method_id uuid; v_n int; v_amount numeric(12,2); v_inst numeric(12,2); v_first date; i int;
BEGIN
  SELECT * INTO v_a FROM public.contract_amendments WHERE id = p_amendment_id FOR UPDATE;
  SELECT * INTO v_c FROM public.contracts WHERE id = v_a.contract_id FOR UPDATE;
  -- O saldo pode ter mudado (alguém deu baixa numa parcela) desde a proposta: confere de novo.
  PERFORM private.validate_payment_methods(v_a.changes->'after'->'methods', private.contract_open_balance(v_c.id));
  SELECT id INTO v_plan FROM public.contract_payment_plans WHERE contract_id = v_c.id ORDER BY created_at LIMIT 1;
  IF v_plan IS NULL THEN RAISE EXCEPTION 'Financeiro do contrato não configurado.' USING ERRCODE = '22023'; END IF;
  v_first := (v_a.changes->'after'->>'first_due')::date;

  DELETE FROM public.contract_installments WHERE contract_id = v_c.id AND status = 'previsto';

  FOR m IN SELECT * FROM jsonb_array_elements(v_a.changes->'after'->'methods') LOOP
    v_n := coalesce((m->>'installments')::int, 1);
    v_amount := (m->>'amount')::numeric(12,2);
    v_inst := round(v_amount / v_n, 2);
    INSERT INTO public.contract_payment_methods (clinic_id, contract_id, payment_plan_id, payment_method, amount, installments_count, installment_value, card_brand, card_last_digits, notes)
    VALUES (v_c.clinic_id, v_c.id, v_plan, m->>'method', v_amount, v_n, v_inst,
      CASE WHEN m->>'method' IN ('credit', 'debit') THEN nullif(m->>'card_brand', '') END,
      CASE WHEN m->>'method' IN ('credit', 'debit') THEN nullif(m->>'card_last4', '') END,
      'Aditivo de pagamento')
    RETURNING id INTO v_method_id;
    FOR i IN 1..v_n LOOP
      INSERT INTO public.contract_installments (clinic_id, contract_id, payment_plan_id, payment_method_id, payment_method, installment_number, installments_count, due_date, amount, status, notes)
      VALUES (v_c.clinic_id, v_c.id, v_plan, v_method_id, m->>'method', i, v_n, (v_first + ((i - 1) * interval '1 month'))::date,
        CASE WHEN i = v_n THEN v_amount - v_inst * (v_n - 1) ELSE v_inst END, 'previsto', 'Aditivo de pagamento');
    END LOOP;
  END LOOP;

  UPDATE public.contract_payment_plans SET
    total_predicted_value = (SELECT coalesce(sum(CASE WHEN status = 'pago' THEN coalesce(paid_amount, amount) ELSE amount END), 0) FROM public.contract_installments WHERE contract_id = v_c.id AND status <> 'cancelado'),
    updated_at = now()
  WHERE id = v_plan;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.apply_payment_amendment(uuid) FROM PUBLIC, anon, authenticated;

-- Paciente (sem login) vê o aditivo.
CREATE OR REPLACE FUNCTION public.get_public_amendment(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_link public.contract_links%ROWTYPE; v_a public.contract_amendments%ROWTYPE; v_c public.contracts%ROWTYPE; v_clinic public.clinics%ROWTYPE;
BEGIN
  v_link := private.contract_link_by_token(p_token);
  IF v_link.id IS NULL OR v_link.purpose <> 'amendment' THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;
  SELECT * INTO v_a FROM public.contract_amendments WHERE id = v_link.amendment_id;
  IF v_a.status = 'pending_acceptance' AND v_link.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'revoked'); END IF;
  IF v_a.status = 'pending_acceptance' AND v_link.expires_at < now() THEN RETURN jsonb_build_object('ok', false, 'reason', 'expired'); END IF;
  IF v_a.status = 'discarded' THEN RETURN jsonb_build_object('ok', false, 'reason', 'revoked'); END IF;
  UPDATE public.contract_links SET first_opened_at = coalesce(first_opened_at, now()), last_opened_at = now() WHERE id = v_link.id;
  SELECT * INTO v_c FROM public.contracts WHERE id = v_a.contract_id;
  SELECT * INTO v_clinic FROM public.clinics WHERE id = v_c.clinic_id;
  RETURN jsonb_build_object(
    'ok', true,
    'kind', v_a.kind,
    'contract_number', v_c.contract_number,
    'patient_name', (SELECT full_name FROM public.patients WHERE id = v_c.patient_id),
    'clinic', jsonb_build_object('name', v_clinic.name, 'phone', v_clinic.phone, 'logo_url', v_clinic.logo_url, 'primary_color', v_clinic.primary_color),
    'reason', v_a.reason,
    'changes', v_a.changes,
    'identity_check', private.identity_check_kind(v_c.patient_id),
    'accepted', CASE WHEN v_a.accepted_at IS NULL THEN NULL ELSE jsonb_build_object('accepted_at', v_a.accepted_at, 'name', v_a.accepted_name) END,
    'can_accept', v_a.status = 'pending_acceptance' AND v_link.failed_attempts < 5
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_public_amendment(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_amendment(text) TO anon, authenticated;

-- Paciente aceita o aditivo: confere identidade, registra a prova e aplica a mudança.
CREATE OR REPLACE FUNCTION public.accept_public_amendment(p_token text, p_full_name text, p_identity text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.contract_links%ROWTYPE; v_a public.contract_amendments%ROWTYPE; v_c public.contracts%ROWTYPE;
  v_name text; v_ev jsonb := private.request_evidence(); v_hash text;
BEGIN
  v_link := private.contract_link_by_token(p_token);
  IF v_link.id IS NULL OR v_link.purpose <> 'amendment' OR v_link.revoked_at IS NOT NULL OR v_link.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF v_link.failed_attempts >= 5 THEN RETURN jsonb_build_object('ok', false, 'reason', 'locked'); END IF;
  SELECT * INTO v_a FROM public.contract_amendments WHERE id = v_link.amendment_id FOR UPDATE;
  IF v_a.status <> 'pending_acceptance' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_signed'); END IF;
  SELECT * INTO v_c FROM public.contracts WHERE id = v_a.contract_id;
  IF v_c.process_status = 'cancelled' OR v_c.status = 'cancelled' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_signable'); END IF;
  SELECT full_name INTO v_name FROM public.patients WHERE id = v_c.patient_id;
  IF NOT private.names_match(p_full_name, v_name) OR NOT private.identity_matches(v_c.patient_id, p_identity) THEN
    UPDATE public.contract_links SET failed_attempts = failed_attempts + 1 WHERE id = v_link.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'identity', 'attempts_left', greatest(0, 4 - v_link.failed_attempts));
  END IF;

  IF v_a.kind = 'payment' THEN PERFORM private.apply_payment_amendment(v_a.id); END IF;

  v_hash := encode(sha256(convert_to(v_a.changes::text || v_a.reason, 'UTF8')), 'hex');
  UPDATE public.contract_amendments SET status = 'applied', applied_at = now(), accepted_at = now(), accepted_name = trim(p_full_name),
    accepted_verified_by = private.identity_check_kind(v_c.patient_id), accepted_ip = v_ev ->> 'ip', accepted_user_agent = v_ev ->> 'user_agent', accepted_hash = v_hash
  WHERE id = v_a.id;
  UPDATE public.contract_links SET revoked_at = now() WHERE amendment_id = v_a.id AND id <> v_link.id AND revoked_at IS NULL;
  PERFORM private.notify_clinic_staff(v_c.clinic_id, v_c.patient_id, 'Revisão do contrato aceita',
    format('%s aceitou a nova forma de pagamento do contrato %s. As parcelas em aberto foram atualizadas.', v_name, v_c.contract_number), v_a.created_by);
  RETURN jsonb_build_object('ok', true, 'hash', v_hash);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.accept_public_amendment(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_public_amendment(text, text, text) TO anon, authenticated;
