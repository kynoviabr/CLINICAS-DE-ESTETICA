-- Formas de pagamento sem limite e com débito/crédito separados (+ transferência).
-- O contrato guarda as formas em texto ("Formas: Pix: R$ 500 | Cartão de crédito: valor R$ 1.200 | 3x de R$ 400").
-- Este leitor gera as parcelas previstas. "Cartão" antigo continua valendo.

CREATE OR REPLACE FUNCTION public.normalize_payment_method(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN _value ILIKE 'dinheiro%' THEN 'cash'
    WHEN _value ILIKE 'pix%' THEN 'pix'
    WHEN _value ~* '^cart[aã]o\s+de\s+d[eé]bito' OR _value ~* '^d[eé]bito' THEN 'debit'
    WHEN _value ~* '^cart[aã]o\s+de\s+cr[eé]dito' OR _value ~* '^cr[eé]dito' THEN 'credit'
    WHEN _value ~* '^cart[aã]o' THEN 'card'
    WHEN _value ILIKE 'boleto%' THEN 'boleto'
    WHEN _value ~* '^transfer[eê]ncia' THEN 'transfer'
    ELSE 'other'
  END
$$;

CREATE OR REPLACE FUNCTION private.upsert_contract_financial_forecast(p_contract_id uuid, p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contract public.contracts%ROWTYPE;
  v_plan_id uuid;
  v_base_date date;
  v_notes text;
  v_forms_text text;
  v_form_entry text;
  v_method text;
  v_amount numeric(12,2);
  v_installments integer;
  v_installment_value numeric(12,2);
  v_card_brand text;
  v_last4 text;
  v_method_id uuid;
  v_total_methods numeric(12,2) := 0;
  v_has_methods boolean := false;
  v_due date;
  v_i integer;
BEGIN
  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato não encontrado: %', p_contract_id;
  END IF;

  IF NOT p_force THEN
    IF EXISTS (SELECT 1 FROM public.contract_payment_plans WHERE contract_id = p_contract_id) THEN
      RETURN jsonb_build_object('status', 'skipped', 'reason', 'already_exists', 'contract_id', p_contract_id);
    END IF;
  END IF;

  IF p_force THEN
    DELETE FROM public.contract_installments WHERE contract_id = p_contract_id;
    DELETE FROM public.contract_payment_methods WHERE contract_id = p_contract_id;
    DELETE FROM public.contract_payment_plans WHERE contract_id = p_contract_id;
  END IF;

  v_base_date := COALESCE(v_contract.start_date, (v_contract.created_at AT TIME ZONE 'UTC')::date, now()::date);
  v_notes := COALESCE(v_contract.notes, '');
  v_forms_text := regexp_replace(COALESCE((regexp_match(v_notes, 'Formas:\s*([^\n]*)', 'i'))[1], ''), '[\s.]+$', '');

  INSERT INTO public.contract_payment_plans (
    clinic_id, contract_id, proposal_id, patient_id, payer_id,
    total_contract_value, total_predicted_value, prediction_status, source, created_by
  )
  VALUES (
    v_contract.clinic_id, v_contract.id, v_contract.proposal_id, v_contract.patient_id, v_contract.payer_id,
    0, 0, 'previsto', 'contract', v_contract.created_by
  )
  RETURNING id INTO v_plan_id;

  FOR v_form_entry IN
    SELECT trim(value)
    FROM regexp_split_to_table(v_forms_text, '\s*\|\s*(?=(dinheiro|pix|cart[aã]o|boleto|transfer[eê]ncia|d[eé]bito|cr[eé]dito)\M)', 'i') AS value
  LOOP
    IF v_form_entry = '' THEN
      CONTINUE;
    END IF;

    v_method := public.normalize_payment_method(v_form_entry);
    v_amount := public.parse_brl_amount((regexp_match(v_form_entry, 'R\$\s*([0-9\.\,]+)', 'i'))[1]);
    v_installments := COALESCE(NULLIF((regexp_match(v_form_entry, '([0-9]+)\s*x\s*de', 'i'))[1], '')::integer, 1);
    v_installment_value := public.parse_brl_amount((regexp_match(v_form_entry, 'x\s*de\s*R\$\s*([0-9\.\,]+)', 'i'))[1]);
    v_card_brand := NULLIF((regexp_match(v_form_entry, '·\s*([^·]+?)\s*·\s*finais', 'i'))[1], '');
    v_last4 := NULLIF((regexp_match(v_form_entry, 'finais\s*([0-9]{4})', 'i'))[1], '');

    IF v_amount IS NULL OR v_amount <= 0 THEN
      CONTINUE;
    END IF;

    -- Só crédito, boleto e cartão antigo são parcelados.
    IF v_method NOT IN ('credit', 'boleto', 'card') OR v_installments IS NULL OR v_installments <= 0 THEN
      v_installments := 1;
    END IF;

    IF v_installment_value IS NULL OR v_installment_value <= 0 OR v_installments = 1 THEN
      v_installment_value := ROUND(v_amount / v_installments, 2);
    END IF;

    INSERT INTO public.contract_payment_methods (
      clinic_id, contract_id, payment_plan_id, payment_method, amount,
      installments_count, installment_value, card_brand, card_last_digits, notes
    )
    VALUES (
      v_contract.clinic_id, v_contract.id, v_plan_id, v_method, v_amount,
      v_installments, v_installment_value,
      CASE WHEN v_method IN ('card', 'credit', 'debit') THEN v_card_brand END,
      CASE WHEN v_method IN ('card', 'credit', 'debit') THEN v_last4 END,
      v_form_entry
    )
    RETURNING id INTO v_method_id;

    v_has_methods := true;
    v_total_methods := v_total_methods + v_amount;

    FOR v_i IN 1..v_installments LOOP
      v_due := (v_base_date + ((v_i - 1) * INTERVAL '1 month'))::date;
      INSERT INTO public.contract_installments (
        clinic_id, contract_id, payment_plan_id, payment_method_id, payment_method,
        installment_number, installments_count, due_date, amount, status, notes
      )
      VALUES (
        v_contract.clinic_id, v_contract.id, v_plan_id, v_method_id, v_method,
        v_i, v_installments, v_due,
        CASE WHEN v_i = v_installments THEN ROUND(v_amount - (v_installment_value * (v_installments - 1)), 2) ELSE v_installment_value END,
        'previsto', NULL
      );
    END LOOP;
  END LOOP;

  IF NOT v_has_methods THEN
    UPDATE public.contract_payment_plans
    SET total_contract_value = COALESCE((SELECT final_amount FROM public.proposals WHERE id = v_contract.proposal_id), 0),
        total_predicted_value = 0,
        prediction_status = 'financeiro_pendente_configuracao',
        updated_at = now()
    WHERE id = v_plan_id;

    RETURN jsonb_build_object('status', 'pending_configuration', 'contract_id', v_contract.id, 'payment_plan_id', v_plan_id);
  END IF;

  UPDATE public.contract_payment_plans
  SET total_contract_value = COALESCE((SELECT final_amount FROM public.proposals WHERE id = v_contract.proposal_id), v_total_methods),
      total_predicted_value = v_total_methods,
      prediction_status = 'previsto',
      updated_at = now()
  WHERE id = v_plan_id;

  RETURN jsonb_build_object('status', 'ok', 'contract_id', v_contract.id, 'payment_plan_id', v_plan_id, 'total_predicted_value', v_total_methods);
END;
$function$;

REVOKE ALL ON FUNCTION private.upsert_contract_financial_forecast(uuid, boolean) FROM PUBLIC, anon, authenticated;
