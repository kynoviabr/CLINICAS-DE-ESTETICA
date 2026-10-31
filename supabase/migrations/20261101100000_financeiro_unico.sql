-- Financeiro único (plano 4.1): o Financeiro de Contratos passa a ser a única fonte.
-- 1. Parcelas de contrato ganham registro de pagamento (baixa).
-- 2. Parcela paga não pode ser apagada (protege a regeneração da previsão).
-- 3. Paciente vê as parcelas dos próprios contratos no portal.
-- 4. Permissão de menu "payments.view" vira "finance_contracts.view".
-- 5. Tabelas antigas payment_plans/payment_installments saem (vazias em produção).

ALTER TABLE public.contract_installments
  ADD COLUMN IF NOT EXISTS paid_at date,
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS paid_method text,
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.contract_installments SET status = 'previsto' WHERE status IS NULL OR status NOT IN ('previsto', 'pago', 'cancelado');

ALTER TABLE public.contract_installments
  ADD CONSTRAINT contract_installments_status_check CHECK (status IN ('previsto', 'pago', 'cancelado')),
  ADD CONSTRAINT contract_installments_paid_fields_check CHECK (
    (status = 'pago' AND paid_at IS NOT NULL AND paid_amount IS NOT NULL AND paid_amount >= 0)
    OR (status <> 'pago' AND paid_at IS NULL AND paid_amount IS NULL AND paid_method IS NULL)
  );

CREATE INDEX IF NOT EXISTS contract_installments_clinic_due_idx ON public.contract_installments (clinic_id, due_date);
CREATE INDEX IF NOT EXISTS contract_installments_clinic_paid_idx ON public.contract_installments (clinic_id, paid_at) WHERE status = 'pago';

-- Quem deu a baixa fica registrado automaticamente.
CREATE OR REPLACE FUNCTION private.contract_installment_set_paid_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pago' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pago') THEN
    NEW.paid_by := auth.uid();
  ELSIF NEW.status <> 'pago' THEN
    NEW.paid_by := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER contract_installments_set_paid_by
BEFORE INSERT OR UPDATE ON public.contract_installments
FOR EACH ROW EXECUTE FUNCTION private.contract_installment_set_paid_by();

-- Parcela paga não some: a regeneração da previsão (upsert com p_force) apagaria pagamentos.
-- Excluir o contrato inteiro continua permitido: na cascata o contrato já não existe.
CREATE OR REPLACE FUNCTION private.contract_installment_protect_paid()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'pago' AND EXISTS (SELECT 1 FROM public.contracts WHERE id = OLD.contract_id) THEN
    RAISE EXCEPTION 'Este contrato já tem parcelas pagas; estorne os pagamentos antes de refazer a previsão.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER contract_installments_protect_paid
BEFORE DELETE ON public.contract_installments
FOR EACH ROW EXECUTE FUNCTION private.contract_installment_protect_paid();

