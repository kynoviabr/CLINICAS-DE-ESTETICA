-- Financeiro etapa 2: maquininhas da clínica (taxa e prazo que ela fechou com a operadora) e recebíveis reais.
-- Venda no cartão acontece de uma vez: o paciente quita no cartão (as N parcelas são dele com a operadora)
-- e a clínica recebe da operadora conforme o contrato: no fluxo (30/60/90...) ou antecipado (D+N), com taxa.
-- Estorno no cartão (pedido pela clínica) e contestação (chargeback): cancelam o que não caiu; o que já caiu vira débito.

CREATE TABLE IF NOT EXISTS public.payment_terminals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 60),
  active boolean NOT NULL DEFAULT true,
  -- Crédito: 'flow' = cada parcela cai a cada 30 dias; 'advance' = tudo cai em D+advance_days (antecipação automática).
  credit_mode text NOT NULL DEFAULT 'advance' CHECK (credit_mode IN ('flow', 'advance')),
  advance_days integer NOT NULL DEFAULT 1 CHECK (advance_days BETWEEN 0 AND 90),
  debit_days integer NOT NULL DEFAULT 1 CHECK (debit_days BETWEEN 0 AND 30),
  -- Taxas em % (já com a antecipação, se for o caso).
  debit_fee numeric(6,3) NOT NULL DEFAULT 0 CHECK (debit_fee BETWEEN 0 AND 100),
  credit_1_fee numeric(6,3) NOT NULL DEFAULT 0 CHECK (credit_1_fee BETWEEN 0 AND 100),
  credit_2_6_fee numeric(6,3) NOT NULL DEFAULT 0 CHECK (credit_2_6_fee BETWEEN 0 AND 100),
  credit_7_12_fee numeric(6,3) NOT NULL DEFAULT 0 CHECK (credit_7_12_fee BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_terminals_clinic_idx ON public.payment_terminals (clinic_id);
ALTER TABLE public.payment_terminals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Finance views terminals" ON public.payment_terminals;
CREATE POLICY "Finance views terminals" ON public.payment_terminals FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
DROP POLICY IF EXISTS "Finance adds terminals" ON public.payment_terminals;
CREATE POLICY "Finance adds terminals" ON public.payment_terminals FOR INSERT TO authenticated
  WITH CHECK (public.has_menu_access(auth.uid(), clinic_id, 'finance_contracts.view'));
DROP POLICY IF EXISTS "Finance edits terminals" ON public.payment_terminals;
CREATE POLICY "Finance edits terminals" ON public.payment_terminals FOR UPDATE TO authenticated
  USING (public.has_menu_access(auth.uid(), clinic_id, 'finance_contracts.view'))
  WITH CHECK (public.has_menu_access(auth.uid(), clinic_id, 'finance_contracts.view'));
REVOKE DELETE ON public.payment_terminals FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.card_receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL,
  terminal_id uuid REFERENCES public.payment_terminals(id) ON DELETE SET NULL,
  terminal_name text NOT NULL,
  card_type text NOT NULL CHECK (card_type IN ('credit', 'debit')),
  kind text NOT NULL DEFAULT 'sale' CHECK (kind IN ('sale', 'reversal')),
  sale_date date NOT NULL,
  installments_count integer NOT NULL DEFAULT 1,
  number integer NOT NULL DEFAULT 1,
  gross numeric(12,2) NOT NULL,
  fee_percent numeric(6,3) NOT NULL DEFAULT 0,
  fee_amount numeric(12,2) NOT NULL DEFAULT 0,
  net numeric(12,2) NOT NULL,
  expected_date date NOT NULL,
  status text NOT NULL DEFAULT 'expected' CHECK (status IN ('expected', 'received', 'cancelled')),
  received_at date,
  reason text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS card_receivables_clinic_date_idx ON public.card_receivables (clinic_id, expected_date);
CREATE INDEX IF NOT EXISTS card_receivables_sale_idx ON public.card_receivables (sale_id);
ALTER TABLE public.card_receivables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Finance views card receivables" ON public.card_receivables;
CREATE POLICY "Finance views card receivables" ON public.card_receivables FOR SELECT TO authenticated
  USING (public.has_menu_access(auth.uid(), clinic_id, 'finance_contracts.view'));
REVOKE INSERT, UPDATE, DELETE ON public.card_receivables FROM anon, authenticated;

-- Taxa da maquininha para o tipo de venda.
CREATE OR REPLACE FUNCTION private.terminal_fee(t public.payment_terminals, p_type text, p_n int)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_type = 'debit' THEN t.debit_fee
              WHEN p_n <= 1 THEN t.credit_1_fee
              WHEN p_n <= 6 THEN t.credit_2_6_fee
              ELSE t.credit_7_12_fee END;
$$;

-- Registra a venda no cartão de uma forma de pagamento do contrato: todas as parcelas em aberto dessa forma
-- ficam pagas (o paciente quitou no cartão) e nascem os recebíveis da operadora.
CREATE OR REPLACE FUNCTION public.register_card_sale(p_installment_id uuid, p_terminal_id uuid, p_card_type text, p_installments integer, p_sale_date date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inst public.contract_installments%ROWTYPE; t public.payment_terminals%ROWTYPE;
  v_sale uuid := gen_random_uuid(); v_gross numeric(12,2); v_fee_pct numeric; v_fee numeric(12,2); v_net numeric(12,2);
  v_n int := greatest(coalesce(p_installments, 1), 1); i int; v_part_gross numeric(12,2); v_part_fee numeric(12,2);
BEGIN
  SELECT * INTO v_inst FROM public.contract_installments WHERE id = p_installment_id FOR UPDATE;
  IF v_inst.id IS NULL OR NOT public.has_menu_access(auth.uid(), v_inst.clinic_id, 'finance_contracts.view') THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501'; END IF;
  IF v_inst.status <> 'previsto' THEN RAISE EXCEPTION 'Esta parcela não está em aberto.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM public.payment_terminals WHERE id = p_terminal_id AND clinic_id = v_inst.clinic_id AND active;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Escolha uma maquininha da clínica.' USING ERRCODE = '22023'; END IF;
  IF p_card_type NOT IN ('credit', 'debit') THEN RAISE EXCEPTION 'Tipo de cartão inválido.' USING ERRCODE = '22023'; END IF;
  IF p_card_type = 'debit' THEN v_n := 1; END IF;
  IF v_n > 24 THEN RAISE EXCEPTION 'Até 24 parcelas.' USING ERRCODE = '22023'; END IF;
  IF p_sale_date IS NULL OR p_sale_date > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Data da venda inválida.' USING ERRCODE = '22023'; END IF;

  -- Parcelas cobertas: todas as em aberto da mesma forma de pagamento do contrato (ou só esta, em contratos antigos).
  CREATE TEMP TABLE IF NOT EXISTS _sale_inst (id uuid, amount numeric) ON COMMIT DROP;
  DELETE FROM _sale_inst;
  INSERT INTO _sale_inst SELECT id, amount FROM public.contract_installments
   WHERE contract_id = v_inst.contract_id AND status = 'previsto'
     AND (id = v_inst.id OR (v_inst.payment_method_id IS NOT NULL AND payment_method_id = v_inst.payment_method_id));
  SELECT sum(amount) INTO v_gross FROM _sale_inst;

  UPDATE public.contract_installments ci SET status = 'pago', paid_at = p_sale_date, paid_amount = ci.amount, paid_method = p_card_type,
    notes = format('Cartão (%s) %sx · %s', CASE WHEN p_card_type = 'debit' THEN 'débito' ELSE 'crédito' END, v_n, t.name)
  WHERE ci.id IN (SELECT id FROM _sale_inst);

  v_fee_pct := private.terminal_fee(t, p_card_type, v_n);
  v_fee := round(v_gross * v_fee_pct / 100, 2);
  v_net := v_gross - v_fee;

  IF p_card_type = 'debit' OR t.credit_mode = 'advance' THEN
    INSERT INTO public.card_receivables (clinic_id, contract_id, sale_id, terminal_id, terminal_name, card_type, sale_date, installments_count, number, gross, fee_percent, fee_amount, net, expected_date)
    VALUES (v_inst.clinic_id, v_inst.contract_id, v_sale, t.id, t.name, p_card_type, p_sale_date, v_n, 1, v_gross, v_fee_pct, v_fee, v_net,
      p_sale_date + CASE WHEN p_card_type = 'debit' THEN t.debit_days ELSE t.advance_days END);
  ELSE
    FOR i IN 1..v_n LOOP
      v_part_gross := CASE WHEN i = v_n THEN v_gross - round(v_gross / v_n, 2) * (v_n - 1) ELSE round(v_gross / v_n, 2) END;
      v_part_fee := CASE WHEN i = v_n THEN v_fee - round(v_fee / v_n, 2) * (v_n - 1) ELSE round(v_fee / v_n, 2) END;
      INSERT INTO public.card_receivables (clinic_id, contract_id, sale_id, terminal_id, terminal_name, card_type, sale_date, installments_count, number, gross, fee_percent, fee_amount, net, expected_date)
      VALUES (v_inst.clinic_id, v_inst.contract_id, v_sale, t.id, t.name, p_card_type, p_sale_date, v_n, i, v_part_gross, v_fee_pct, v_part_fee, v_part_gross - v_part_fee, p_sale_date + 30 * i);
    END LOOP;
  END IF;
  RETURN v_sale;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.register_card_sale(uuid, uuid, text, integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_card_sale(uuid, uuid, text, integer, date) TO authenticated;

-- Dinheiro da operadora caiu na conta.
CREATE OR REPLACE FUNCTION public.mark_card_receivable_received(p_receivable_id uuid, p_received_at date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE r public.card_receivables%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.card_receivables WHERE id = p_receivable_id FOR UPDATE;
  IF r.id IS NULL OR NOT public.has_menu_access(auth.uid(), r.clinic_id, 'finance_contracts.view') THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'expected' THEN RAISE EXCEPTION 'Este recebível não está a receber.' USING ERRCODE = '22023'; END IF;
  UPDATE public.card_receivables SET status = 'received', received_at = coalesce(p_received_at, (now() AT TIME ZONE 'America/Sao_Paulo')::date) WHERE id = r.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mark_card_receivable_received(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_card_receivable_received(uuid, date) TO authenticated;

-- Estorno no cartão (a clínica devolve ao paciente pela operadora) ou contestação (chargeback).
-- O que ainda não caiu é cancelado; o que já caiu vira débito (descontado no próximo repasse).
-- Estorno: o valor volta ao paciente (entra como devolução); a taxa da operadora em geral não volta.
CREATE OR REPLACE FUNCTION public.reverse_card_sale(p_sale_id uuid, p_kind text, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE s record; v_received numeric(12,2); v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT clinic_id, contract_id, terminal_id, terminal_name, card_type, sum(gross) AS gross, max(installments_count) AS n
    INTO s FROM public.card_receivables WHERE sale_id = p_sale_id AND kind = 'sale' GROUP BY clinic_id, contract_id, terminal_id, terminal_name, card_type;
  IF s.clinic_id IS NULL OR NOT public.has_menu_access(auth.uid(), s.clinic_id, 'finance_contracts.view') THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501'; END IF;
  IF p_kind NOT IN ('refund', 'chargeback') THEN RAISE EXCEPTION 'Tipo inválido.' USING ERRCODE = '22023'; END IF;
  IF length(trim(coalesce(p_reason, ''))) < 5 THEN RAISE EXCEPTION 'Informe o motivo.' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.card_receivables WHERE sale_id = p_sale_id AND kind = 'reversal') THEN RAISE EXCEPTION 'Esta venda já foi estornada.' USING ERRCODE = '22023'; END IF;

  UPDATE public.card_receivables SET status = 'cancelled', reason = trim(p_reason) WHERE sale_id = p_sale_id AND kind = 'sale' AND status = 'expected';
  SELECT coalesce(sum(net), 0) INTO v_received FROM public.card_receivables WHERE sale_id = p_sale_id AND kind = 'sale' AND status = 'received';
  -- Marca a venda como estornada (mesmo sem débito, para não estornar duas vezes).
  INSERT INTO public.card_receivables (clinic_id, contract_id, sale_id, terminal_id, terminal_name, card_type, kind, sale_date, installments_count, number, gross, fee_percent, fee_amount, net, expected_date, status, reason)
  VALUES (s.clinic_id, s.contract_id, p_sale_id, s.terminal_id, s.terminal_name, s.card_type, 'reversal', v_today, s.n, 1, -s.gross, 0, 0, -v_received, v_today,
    CASE WHEN v_received > 0 THEN 'expected' ELSE 'received' END,
    format('%s: %s', CASE WHEN p_kind = 'refund' THEN 'Estorno no cartão' ELSE 'Contestação (chargeback)' END, trim(p_reason)));
  -- O paciente recebeu o dinheiro de volta pelo cartão: registra como devolução feita (entra no DRE).
  IF s.contract_id IS NOT NULL THEN
    INSERT INTO public.contract_refunds (clinic_id, contract_id, amount, status, paid_at, paid_method, paid_by, notes)
    VALUES (s.clinic_id, s.contract_id, s.gross, 'paid', v_today, 'card_reversal', auth.uid(),
      CASE WHEN p_kind = 'refund' THEN 'Estorno no cartão: ' ELSE 'Contestação (chargeback): ' END || trim(p_reason));
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reverse_card_sale(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_card_sale(uuid, text, text) TO authenticated;
