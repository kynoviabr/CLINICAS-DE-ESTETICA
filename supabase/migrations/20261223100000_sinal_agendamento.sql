-- Sinal por Pix para garantir o horário (docs/SINAL.md).
--
-- - A clínica configura chave Pix, valores, prazos e política em clinic_settings (chave 'deposit_config', JSON).
-- - A equipe cobra o sinal de um agendamento: nasce um link único (só o hash fica no banco).
-- - A cliente abre o link, vê o Pix (QR e copia e cola), aceita a política e paga no banco dela.
-- - A equipe confirma "Recebi o sinal": o horário fica confirmado e sai o recibo numerado (RS-AAAA-NNNN).
-- - O sinal é um crédito da cliente: abatido no contrato, retido na falta, segue o horário na remarcação.
--
-- Situações: pending (aguardando) -> paid (pago) -> applied (abatido) | retained (retido) | refunded (devolvido)
--            pending -> cancelled (cobrança cancelada)

-- =============================================
-- 1. Tabela
-- =============================================

CREATE TABLE IF NOT EXISTS public.appointment_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'applied', 'retained', 'refunded', 'cancelled')),
  due_at timestamptz,
  token_hash text UNIQUE,
  txid text NOT NULL,
  -- Condições no momento da cobrança (mudanças futuras na configuração não alteram o que a cliente aceitou).
  policy_text text NOT NULL,
  notice_hours integer NOT NULL DEFAULT 24,
  credit_days integer NOT NULL DEFAULT 90,
  policy_accepted jsonb,
  paid_at timestamptz,
  confirmed_by uuid,
  payer_name text,
  payer_cpf text,
  receipt_number text,
  applied_at timestamptz,
  applied_contract_id uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appointment_deposits_appt_idx ON public.appointment_deposits (appointment_id);
CREATE INDEX IF NOT EXISTS appointment_deposits_clinic_status_idx ON public.appointment_deposits (clinic_id, status);
CREATE INDEX IF NOT EXISTS appointment_deposits_patient_idx ON public.appointment_deposits (patient_id) WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS appointment_deposits_lead_idx ON public.appointment_deposits (lead_id) WHERE lead_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS appointment_deposits_receipt_uidx ON public.appointment_deposits (clinic_id, receipt_number)
  WHERE receipt_number IS NOT NULL;

ALTER TABLE public.appointment_deposits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff views deposits" ON public.appointment_deposits;
CREATE POLICY "Staff views deposits" ON public.appointment_deposits FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
-- Escrita só pelas funções abaixo (regras de situação num lugar só).
REVOKE ALL ON public.appointment_deposits FROM anon, authenticated;
GRANT SELECT ON public.appointment_deposits TO authenticated;

-- =============================================
-- 2. Apoio
-- =============================================