-- Previsão: valores vêm como "R$ 300.00" (ponto decimal) e cartão/boleto usam "|" dentro da própria forma
-- ("Cartão: valor R$ 300.00 | 3x de R$ 100.00"). O parser antigo lia 300.00 como 30000 e quebrava a forma em duas.
CREATE OR REPLACE FUNCTION public.parse_brl_amount(_value text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  WITH s AS (
    SELECT regexp_replace(regexp_replace(COALESCE(_value, ''), '[^0-9,.-]', '', 'g'), '[.,]+$', '') AS v
  )
  SELECT NULLIF(
    CASE
      WHEN v LIKE '%,%' THEN replace(replace(v, '.', ''), ',', '.')
      WHEN v ~ '\.[0-9]{1,2}$' THEN regexp_replace(v, '\.(?=.*\.)', '', 'g')
      ELSE replace(v, '.', '')
    END, '')::numeric
  FROM s
$function$;

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
    clinic_id,
    contract_id,
    proposal_id,
    patient_id,
    payer_id,
    total_contract_value,
    total_predicted_value,
    prediction_status,
    source,
    created_by
  )
  VALUES (
    v_contract.clinic_id,
    v_contract.id,
    v_contract.proposal_id,
    v_contract.patient_id,
    v_contract.payer_id,
    0,
    0,
    'previsto',
    'contract',
    v_contract.created_by
  )
  RETURNING id INTO v_plan_id;

  FOR v_form_entry IN
    SELECT trim(value)
    FROM regexp_split_to_table(v_forms_text, '\s*\|\s*(?=(dinheiro|pix|cart[aã]o|boleto)\M)', 'i') AS value
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

    IF v_installments IS NULL OR v_installments <= 0 THEN
      v_installments := 1;
    END IF;

    IF v_installment_value IS NULL OR v_installment_value <= 0 THEN
      v_installment_value := ROUND(v_amount / v_installments, 2);
    END IF;

    INSERT INTO public.contract_payment_methods (
      clinic_id,
      contract_id,
      payment_plan_id,
      payment_method,
      amount,
      installments_count,
      installment_value,
      card_brand,
      card_last_digits,
      notes
    )
    VALUES (
      v_contract.clinic_id,
      v_contract.id,
      v_plan_id,
      v_method,
      v_amount,
      v_installments,
      v_installment_value,
      CASE WHEN v_method = 'card' THEN v_card_brand END,
      CASE WHEN v_method = 'card' THEN v_last4 END,
      v_form_entry
    )
    RETURNING id INTO v_method_id;

    v_has_methods := true;
    v_total_methods := v_total_methods + v_amount;

    FOR v_i IN 1..v_installments LOOP
      v_due := (v_base_date + ((v_i - 1) * INTERVAL '1 month'))::date;
      INSERT INTO public.contract_installments (
        clinic_id,
        contract_id,
        payment_plan_id,
        payment_method_id,
        payment_method,
        installment_number,
        installments_count,
        due_date,
        amount,
        status,
        notes
      )
      VALUES (
        v_contract.clinic_id,
        v_contract.id,
        v_plan_id,
        v_method_id,
        v_method,
        v_i,
        v_installments,
        v_due,
        CASE WHEN v_i = v_installments THEN ROUND(v_amount - (v_installment_value * (v_installments - 1)), 2) ELSE v_installment_value END,
        'previsto',
        NULL
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

    RETURN jsonb_build_object(
      'status', 'pending_configuration',
      'contract_id', v_contract.id,
      'payment_plan_id', v_plan_id
    );
  END IF;

  UPDATE public.contract_payment_plans
  SET total_contract_value = COALESCE((SELECT final_amount FROM public.proposals WHERE id = v_contract.proposal_id), v_total_methods),
      total_predicted_value = v_total_methods,
      prediction_status = 'previsto',
      updated_at = now()
  WHERE id = v_plan_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'contract_id', v_contract.id,
    'payment_plan_id', v_plan_id,
    'total_predicted_value', v_total_methods
  );
END;
$function$;

-- Detalhe do contrato no Financeiro passa a trazer os dados da baixa.
CREATE OR REPLACE FUNCTION private.get_finance_contract_forecast_detail(p_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contract record;
  v_methods jsonb;
  v_installments jsonb;
BEGIN
  SELECT
    c.id,
    c.contract_number,
    c.status,
    c.process_status,
    c.created_at,
    p.full_name AS patient_name,
    p.cpf AS patient_cpf,
    py.name AS payer_name,
    py.cpf AS payer_cpf,
    pr.proposal_number,
    pr.final_amount AS contract_total,
    COALESCE(u.raw_user_meta_data ->> 'full_name', u.email, 'Sem responsável') AS seller_name,
    COALESCE(cpp.prediction_status, 'financeiro_pendente_configuracao') AS prediction_status
  INTO v_contract
  FROM public.contracts c
  JOIN public.patients p ON p.id = c.patient_id
  LEFT JOIN public.payers py ON py.id = c.payer_id
  LEFT JOIN public.proposals pr ON pr.id = c.proposal_id
  LEFT JOIN auth.users u ON u.id = c.created_by
  LEFT JOIN public.contract_payment_plans cpp ON cpp.contract_id = c.id
  WHERE c.id = p_contract_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', cpm.id,
        'payment_method', cpm.payment_method,
        'amount', cpm.amount,
        'installments_count', cpm.installments_count,
        'installment_value', cpm.installment_value,
        'card_brand', cpm.card_brand,
        'card_last_digits', cpm.card_last_digits,
        'notes', cpm.notes
      )
      ORDER BY cpm.created_at
    ),
    '[]'::jsonb
  )
  INTO v_methods
  FROM public.contract_payment_methods cpm
  WHERE cpm.contract_id = p_contract_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', ci.id,
        'payment_method', ci.payment_method,
        'installment_number', ci.installment_number,
        'installments_count', ci.installments_count,
        'due_date', ci.due_date,
        'amount', ci.amount,
        'status', ci.status,
        'notes', ci.notes,
        'paid_at', ci.paid_at,
        'paid_amount', ci.paid_amount,
        'paid_method', ci.paid_method
      )
      ORDER BY ci.due_date, ci.installment_number
    ),
    '[]'::jsonb
  )
  INTO v_installments
  FROM public.contract_installments ci
  WHERE ci.contract_id = p_contract_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'contract', to_jsonb(v_contract),
    'methods', v_methods,
    'installments', v_installments
  );
