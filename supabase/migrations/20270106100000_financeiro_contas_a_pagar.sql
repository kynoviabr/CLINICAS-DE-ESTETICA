-- Financeiro etapa 3: contas a pagar.
-- A despesa ganha fornecedor, vencimento, data e forma do pagamento e compra parcelada.
-- expense_date continua sendo a competência (DRE); due_date é quando sai do caixa; paid_at é quando saiu de fato.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS supplier text,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS paid_at date,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS installment_group uuid,
  ADD COLUMN IF NOT EXISTS installment_number integer,
  ADD COLUMN IF NOT EXISTS installments_count integer;

UPDATE public.expenses SET due_date = expense_date WHERE due_date IS NULL;
UPDATE public.expenses SET paid_at = expense_date WHERE paid AND paid_at IS NULL;

CREATE INDEX IF NOT EXISTS expenses_clinic_due_idx ON public.expenses (clinic_id, due_date) WHERE NOT paid;
CREATE INDEX IF NOT EXISTS expenses_clinic_paid_idx ON public.expenses (clinic_id, paid_at) WHERE paid;

-- Mantém vencimento e pagamento coerentes (inclusive nas cópias das despesas que repetem todo mês).
CREATE OR REPLACE FUNCTION private.expense_dates()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.due_date := coalesce(NEW.due_date, NEW.expense_date);
  IF NEW.paid THEN
    NEW.paid_at := coalesce(NEW.paid_at, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  ELSE
    NEW.paid_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS expenses_dates ON public.expenses;
CREATE TRIGGER expenses_dates BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION private.expense_dates();