-- Configuração da clínica (JSON em clinic_settings), já com os padrões.
CREATE OR REPLACE FUNCTION private.deposit_config(p_clinic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_raw text;
  v_cfg jsonb := '{}'::jsonb;
BEGIN
  SELECT value INTO v_raw FROM public.clinic_settings WHERE clinic_id = p_clinic_id AND key = 'deposit_config';
  BEGIN
    IF v_raw IS NOT NULL AND v_raw <> '' THEN v_cfg := v_raw::jsonb; END IF;
  EXCEPTION WHEN others THEN v_cfg := '{}'::jsonb;
  END;
  RETURN jsonb_build_object(
    'pix_key', nullif(trim(coalesce(v_cfg ->> 'pix_key', '')), ''),
    'pix_name', nullif(trim(coalesce(v_cfg ->> 'pix_name', '')), ''),
    'pix_city', nullif(trim(coalesce(v_cfg ->> 'pix_city', '')), ''),
    'pay_hours', greatest(1, coalesce((v_cfg ->> 'pay_hours')::integer, 24)),
    'notice_hours', greatest(0, coalesce((v_cfg ->> 'notice_hours')::integer, 24)),
    'credit_days', greatest(1, coalesce((v_cfg ->> 'credit_days')::integer, 90)),
    'policy_text', coalesce(nullif(trim(coalesce(v_cfg ->> 'policy_text', '')), ''),
      'O sinal é abatido do seu atendimento ou tratamento. Em caso de falta, ou cancelamento com menos de '
      || coalesce((v_cfg ->> 'notice_hours')::integer, 24)
      || ' horas de antecedência, ele não é devolvido.')
  );
END;
$$;

-- Nome da profissional do agendamento (professional_id pode ser o cadastro ou o usuário).
CREATE OR REPLACE FUNCTION private.deposit_professional_name(p_professional_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT full_name FROM public.professionals
  WHERE p_professional_id IS NOT NULL AND (id = p_professional_id OR user_id = p_professional_id)
  ORDER BY (id = p_professional_id) DESC
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION private.deposit_config(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.deposit_professional_name(uuid) FROM PUBLIC, anon, authenticated;

-- Novo código do link (o anterior deixa de valer).
CREATE OR REPLACE FUNCTION private.deposit_new_token(p_deposit_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
BEGIN
  UPDATE public.appointment_deposits SET token_hash = private.anamnese_token_hash(v_token), updated_at = now()
  WHERE id = p_deposit_id;
  RETURN v_token;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.deposit_new_token(uuid) FROM PUBLIC, anon, authenticated;

-- =============================================
-- 3. Equipe
-- =============================================

-- Cobrar sinal de um agendamento. Uma cobrança aberta anterior do mesmo horário é cancelada.
CREATE OR REPLACE FUNCTION public.deposit_create(p_appointment_id uuid, p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_cfg jsonb;
  v_id uuid;
  v_due timestamptz;
  v_patient uuid;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND OR NOT public.is_clinic_staff(auth.uid(), v_appt.clinic_id) THEN
    RAISE EXCEPTION 'Agendamento não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF v_appt.status IN ('cancelled', 'no_show', 'completed', 'rescheduled') THEN
    RAISE EXCEPTION 'Este agendamento não está mais em aberto.' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000 THEN
    RAISE EXCEPTION 'Informe o valor do sinal.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.appointment_deposits WHERE appointment_id = v_appt.id AND status = 'paid') THEN
    RAISE EXCEPTION 'O sinal deste horário já foi pago.' USING ERRCODE = '22023';
  END IF;

  v_cfg := private.deposit_config(v_appt.clinic_id);
  IF v_cfg ->> 'pix_key' IS NULL OR v_cfg ->> 'pix_name' IS NULL OR v_cfg ->> 'pix_city' IS NULL THEN
    RAISE EXCEPTION 'Cadastre a chave Pix da clínica em Configurações › Pagamentos.' USING ERRCODE = '22023';
  END IF;

  -- Lead que já virou paciente: o sinal fica na paciente.
  v_patient := v_appt.patient_id;
  IF v_patient IS NULL AND v_appt.lead_id IS NOT NULL THEN
    SELECT patient_id INTO v_patient FROM public.leads WHERE id = v_appt.lead_id;
  END IF;

  UPDATE public.appointment_deposits SET status = 'cancelled', resolved_at = now(), resolved_by = auth.uid(),
    token_hash = NULL, updated_at = now()
  WHERE appointment_id = v_appt.id AND status = 'pending';

  v_due := least(now() + make_interval(hours => (v_cfg ->> 'pay_hours')::integer), v_appt.start_time);
  INSERT INTO public.appointment_deposits (clinic_id, appointment_id, patient_id, lead_id, amount, due_at, txid,
    policy_text, notice_hours, credit_days)
  VALUES (v_appt.clinic_id, v_appt.id, v_patient, v_appt.lead_id, round(p_amount, 2), v_due,
    'SINAL' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
    v_cfg ->> 'policy_text', (v_cfg ->> 'notice_hours')::integer, (v_cfg ->> 'credit_days')::integer)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'token', private.deposit_new_token(v_id), 'due_at', v_due);
END;
$$;

-- Link novo para reenviar a cobrança (ou o recibo).
CREATE OR REPLACE FUNCTION public.deposit_link(p_deposit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dep public.appointment_deposits%ROWTYPE;
BEGIN
  SELECT * INTO v_dep FROM public.appointment_deposits WHERE id = p_deposit_id;
  IF NOT FOUND OR NOT public.is_clinic_staff(auth.uid(), v_dep.clinic_id) THEN
    RAISE EXCEPTION 'Sinal não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF v_dep.status = 'cancelled' THEN
    RAISE EXCEPTION 'Esta cobrança foi cancelada.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('token', private.deposit_new_token(v_dep.id));
END;
$$;

-- "Recebi o sinal": confirma o horário e numera o recibo.
CREATE OR REPLACE FUNCTION public.deposit_confirm(p_deposit_id uuid, p_payer_name text, p_payer_cpf text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dep public.appointment_deposits%ROWTYPE;
  v_name text := regexp_replace(trim(coalesce(p_payer_name, '')), '\s+', ' ', 'g');
  v_cpf text := nullif(regexp_replace(coalesce(p_payer_cpf, ''), '\D', '', 'g'), '');
  v_year text := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY');
  v_seq integer;
  v_number text;
BEGIN
  SELECT * INTO v_dep FROM public.appointment_deposits WHERE id = p_deposit_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_clinic_staff(auth.uid(), v_dep.clinic_id) THEN
    RAISE EXCEPTION 'Sinal não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF v_dep.status <> 'pending' THEN
    RAISE EXCEPTION 'Este sinal não está aguardando pagamento.' USING ERRCODE = '22023';
  END IF;
  IF length(v_name) < 3 THEN
    RAISE EXCEPTION 'Informe o nome de quem pagou.' USING ERRCODE = '22023';
  END IF;
  IF v_cpf IS NOT NULL AND NOT private.cpf_is_valid(v_cpf) THEN
    RAISE EXCEPTION 'CPF de quem pagou inválido.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_dep.clinic_id::text || ':deposit_receipt'));
  SELECT coalesce(max(substr(receipt_number, 9)::integer), 0) + 1 INTO v_seq
  FROM public.appointment_deposits
  WHERE clinic_id = v_dep.clinic_id AND receipt_number LIKE 'RS-' || v_year || '-%';
  v_number := 'RS-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  UPDATE public.appointment_deposits SET
    status = 'paid', paid_at = now(), confirmed_by = auth.uid(),
    payer_name = v_name, payer_cpf = v_cpf, receipt_number = v_number, updated_at = now()
  WHERE id = v_dep.id;

  UPDATE public.appointments SET status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()),
    confirmed_via = coalesce(confirmed_via, 'sinal')
  WHERE id = v_dep.appointment_id AND status = 'scheduled';

  RETURN jsonb_build_object('ok', true, 'receipt_number', v_number, 'token', private.deposit_new_token(v_dep.id));
END;
$$;

-- Destino do sinal: cancelar a cobrança, reter, devolver ou voltar para crédito.
CREATE OR REPLACE FUNCTION public.deposit_resolve(p_deposit_id uuid, p_outcome text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dep public.appointment_deposits%ROWTYPE;
BEGIN
  SELECT * INTO v_dep FROM public.appointment_deposits WHERE id = p_deposit_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_clinic_staff(auth.uid(), v_dep.clinic_id) THEN
    RAISE EXCEPTION 'Sinal não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF p_outcome = 'cancelled' AND v_dep.status <> 'pending' THEN
    RAISE EXCEPTION 'Só dá para cancelar uma cobrança ainda não paga.' USING ERRCODE = '22023';
  ELSIF p_outcome IN ('retained', 'refunded') AND v_dep.status <> 'paid' THEN
    RAISE EXCEPTION 'Este sinal não está como crédito.' USING ERRCODE = '22023';
  ELSIF p_outcome = 'paid' AND v_dep.status NOT IN ('retained', 'refunded') THEN
    RAISE EXCEPTION 'Este sinal não pode voltar a ser crédito.' USING ERRCODE = '22023';
  ELSIF p_outcome NOT IN ('cancelled', 'retained', 'refunded', 'paid') THEN
    RAISE EXCEPTION 'Opção inválida.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.appointment_deposits SET
    status = p_outcome,
    token_hash = CASE WHEN p_outcome = 'cancelled' THEN NULL ELSE token_hash END,
    resolved_at = CASE WHEN p_outcome = 'paid' THEN NULL ELSE now() END,
    resolved_by = CASE WHEN p_outcome = 'paid' THEN NULL ELSE auth.uid() END,
    note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note),
    updated_at = now()
  WHERE id = v_dep.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Abater sinais pagos num contrato: cada sinal vira uma parcela de entrada já paga (na data em que foi pago).
CREATE OR REPLACE FUNCTION public.deposit_apply_to_contract(p_contract_id uuid, p_deposit_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract record;
  v_dep public.appointment_deposits%ROWTYPE;
  v_total numeric := 0;
  v_plan uuid;
BEGIN
  SELECT id, clinic_id, patient_id INTO v_contract FROM public.contracts WHERE id = p_contract_id;
  IF NOT FOUND OR NOT public.is_clinic_staff(auth.uid(), v_contract.clinic_id) THEN
    RAISE EXCEPTION 'Contrato não encontrado.' USING ERRCODE = '42501';
  END IF;
  -- Plano de pagamento do contrato (criado junto com o contrato; este só é um reserva).
  SELECT id INTO v_plan FROM public.contract_payment_plans WHERE contract_id = v_contract.id ORDER BY created_at LIMIT 1;
  IF v_plan IS NULL THEN
    INSERT INTO public.contract_payment_plans (clinic_id, contract_id) VALUES (v_contract.clinic_id, v_contract.id)
    RETURNING id INTO v_plan;
  END IF;

  FOR v_dep IN
    SELECT * FROM public.appointment_deposits
    WHERE id = ANY(coalesce(p_deposit_ids, '{}')) AND clinic_id = v_contract.clinic_id FOR UPDATE
  LOOP
    IF v_dep.status <> 'paid' THEN
      RAISE EXCEPTION 'O sinal % não está disponível para abater.', coalesce(v_dep.receipt_number, '') USING ERRCODE = '22023';
    END IF;
    IF v_dep.patient_id IS DISTINCT FROM v_contract.patient_id
       AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = v_dep.lead_id AND l.patient_id = v_contract.patient_id) THEN
      RAISE EXCEPTION 'O sinal % é de outra cliente.', coalesce(v_dep.receipt_number, '') USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.contract_installments (clinic_id, contract_id, payment_plan_id, payment_method, installment_number,
      installments_count, due_date, amount, status, notes, paid_at, paid_amount, paid_method, paid_by)
    VALUES (v_contract.clinic_id, v_contract.id, v_plan, 'pix', 0, 1, (v_dep.paid_at AT TIME ZONE 'America/Sao_Paulo')::date,
      v_dep.amount, 'pago', 'Sinal ' || coalesce(v_dep.receipt_number, ''),
      (v_dep.paid_at AT TIME ZONE 'America/Sao_Paulo')::date, v_dep.amount, 'pix', v_dep.confirmed_by);

    UPDATE public.appointment_deposits SET status = 'applied', applied_at = now(), applied_contract_id = v_contract.id,
      patient_id = coalesce(patient_id, v_contract.patient_id), updated_at = now()
    WHERE id = v_dep.id;
    v_total := v_total + v_dep.amount;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'applied', v_total);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deposit_create(uuid, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deposit_link(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deposit_confirm(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deposit_resolve(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deposit_apply_to_contract(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deposit_create(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deposit_link(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deposit_confirm(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deposit_resolve(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deposit_apply_to_contract(uuid, uuid[]) TO authenticated;

-- =============================================
-- 4. Página da cliente (sem login, pelo código do link)
-- =============================================

CREATE OR REPLACE FUNCTION public.deposit_public(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dep public.appointment_deposits%ROWTYPE;
  v_appt public.appointments%ROWTYPE;
  v_clinic public.clinics%ROWTYPE;
  v_cfg jsonb;
  v_client text;
  v_treatment text;
  v_doc text;
BEGIN
  IF coalesce(p_token, '') = '' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO v_dep FROM public.appointment_deposits WHERE token_hash = private.anamnese_token_hash(p_token);
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO v_appt FROM public.appointments WHERE id = v_dep.appointment_id;
  SELECT * INTO v_clinic FROM public.clinics WHERE id = v_dep.clinic_id;
  v_cfg := private.deposit_config(v_dep.clinic_id);
  SELECT value INTO v_doc FROM public.clinic_settings WHERE clinic_id = v_dep.clinic_id AND key = 'cnpj';
  v_client := coalesce((SELECT full_name FROM public.patients WHERE id = v_dep.patient_id),
                       (SELECT full_name FROM public.leads WHERE id = v_dep.lead_id), '');
  SELECT name INTO v_treatment FROM public.treatments WHERE id = v_appt.treatment_id;

  RETURN jsonb_build_object(
    'status', CASE
      WHEN v_dep.status = 'pending' AND v_dep.due_at IS NOT NULL AND v_dep.due_at < now() THEN 'expired'
      ELSE v_dep.status END,
    'amount', v_dep.amount,
    'due_at', v_dep.due_at,
    'txid', v_dep.txid,
    'policy_text', v_dep.policy_text,
    'notice_hours', v_dep.notice_hours,
    'credit_days', v_dep.credit_days,
    'policy_accepted_at', v_dep.policy_accepted ->> 'at',
    'first_name', CASE WHEN v_client = 'Contato do WhatsApp' THEN NULL ELSE nullif(split_part(trim(v_client), ' ', 1), '') END,
    'appointment', jsonb_build_object(
      'start_time', v_appt.start_time,
      'kind', v_appt.appointment_type,
      'treatment', v_treatment,
      'professional', private.deposit_professional_name(v_appt.professional_id)
    ),
    'pix', CASE WHEN v_dep.status = 'pending' THEN jsonb_build_object(
      'key', v_cfg ->> 'pix_key', 'name', v_cfg ->> 'pix_name', 'city', v_cfg ->> 'pix_city') END,
    'clinic', jsonb_build_object(
      'name', v_clinic.name, 'logo_url', v_clinic.logo_url, 'primary_color', v_clinic.primary_color,
      'document', v_doc, 'address', v_clinic.address, 'city', v_clinic.city, 'state', v_clinic.state,
      'zip_code', v_clinic.zip_code, 'phone', v_clinic.phone, 'email', v_clinic.email),
    'receipt', CASE WHEN v_dep.receipt_number IS NOT NULL THEN jsonb_build_object(
      'number', v_dep.receipt_number,
      'client_name', v_client,
      'payer_name', v_dep.payer_name,
      'payer_cpf', v_dep.payer_cpf,
      'paid_at', v_dep.paid_at,
      'confirmed_by', (SELECT full_name FROM public.professionals WHERE user_id = v_dep.confirmed_by LIMIT 1),
      'policy_accepted', v_dep.policy_accepted) END
  );
END;
$$;

-- "Li e concordo" (antes de pagar). Guarda data, hora, IP e navegador.
CREATE OR REPLACE FUNCTION public.deposit_accept_policy(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dep public.appointment_deposits%ROWTYPE;
  v_headers json;
BEGIN
  SELECT * INTO v_dep FROM public.appointment_deposits WHERE token_hash = private.anamnese_token_hash(p_token) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Link inválido.' USING ERRCODE = '22023'; END IF;
  IF v_dep.status <> 'pending' THEN RAISE EXCEPTION 'Este sinal não está mais aguardando pagamento.' USING ERRCODE = '22023'; END IF;
  IF v_dep.policy_accepted IS NULL THEN
    v_headers := nullif(current_setting('request.headers', true), '')::json;
    UPDATE public.appointment_deposits SET policy_accepted = jsonb_build_object(
      'at', now(),
      'text', v_dep.policy_text,
      'ip', split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1),
      'user_agent', left(coalesce(v_headers ->> 'user-agent', ''), 300)
    ), updated_at = now()
    WHERE id = v_dep.id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deposit_public(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.deposit_accept_policy(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deposit_public(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deposit_accept_policy(text) TO anon, authenticated;

-- =============================================
-- 5. Regras automáticas da agenda
-- =============================================

-- Faltou: o sinal pago fica retido. Cancelado: cobrança não paga é cancelada (o pago continua crédito).
CREATE OR REPLACE FUNCTION private.deposit_on_appointment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'no_show' THEN
    UPDATE public.appointment_deposits SET status = 'retained', resolved_at = now(),
      note = coalesce(note, 'Falta no atendimento'), updated_at = now()
    WHERE appointment_id = NEW.id AND status = 'paid';
  END IF;
  IF NEW.status IN ('no_show', 'cancelled') THEN
    UPDATE public.appointment_deposits SET status = 'cancelled', resolved_at = now(), token_hash = NULL, updated_at = now()
    WHERE appointment_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

-- Remarcou: o sinal (pago ou aguardando) acompanha o novo horário.
CREATE OR REPLACE FUNCTION private.deposit_on_appointment_reschedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.rescheduled_from IS NOT NULL THEN
    UPDATE public.appointment_deposits SET appointment_id = NEW.id, updated_at = now()
    WHERE appointment_id = NEW.rescheduled_from AND status IN ('pending', 'paid');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.deposit_on_appointment_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.deposit_on_appointment_reschedule() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS appointments_deposit_status ON public.appointments;
CREATE TRIGGER appointments_deposit_status AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION private.deposit_on_appointment_status();

DROP TRIGGER IF EXISTS appointments_deposit_reschedule ON public.appointments;
CREATE TRIGGER appointments_deposit_reschedule AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION private.deposit_on_appointment_reschedule();