END;
$function$;

-- Paciente vê as parcelas dos próprios contratos (o subselect em contracts já respeita o RLS do paciente).
CREATE POLICY "Patient views own contract installments"
ON public.contract_installments
FOR SELECT TO authenticated
USING (contract_id IN (
  SELECT c.id FROM public.contracts c
  WHERE c.patient_id IN (SELECT public.get_patient_ids_for_user(auth.uid()))
));

-- Grupos de acesso: quem via "Pagamentos" passa a ver o Financeiro de Contratos.
INSERT INTO public.access_group_permissions (clinic_id, group_id, permission_key, can_view)
SELECT clinic_id, group_id, 'finance_contracts.view', can_view
FROM public.access_group_permissions
WHERE permission_key = 'payments.view'
ON CONFLICT (group_id, permission_key) DO UPDATE
  SET can_view = public.access_group_permissions.can_view OR EXCLUDED.can_view;
DELETE FROM public.access_group_permissions WHERE permission_key = 'payments.view';

-- LTV da renovação passa a somar o que foi pago nas parcelas de contrato.
CREATE OR REPLACE VIEW public.v_renewal_tasks_active WITH (security_invoker = true) AS
 WITH ltv_by_patient AS (
         SELECT c.patient_id,
            COALESCE(sum(ci.paid_amount), 0::numeric) AS total_ltv
           FROM contract_installments ci
             JOIN contracts c ON c.id = ci.contract_id
          WHERE ci.status = 'pago'
          GROUP BY c.patient_id
        ), rating_by_patient_treatment AS (
         SELECT sf.patient_id,
            sf.treatment_id,
            avg(sf.rating)::numeric(10,2) AS avg_rating
           FROM session_feedback sf
          GROUP BY sf.patient_id, sf.treatment_id
        )
 SELECT rt.id,
    rt.clinic_id,
    rt.patient_id,
    rt.contract_id,
    rt.contract_item_id,
    rt.treatment_id,
    rt.trigger_type,
    rt.trigger_session_id,
    rt.sessions_completed,
    rt.sessions_total,
    rt.status,
    rt.assigned_to,
    rt.suggested_treatment_id,
    rt.suggested_treatment_rule,
    rt.suggestion_context,
    rt.last_action_at,
    rt.last_action_type,
    rt.snoozed_until,
    rt.snooze_count,
    rt.converted_proposal_id,
    rt.discarded_reason,
    rt.discarded_reason_notes,
    rt.sla_yellow_at,
    rt.sla_red_at,
    rt.scheduled_for,
    rt.created_at,
    rt.updated_at,
    p.full_name AS patient_name,
    p.phone AS patient_phone,
    p.created_at AS patient_created_at,
    t.name AS treatment_name,
    ts.name AS suggested_treatment_name,
    COALESCE(ltv.total_ltv, 0::numeric) AS patient_ltv,
    COALESCE(r.avg_rating, 0::numeric)::numeric(10,2) AS avg_rating,
    GREATEST(date_part('day'::text, now() - COALESCE(rt.last_action_at, rt.created_at)), 0::double precision)::integer AS days_since_last_action,
    GREATEST(date_part('day'::text, now() - rt.created_at), 0::double precision)::integer AS days_since_created
   FROM renewal_tasks rt
     JOIN patients p ON p.id = rt.patient_id
     JOIN treatments t ON t.id = rt.treatment_id
     LEFT JOIN treatments ts ON ts.id = rt.suggested_treatment_id
     LEFT JOIN ltv_by_patient ltv ON ltv.patient_id = rt.patient_id
     LEFT JOIN rating_by_patient_treatment r ON r.patient_id = rt.patient_id AND r.treatment_id = rt.treatment_id
  WHERE (rt.status <> ALL (ARRAY['converted'::text, 'discarded'::text])) AND (rt.scheduled_for IS NULL OR rt.scheduled_for <= now()) AND (rt.snoozed_until IS NULL OR rt.snoozed_until <= now());

-- Financeiro antigo sai.
DROP TABLE public.payment_installments;
DROP TABLE public.payment_plans;
