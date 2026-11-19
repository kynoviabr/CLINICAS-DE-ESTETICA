-- Despesas da clínica (simples) e base do DRE.
-- Quem vê o Financeiro (finance_contracts.view; admin sempre) lança e vê despesas.

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  category text NOT NULL,
  description text,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  -- Data da despesa (competência): é o mês em que ela entra no DRE.
  expense_date date NOT NULL,
  paid boolean NOT NULL DEFAULT true,
  -- Repete todo mês (aluguel, contador...). As cópias apontam para a original.
  recurring boolean NOT NULL DEFAULT false,
  recurrence_parent uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_clinic_date_idx ON public.expenses (clinic_id, expense_date);
CREATE UNIQUE INDEX IF NOT EXISTS expenses_recurrence_month_uq
  ON public.expenses (recurrence_parent, date_trunc('month', expense_date::timestamp)) WHERE recurrence_parent IS NOT NULL;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Finance views expenses" ON public.expenses;
CREATE POLICY "Finance views expenses" ON public.expenses FOR SELECT TO authenticated
  USING (public.has_menu_access(auth.uid(), clinic_id, 'finance_contracts.view'));
DROP POLICY IF EXISTS "Finance adds expenses" ON public.expenses;
CREATE POLICY "Finance adds expenses" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (public.has_menu_access(auth.uid(), clinic_id, 'finance_contracts.view'));
DROP POLICY IF EXISTS "Finance edits expenses" ON public.expenses;
CREATE POLICY "Finance edits expenses" ON public.expenses FOR UPDATE TO authenticated
  USING (public.has_menu_access(auth.uid(), clinic_id, 'finance_contracts.view'))
  WITH CHECK (public.has_menu_access(auth.uid(), clinic_id, 'finance_contracts.view'));
DROP POLICY IF EXISTS "Finance deletes expenses" ON public.expenses;
CREATE POLICY "Finance deletes expenses" ON public.expenses FOR DELETE TO authenticated
  USING (public.has_menu_access(auth.uid(), clinic_id, 'finance_contracts.view'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;

DROP TRIGGER IF EXISTS update_expenses_updated_at ON public.expenses;
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cria as despesas fixas do mês (a partir das marcadas "repete todo mês"). Não duplica.
CREATE OR REPLACE FUNCTION public.ensure_recurring_expenses(p_clinic_id uuid, p_month date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start date := date_trunc('month', p_month)::date;
  v_count integer;
BEGIN
  IF NOT public.has_menu_access(auth.uid(), p_clinic_id, 'finance_contracts.view') THEN
    RAISE EXCEPTION 'Sem acesso ao financeiro.' USING ERRCODE = '42501';
  END IF;
  -- Não cria meses futuros além do próximo.
  IF v_start > (date_trunc('month', current_date) + interval '1 month')::date THEN
    RETURN 0;
  END IF;
  INSERT INTO public.expenses (clinic_id, category, description, amount, expense_date, paid, recurring, recurrence_parent, created_by)
  SELECT e.clinic_id, e.category, e.description, e.amount,
    LEAST(v_start + (extract(day FROM e.expense_date)::int - 1), (v_start + interval '1 month - 1 day')::date),
    false, false, e.id, auth.uid()
  FROM public.expenses e
  WHERE e.clinic_id = p_clinic_id AND e.recurring AND e.recurrence_parent IS NULL
    AND e.expense_date < v_start
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_recurring_expenses(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_recurring_expenses(uuid, date) TO authenticated;

-- Material usado entra no DRE pelo custo do momento da baixa.
CREATE OR REPLACE FUNCTION public.stock_consume_on_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') AND NEW.treatment_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.stock_movements sm JOIN public.session_records sr ON sr.id = sm.session_record_id
      WHERE sr.appointment_id = NEW.id
    ) THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.stock_movements (clinic_id, cost_item_id, kind, quantity, unit_cost, appointment_id, created_by, notes)
    SELECT NEW.clinic_id, tci.cost_item_id, 'consumo', -tci.quantity, ci.unit_cost, NEW.id, NULL, 'Baixa automática da sessão'
    FROM public.treatment_cost_items tci
    JOIN public.cost_items ci ON ci.id = tci.cost_item_id AND ci.clinic_id = NEW.clinic_id AND ci.type <> 'labor'
    WHERE tci.treatment_id = NEW.treatment_id AND tci.quantity > 0
    ON CONFLICT DO NOTHING;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed' THEN
    DELETE FROM public.stock_movements WHERE appointment_id = NEW.id AND kind = 'consumo';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.stock_consume_on_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.treatment_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.appointment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.stock_movements WHERE appointment_id = NEW.appointment_id
  ) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.stock_movements (clinic_id, cost_item_id, kind, quantity, unit_cost, session_record_id, created_by, notes)
  SELECT NEW.clinic_id, tci.cost_item_id, 'consumo', -tci.quantity, ci.unit_cost, NEW.id, NULL, 'Baixa automática da sessão'
  FROM public.treatment_cost_items tci
  JOIN public.cost_items ci ON ci.id = tci.cost_item_id AND ci.clinic_id = NEW.clinic_id AND ci.type <> 'labor'
  WHERE tci.treatment_id = NEW.treatment_id AND tci.quantity > 0
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- Perda/ajuste sem custo informado: usa o custo atual do material.
CREATE OR REPLACE FUNCTION public.stock_fill_unit_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.unit_cost IS NULL AND NEW.kind IN ('perda', 'ajuste', 'consumo') THEN
    SELECT unit_cost INTO NEW.unit_cost FROM public.cost_items WHERE id = NEW.cost_item_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stock_fill_unit_cost() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS stock_movements_fill_cost ON public.stock_movements;
CREATE TRIGGER stock_movements_fill_cost BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.stock_fill_unit_cost();

UPDATE public.stock_movements sm SET unit_cost = ci.unit_cost
FROM public.cost_items ci
WHERE ci.id = sm.cost_item_id AND sm.unit_cost IS NULL AND sm.kind IN ('consumo', 'perda', 'ajuste');
