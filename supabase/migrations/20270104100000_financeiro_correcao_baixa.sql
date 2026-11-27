-- Estornos claros (etapa 1 do financeiro).
-- "Estornar" uma parcela paga apagava o pagamento sem motivo nem histórico. Agora:
-- 1) Todo pagamento registrado e toda correção de baixa ficam no histórico da parcela (quem, quando, valores).
-- 2) Voltar uma parcela paga para "a receber" só com motivo (função correct_installment_payment).

CREATE TABLE IF NOT EXISTS public.installment_payment_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  installment_id uuid,
  action text NOT NULL CHECK (action IN ('paid', 'corrected')),
  amount numeric(12,2),
  method text,
  paid_at date,
  reason text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS installment_payment_log_contract_idx ON public.installment_payment_log (contract_id, created_at DESC);
ALTER TABLE public.installment_payment_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Finance views payment log" ON public.installment_payment_log;
CREATE POLICY "Finance views payment log" ON public.installment_payment_log FOR SELECT TO authenticated
  USING (public.has_menu_access(auth.uid(), clinic_id, 'finance_contracts.view'));
REVOKE INSERT, UPDATE, DELETE ON public.installment_payment_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.installment_payment_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_reason text := nullif(trim(current_setting('app.payment_correction_reason', true)), '');
BEGIN
  IF NEW.status = 'pago' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pago') THEN
    INSERT INTO public.installment_payment_log (clinic_id, contract_id, installment_id, action, amount, method, paid_at)
    VALUES (NEW.clinic_id, NEW.contract_id, NEW.id, 'paid', NEW.paid_amount, NEW.paid_method, NEW.paid_at);
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pago' AND NEW.status <> 'pago' THEN
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'Para corrigir uma baixa, informe o motivo.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.installment_payment_log (clinic_id, contract_id, installment_id, action, amount, method, paid_at, reason)
    VALUES (OLD.clinic_id, OLD.contract_id, OLD.id, 'corrected', OLD.paid_amount, OLD.paid_method, OLD.paid_at, left(v_reason, 300));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS contract_installments_payment_audit ON public.contract_installments;
CREATE TRIGGER contract_installments_payment_audit AFTER INSERT OR UPDATE OF status ON public.contract_installments
  FOR EACH ROW EXECUTE FUNCTION private.installment_payment_audit();

-- Corrigir baixa lançada errado: volta a parcela para "a receber" com motivo registrado.
CREATE OR REPLACE FUNCTION public.correct_installment_payment(p_installment_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v public.contract_installments%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.contract_installments WHERE id = p_installment_id FOR UPDATE;
  IF v.id IS NULL OR NOT public.has_menu_access(auth.uid(), v.clinic_id, 'finance_contracts.view') THEN
    RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501';
  END IF;
  IF v.status <> 'pago' THEN RAISE EXCEPTION 'Esta parcela não está paga.' USING ERRCODE = '22023'; END IF;
  IF length(trim(coalesce(p_reason, ''))) < 5 THEN RAISE EXCEPTION 'Informe o motivo da correção.' USING ERRCODE = '22023'; END IF;
  PERFORM set_config('app.payment_correction_reason', trim(p_reason), true);
  UPDATE public.contract_installments SET status = 'previsto', paid_at = NULL, paid_amount = NULL, paid_method = NULL WHERE id = v.id;
  PERFORM set_config('app.payment_correction_reason', '', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.correct_installment_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_installment_payment(uuid, text) TO authenticated;
