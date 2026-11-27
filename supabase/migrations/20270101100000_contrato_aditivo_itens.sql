-- Revisão de contrato (entrega 3): adicionar ou remover produtos/serviços, com novo aceite do paciente.
-- A proposta aceita não é alterada (é a prova do combinado). As mudanças viram AJUSTES do contrato
-- (sessões e valor), somados aos itens da proposta.
-- Remover: só o saldo não usado (sessões contratadas - sessões feitas desde o contrato).
-- Financeiro, aplicado só no aceite:
--   valor aumentou  -> novas parcelas para a diferença (formas escolhidas pela equipe);
--   valor diminuiu  -> abate das parcelas em aberto, das últimas para as primeiras;
--                      o que passar do saldo em aberto vira crédito a devolver ao paciente.

CREATE TABLE IF NOT EXISTS public.contract_item_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  amendment_id uuid NOT NULL REFERENCES public.contract_amendments(id) ON DELETE CASCADE,
  treatment_id uuid REFERENCES public.treatments(id) ON DELETE SET NULL,
  treatment_name text NOT NULL,
  sessions_delta integer NOT NULL,
  value_delta numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contract_item_adjustments_contract_idx ON public.contract_item_adjustments (contract_id);
ALTER TABLE public.contract_item_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff views contract item adjustments" ON public.contract_item_adjustments;
CREATE POLICY "Staff views contract item adjustments" ON public.contract_item_adjustments FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
REVOKE INSERT, UPDATE, DELETE ON public.contract_item_adjustments FROM anon, authenticated;

-- Itens do contrato hoje (proposta + ajustes), com sessões usadas desde o contrato.
CREATE OR REPLACE FUNCTION private.contract_items_now(p_contract_id uuid)
RETURNS TABLE (treatment_id uuid, name text, contracted integer, used integer, value numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH c AS (SELECT * FROM public.contracts WHERE id = p_contract_id),
  p AS (SELECT pr.* FROM public.proposals pr, c WHERE pr.id = c.proposal_id),
  factor AS (SELECT CASE WHEN coalesce(p.total_amount, 0) > 0 THEN p.final_amount / p.total_amount ELSE 1 END AS f FROM p),
  base AS (
    SELECT pi.treatment_id, t.name, (pi.quantity * greatest(coalesce(t.num_sessions, 1), 1))::int AS sessions,
           round(pi.subtotal * coalesce((SELECT f FROM factor), 1), 2) AS value
    FROM public.proposal_items pi JOIN c ON pi.proposal_id = c.proposal_id LEFT JOIN public.treatments t ON t.id = pi.treatment_id
    UNION ALL
    SELECT a.treatment_id, a.treatment_name, a.sessions_delta, a.value_delta FROM public.contract_item_adjustments a WHERE a.contract_id = p_contract_id
  ),
  agg AS (SELECT b.treatment_id, max(b.name) AS name, sum(b.sessions)::int AS contracted, sum(b.value) AS value FROM base b GROUP BY b.treatment_id)
  SELECT agg.treatment_id, agg.name, agg.contracted,
    (SELECT count(*)::int FROM public.session_records s, c WHERE s.patient_id = c.patient_id AND s.treatment_id = agg.treatment_id AND s.performed_at >= c.created_at) AS used,
    agg.value
  FROM agg;
$$;
REVOKE EXECUTE ON FUNCTION private.contract_items_now(uuid) FROM PUBLIC, anon, authenticated;

-- Para a tela: itens atuais do contrato.
CREATE OR REPLACE FUNCTION public.contract_items_summary(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_c public.contracts%ROWTYPE;
BEGIN
  SELECT * INTO v_c FROM public.contracts WHERE id = p_contract_id;
  IF v_c.id IS NULL OR NOT public.is_clinic_staff(auth.uid(), v_c.clinic_id) THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'items', (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.name), '[]') FROM private.contract_items_now(p_contract_id) i),
    'contract_value', (SELECT coalesce(sum(value), 0) FROM private.contract_items_now(p_contract_id)),
    'open_balance', private.contract_open_balance(p_contract_id)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.contract_items_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contract_items_summary(uuid) TO authenticated;

