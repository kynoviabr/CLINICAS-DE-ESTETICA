-- Revisão de contrato (entrega 4): cancelamento com estorno e termo aceito pelo paciente.
-- Conta: devolução = pago - usado - multa.
--   pago   = parcelas pagas (inclui sinal abatido);
--   usado  = sessões feitas desde o contrato, pelo valor de cada sessão no contrato;
--   multa  = % da clínica (clinic_settings 'contract_cancellation_fee_percent', padrão 0) sobre o saldo NÃO usado.
-- Resultado positivo: devolução ao paciente (fica pendente até a equipe registrar que devolveu).
-- Resultado negativo: o paciente ainda deve; vira uma parcela "Saldo do cancelamento".
-- Tudo só vale depois do aceite do termo pelo paciente.

CREATE TABLE IF NOT EXISTS public.contract_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  amendment_id uuid REFERENCES public.contract_amendments(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at date,
  paid_method text,
  paid_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contract_refunds_clinic_idx ON public.contract_refunds (clinic_id, status);
ALTER TABLE public.contract_refunds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff views contract refunds" ON public.contract_refunds;
CREATE POLICY "Staff views contract refunds" ON public.contract_refunds FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
REVOKE INSERT, UPDATE, DELETE ON public.contract_refunds FROM anon, authenticated;

-- Conta do cancelamento (sem gravar nada).
CREATE OR REPLACE FUNCTION private.cancellation_calc(p_contract_id uuid, p_fee_percent numeric)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_paid numeric; v_value numeric; v_used numeric; v_items jsonb; v_unused numeric; v_fee numeric; v_result numeric;
BEGIN
  SELECT coalesce(sum(coalesce(paid_amount, amount)), 0) INTO v_paid FROM public.contract_installments WHERE contract_id = p_contract_id AND status = 'pago';
  SELECT coalesce(sum(value), 0),
         coalesce(sum(CASE WHEN contracted > 0 THEN round(value / contracted * least(used, contracted), 2) ELSE 0 END), 0),
         coalesce(jsonb_agg(jsonb_build_object('name', name, 'contracted', contracted, 'used', least(used, contracted),
           'value', value, 'used_value', CASE WHEN contracted > 0 THEN round(value / contracted * least(used, contracted), 2) ELSE 0 END) ORDER BY name), '[]')
    INTO v_value, v_used, v_items FROM private.contract_items_now(p_contract_id);
  v_unused := greatest(v_value - v_used, 0);
  v_fee := round(v_unused * greatest(least(coalesce(p_fee_percent, 0), 100), 0) / 100, 2);
  v_result := round(v_paid - v_used - v_fee, 2);
  RETURN jsonb_build_object('contract_value', v_value, 'paid', v_paid, 'used_value', v_used, 'unused_value', v_unused,
    'fee_percent', coalesce(p_fee_percent, 0), 'fee', v_fee, 'items', v_items,
    'refund', greatest(v_result, 0), 'due', greatest(-v_result, 0),
    'open_balance', private.contract_open_balance(p_contract_id));
END;
$$;
REVOKE EXECUTE ON FUNCTION private.cancellation_calc(uuid, numeric) FROM PUBLIC, anon, authenticated;

-- Para a tela: prévia da conta, com a multa padrão da clínica.
CREATE OR REPLACE FUNCTION public.contract_cancellation_preview(p_contract_id uuid, p_fee_percent numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_c public.contracts%ROWTYPE; v_default numeric;
BEGIN
  SELECT * INTO v_c FROM public.contracts WHERE id = p_contract_id;
  IF v_c.id IS NULL OR NOT public.is_clinic_staff(auth.uid(), v_c.clinic_id) THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501'; END IF;
  SELECT nullif(value, '')::numeric INTO v_default FROM public.clinic_settings WHERE clinic_id = v_c.clinic_id AND key = 'contract_cancellation_fee_percent';
  RETURN private.cancellation_calc(p_contract_id, coalesce(p_fee_percent, v_default, 0)) || jsonb_build_object('default_fee_percent', coalesce(v_default, 0));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.contract_cancellation_preview(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contract_cancellation_preview(uuid, numeric) TO authenticated;

-- Equipe propõe o cancelamento (termo aguarda aceite do paciente).
CREATE OR REPLACE FUNCTION public.propose_contract_cancellation(p_contract_id uuid, p_fee_percent numeric, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_c public.contracts%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO v_c FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF v_c.id IS NULL OR NOT public.is_clinic_staff(auth.uid(), v_c.clinic_id) THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501'; END IF;
  IF v_c.process_status = 'cancelled' OR v_c.status = 'cancelled' THEN RAISE EXCEPTION 'Este contrato já está cancelado.' USING ERRCODE = '22023'; END IF;
  IF length(trim(coalesce(p_reason, ''))) < 5 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_fee_percent, 0) < 0 OR coalesce(p_fee_percent, 0) > 100 THEN RAISE EXCEPTION 'Multa deve ficar entre 0%% e 100%%.' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.contract_amendments WHERE contract_id = v_c.id AND status = 'pending_acceptance') THEN
    RAISE EXCEPTION 'Já existe uma revisão aguardando o aceite do paciente. Desista dela antes de cancelar.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.contract_amendments (clinic_id, contract_id, kind, status, requires_acceptance, reason, changes)
  VALUES (v_c.clinic_id, v_c.id, 'cancellation', 'pending_acceptance', true, trim(p_reason), private.cancellation_calc(v_c.id, coalesce(p_fee_percent, 0)))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.propose_contract_cancellation(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_contract_cancellation(uuid, numeric, text) TO authenticated;

-- Aplica o cancelamento (no aceite). Recalcula: o que vale é a conta no momento do aceite.
CREATE OR REPLACE FUNCTION private.apply_cancellation_amendment(p_amendment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_a public.contract_amendments%ROWTYPE; v_c public.contracts%ROWTYPE; v_calc jsonb; v_plan uuid; v_method uuid;
BEGIN
  SELECT * INTO v_a FROM public.contract_amendments WHERE id = p_amendment_id FOR UPDATE;
  SELECT * INTO v_c FROM public.contracts WHERE id = v_a.contract_id FOR UPDATE;
  v_calc := private.cancellation_calc(v_c.id, (v_a.changes->>'fee_percent')::numeric);

  UPDATE public.contract_installments SET status = 'cancelado', notes = 'Cancelada com o contrato' WHERE contract_id = v_c.id AND status = 'previsto';
  UPDATE public.contracts SET process_status = 'cancelled', status = 'cancelled', updated_at = now() WHERE id = v_c.id;

  IF (v_calc->>'refund')::numeric > 0 THEN
    INSERT INTO public.contract_refunds (clinic_id, contract_id, amendment_id, amount, notes)
    VALUES (v_c.clinic_id, v_c.id, v_a.id, (v_calc->>'refund')::numeric, 'Devolução do cancelamento');
  ELSIF (v_calc->>'due')::numeric > 0 THEN
    SELECT id INTO v_plan FROM public.contract_payment_plans WHERE contract_id = v_c.id ORDER BY created_at LIMIT 1;
    IF v_plan IS NOT NULL THEN
      INSERT INTO public.contract_payment_methods (clinic_id, contract_id, payment_plan_id, payment_method, amount, installments_count, installment_value, notes)
      VALUES (v_c.clinic_id, v_c.id, v_plan, 'pix', (v_calc->>'due')::numeric, 1, (v_calc->>'due')::numeric, 'Saldo do cancelamento')
      RETURNING id INTO v_method;
      INSERT INTO public.contract_installments (clinic_id, contract_id, payment_plan_id, payment_method_id, payment_method, installment_number, installments_count, due_date, amount, status, notes)
      VALUES (v_c.clinic_id, v_c.id, v_plan, v_method, 'pix', 1, 1, ((now() AT TIME ZONE 'America/Sao_Paulo')::date + 7), (v_calc->>'due')::numeric, 'previsto', 'Saldo do cancelamento');
    END IF;
  END IF;
  UPDATE public.contract_amendments SET changes = v_calc WHERE id = v_a.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.apply_cancellation_amendment(uuid) FROM PUBLIC, anon, authenticated;

-- Equipe registra que a devolução foi feita.
CREATE OR REPLACE FUNCTION public.mark_contract_refund_paid(p_refund_id uuid, p_method text, p_paid_at date, p_notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_r public.contract_refunds%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM public.contract_refunds WHERE id = p_refund_id FOR UPDATE;
  IF v_r.id IS NULL OR NOT public.is_clinic_staff(auth.uid(), v_r.clinic_id) THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501'; END IF;
  IF v_r.status = 'paid' THEN RAISE EXCEPTION 'Esta devolução já foi registrada.' USING ERRCODE = '22023'; END IF;
  IF p_method NOT IN ('pix', 'transfer', 'cash', 'card_reversal', 'other') THEN RAISE EXCEPTION 'Forma de devolução inválida.' USING ERRCODE = '22023'; END IF;
  UPDATE public.contract_refunds SET status = 'paid', paid_method = p_method, paid_at = coalesce(p_paid_at, (now() AT TIME ZONE 'America/Sao_Paulo')::date),
    paid_by = auth.uid(), notes = coalesce(nullif(trim(p_notes), ''), notes) WHERE id = v_r.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mark_contract_refund_paid(uuid, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_contract_refund_paid(uuid, text, date, text) TO authenticated;

-- Aceite: pagamento, itens ou cancelamento.
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
  ELSIF v_a.kind = 'cancellation' THEN PERFORM private.apply_cancellation_amendment(v_a.id);
  END IF;
  SELECT * INTO v_a FROM public.contract_amendments WHERE id = v_a.id;

  v_hash := encode(sha256(convert_to(v_a.changes::text || v_a.reason, 'UTF8')), 'hex');
  UPDATE public.contract_amendments SET status = 'applied', applied_at = now(), accepted_at = now(), accepted_name = trim(p_full_name),
    accepted_verified_by = private.identity_check_kind(v_c.patient_id), accepted_ip = v_ev ->> 'ip', accepted_user_agent = v_ev ->> 'user_agent', accepted_hash = v_hash
  WHERE id = v_a.id;
  UPDATE public.contract_links SET revoked_at = now() WHERE amendment_id = v_a.id AND id <> v_link.id AND revoked_at IS NULL;
  PERFORM private.notify_clinic_staff(v_c.clinic_id, v_c.patient_id,
    CASE WHEN v_a.kind = 'cancellation' THEN 'Cancelamento de contrato aceito' ELSE 'Revisão do contrato aceita' END,
    CASE WHEN v_a.kind = 'cancellation'
      THEN format('%s aceitou o cancelamento do contrato %s. %s', v_name, v_c.contract_number,
        CASE WHEN (v_a.changes->>'refund')::numeric > 0 THEN format('Devolução pendente: R$ %s.', to_char((v_a.changes->>'refund')::numeric, 'FM999G999G990D00'))
             WHEN (v_a.changes->>'due')::numeric > 0 THEN format('Saldo a receber: R$ %s.', to_char((v_a.changes->>'due')::numeric, 'FM999G999G990D00'))
             ELSE 'Sem valores a devolver ou receber.' END)
      ELSE format('%s aceitou a revisão do contrato %s (%s). O financeiro foi atualizado.', v_name, v_c.contract_number,
        CASE v_a.kind WHEN 'payment' THEN 'forma de pagamento' WHEN 'items' THEN 'produtos e serviços' ELSE v_a.kind END) END,
    v_a.created_by);
  RETURN jsonb_build_object('ok', true, 'hash', v_hash);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.accept_public_amendment(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_public_amendment(text, text, text) TO anon, authenticated;