-- Equipe propõe a mudança de itens (aguarda aceite).
-- p_add:    [{treatment_id, packages, value}]
-- p_remove: [{treatment_id, sessions, value}]
-- p_payment: só quando o valor aumenta: [{method, amount, installments, ...}] somando a diferença.
CREATE OR REPLACE FUNCTION public.propose_contract_items_amendment(p_contract_id uuid, p_add jsonb, p_remove jsonb, p_payment jsonb, p_first_due date, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c public.contracts%ROWTYPE; v_id uuid; x jsonb; v_t public.treatments%ROWTYPE;
  v_add jsonb := '[]'; v_remove jsonb := '[]'; v_before jsonb; v_item record;
  v_sum_add numeric := 0; v_sum_remove numeric := 0; v_delta numeric; v_value_before numeric; v_n int;
BEGIN
  SELECT * INTO v_c FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF v_c.id IS NULL OR NOT public.is_clinic_staff(auth.uid(), v_c.clinic_id) THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501'; END IF;
  IF v_c.process_status = 'cancelled' OR v_c.status = 'cancelled' THEN RAISE EXCEPTION 'Contrato cancelado não pode ser revisado.' USING ERRCODE = '22023'; END IF;
  IF length(trim(coalesce(p_reason, ''))) < 5 THEN RAISE EXCEPTION 'Informe o motivo da revisão.' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.contract_amendments WHERE contract_id = v_c.id AND status = 'pending_acceptance') THEN
    RAISE EXCEPTION 'Já existe uma revisão aguardando o aceite do paciente. Desista dela antes de criar outra.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(jsonb_array_length(p_add), 0) + coalesce(jsonb_array_length(p_remove), 0) = 0 THEN
    RAISE EXCEPTION 'Adicione ou remova pelo menos um item.' USING ERRCODE = '22023';
  END IF;

  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_add, '[]')) LOOP
    SELECT * INTO v_t FROM public.treatments WHERE id = (x->>'treatment_id')::uuid AND clinic_id = v_c.clinic_id;
    IF v_t.id IS NULL THEN RAISE EXCEPTION 'Tratamento não encontrado.' USING ERRCODE = '22023'; END IF;
    v_n := coalesce((x->>'packages')::int, 0);
    IF v_n < 1 OR v_n > 100 THEN RAISE EXCEPTION 'Quantidade inválida para %.', v_t.name USING ERRCODE = '22023'; END IF;
    IF coalesce((x->>'value')::numeric, -1) < 0 THEN RAISE EXCEPTION 'Valor inválido para %.', v_t.name USING ERRCODE = '22023'; END IF;
    v_add := v_add || jsonb_build_object('treatment_id', v_t.id, 'name', v_t.name, 'packages', v_n,
      'sessions', v_n * greatest(coalesce(v_t.num_sessions, 1), 1), 'value', round((x->>'value')::numeric, 2));
    v_sum_add := v_sum_add + round((x->>'value')::numeric, 2);
  END LOOP;

  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_remove, '[]')) LOOP
    SELECT * INTO v_item FROM private.contract_items_now(v_c.id) i WHERE i.treatment_id = (x->>'treatment_id')::uuid;
    IF v_item.treatment_id IS NULL THEN RAISE EXCEPTION 'Este item não está no contrato.' USING ERRCODE = '22023'; END IF;
    v_n := coalesce((x->>'sessions')::int, 0);
    IF v_n < 1 THEN RAISE EXCEPTION 'Informe quantas sessões remover de %.', v_item.name USING ERRCODE = '22023'; END IF;
    IF v_n > v_item.contracted - v_item.used THEN
      RAISE EXCEPTION 'Só dá para remover o saldo não usado de % (% sessões).', v_item.name, greatest(v_item.contracted - v_item.used, 0) USING ERRCODE = '22023';
    END IF;
    IF coalesce((x->>'value')::numeric, -1) < 0 OR (x->>'value')::numeric > v_item.value THEN
      RAISE EXCEPTION 'Valor a abater inválido para %.', v_item.name USING ERRCODE = '22023';
    END IF;
    v_remove := v_remove || jsonb_build_object('treatment_id', v_item.treatment_id, 'name', v_item.name, 'sessions', v_n, 'value', round((x->>'value')::numeric, 2));
    v_sum_remove := v_sum_remove + round((x->>'value')::numeric, 2);
  END LOOP;

  v_delta := v_sum_add - v_sum_remove;
  IF v_delta > 0 THEN
    IF p_first_due IS NULL OR p_first_due < (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1 THEN
      RAISE EXCEPTION 'Informe a data do primeiro vencimento da diferença.' USING ERRCODE = '22023';
    END IF;
    PERFORM private.validate_payment_methods(p_payment, v_delta);
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.name), '[]'), coalesce(sum(i.value), 0) INTO v_before, v_value_before FROM private.contract_items_now(v_c.id) i;

  INSERT INTO public.contract_amendments (clinic_id, contract_id, kind, status, requires_acceptance, reason, changes)
  VALUES (v_c.clinic_id, v_c.id, 'items', 'pending_acceptance', true, trim(p_reason), jsonb_build_object(
    'items_before', v_before, 'add', v_add, 'remove', v_remove,
    'value_before', v_value_before, 'value_after', v_value_before + v_delta, 'delta', v_delta,
    'open_balance', private.contract_open_balance(v_c.id),
    'payment', CASE WHEN v_delta > 0 THEN jsonb_build_object('methods', p_payment, 'first_due', p_first_due) ELSE NULL END))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.propose_contract_items_amendment(uuid, jsonb, jsonb, jsonb, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_contract_items_amendment(uuid, jsonb, jsonb, jsonb, date, text) TO authenticated;

-- Aplica a mudança de itens (no aceite).
CREATE OR REPLACE FUNCTION private.apply_items_amendment(p_amendment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_a public.contract_amendments%ROWTYPE; v_c public.contracts%ROWTYPE; x jsonb; v_item record;
  v_plan uuid; v_delta numeric; v_left numeric; r record; v_take numeric; v_refund numeric := 0;
  m jsonb; v_method_id uuid; v_n int; v_amount numeric(12,2); v_inst numeric(12,2); v_first date; i int;
BEGIN
  SELECT * INTO v_a FROM public.contract_amendments WHERE id = p_amendment_id FOR UPDATE;
  SELECT * INTO v_c FROM public.contracts WHERE id = v_a.contract_id FOR UPDATE;
  v_delta := (v_a.changes->>'delta')::numeric;

  -- Remoção: confere de novo o saldo não usado (pode ter havido sessão desde a proposta).
  FOR x IN SELECT * FROM jsonb_array_elements(v_a.changes->'remove') LOOP
    SELECT * INTO v_item FROM private.contract_items_now(v_c.id) it WHERE it.treatment_id = (x->>'treatment_id')::uuid;
    IF v_item.treatment_id IS NULL OR (x->>'sessions')::int > v_item.contracted - v_item.used THEN
      RAISE EXCEPTION 'O saldo de % mudou desde a revisão. Peça à clínica uma nova revisão.', x->>'name' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.contract_item_adjustments (clinic_id, contract_id, amendment_id, treatment_id, treatment_name, sessions_delta, value_delta)
    VALUES (v_c.clinic_id, v_c.id, v_a.id, (x->>'treatment_id')::uuid, x->>'name', -(x->>'sessions')::int, -(x->>'value')::numeric);
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(v_a.changes->'add') LOOP
    INSERT INTO public.contract_item_adjustments (clinic_id, contract_id, amendment_id, treatment_id, treatment_name, sessions_delta, value_delta)
    VALUES (v_c.clinic_id, v_c.id, v_a.id, (x->>'treatment_id')::uuid, x->>'name', (x->>'sessions')::int, (x->>'value')::numeric);
  END LOOP;

  SELECT id INTO v_plan FROM public.contract_payment_plans WHERE contract_id = v_c.id ORDER BY created_at LIMIT 1;

  IF v_delta > 0 THEN
    IF v_plan IS NULL THEN RAISE EXCEPTION 'Financeiro do contrato não configurado.' USING ERRCODE = '22023'; END IF;
    v_first := (v_a.changes->'payment'->>'first_due')::date;
    FOR m IN SELECT * FROM jsonb_array_elements(v_a.changes->'payment'->'methods') LOOP
      v_n := coalesce((m->>'installments')::int, 1);
      v_amount := (m->>'amount')::numeric(12,2);
      v_inst := round(v_amount / v_n, 2);
      INSERT INTO public.contract_payment_methods (clinic_id, contract_id, payment_plan_id, payment_method, amount, installments_count, installment_value, card_brand, card_last_digits, notes)
      VALUES (v_c.clinic_id, v_c.id, v_plan, m->>'method', v_amount, v_n, v_inst,
        CASE WHEN m->>'method' IN ('credit', 'debit') THEN nullif(m->>'card_brand', '') END,
        CASE WHEN m->>'method' IN ('credit', 'debit') THEN nullif(m->>'card_last4', '') END, 'Aditivo de itens')
      RETURNING id INTO v_method_id;
      FOR i IN 1..v_n LOOP
        INSERT INTO public.contract_installments (clinic_id, contract_id, payment_plan_id, payment_method_id, payment_method, installment_number, installments_count, due_date, amount, status, notes)
        VALUES (v_c.clinic_id, v_c.id, v_plan, v_method_id, m->>'method', i, v_n, (v_first + ((i - 1) * interval '1 month'))::date,
          CASE WHEN i = v_n THEN v_amount - v_inst * (v_n - 1) ELSE v_inst END, 'previsto', 'Aditivo de itens');
      END LOOP;
    END LOOP;
  ELSIF v_delta < 0 THEN
    v_left := -v_delta;
    FOR r IN SELECT id, amount FROM public.contract_installments WHERE contract_id = v_c.id AND status = 'previsto' ORDER BY due_date DESC, installment_number DESC LOOP
      EXIT WHEN v_left <= 0;
      v_take := least(r.amount, v_left);
      IF v_take >= r.amount THEN DELETE FROM public.contract_installments WHERE id = r.id;
      ELSE UPDATE public.contract_installments SET amount = amount - v_take, notes = 'Reduzida por aditivo de itens' WHERE id = r.id; END IF;
      v_left := v_left - v_take;
    END LOOP;
    v_refund := greatest(v_left, 0);
  END IF;

  IF v_plan IS NOT NULL THEN
    UPDATE public.contract_payment_plans SET
      total_contract_value = (v_a.changes->>'value_after')::numeric,
      total_predicted_value = (SELECT coalesce(sum(CASE WHEN status = 'pago' THEN coalesce(paid_amount, amount) ELSE amount END), 0) FROM public.contract_installments WHERE contract_id = v_c.id AND status <> 'cancelado'),
      updated_at = now()
    WHERE id = v_plan;
  END IF;
  UPDATE public.contract_amendments SET changes = changes || jsonb_build_object('refund_due', v_refund) WHERE id = v_a.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.apply_items_amendment(uuid) FROM PUBLIC, anon, authenticated;

-- Aceite: agora aplica pagamento ou itens.
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

  IF v_a.kind = 'payment' THEN PERFORM private.apply_payment_amendment(v_a.id);
  ELSIF v_a.kind = 'items' THEN PERFORM private.apply_items_amendment(v_a.id);
  END IF;
  SELECT * INTO v_a FROM public.contract_amendments WHERE id = v_a.id;

  v_hash := encode(sha256(convert_to(v_a.changes::text || v_a.reason, 'UTF8')), 'hex');
  UPDATE public.contract_amendments SET status = 'applied', applied_at = now(), accepted_at = now(), accepted_name = trim(p_full_name),
    accepted_verified_by = private.identity_check_kind(v_c.patient_id), accepted_ip = v_ev ->> 'ip', accepted_user_agent = v_ev ->> 'user_agent', accepted_hash = v_hash
  WHERE id = v_a.id;
  UPDATE public.contract_links SET revoked_at = now() WHERE amendment_id = v_a.id AND id <> v_link.id AND revoked_at IS NULL;
  PERFORM private.notify_clinic_staff(v_c.clinic_id, v_c.patient_id, 'Revisão do contrato aceita',
    format('%s aceitou a revisão do contrato %s (%s). O financeiro foi atualizado.', v_name, v_c.contract_number,
      CASE v_a.kind WHEN 'payment' THEN 'forma de pagamento' WHEN 'items' THEN 'produtos e serviços' ELSE v_a.kind END), v_a.created_by);
  RETURN jsonb_build_object('ok', true, 'hash', v_hash);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.accept_public_amendment(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_public_amendment(text, text, text) TO anon, authenticated;
