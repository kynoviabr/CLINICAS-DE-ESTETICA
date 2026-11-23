-- Estoque básico de material.
-- Material = cost_items (já existe, com unidade e custo). Receita do tratamento = treatment_cost_items.
-- Saldo = soma dos movimentos. Baixa automática ao concluir a sessão (agenda) ou ao registrar sessão avulsa.

-- Quem gerencia o estoque (além do admin).
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS can_manage_stock boolean NOT NULL DEFAULT false;

-- Estoque mínimo do material (aviso "acabando").
ALTER TABLE public.cost_items ADD COLUMN IF NOT EXISTS stock_min numeric(12,3) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.can_manage_stock(_user_id uuid, _clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.has_clinic_role(_user_id, _clinic_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id AND ur.clinic_id = _clinic_id AND ur.is_active AND ur.can_manage_stock
    );
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_stock(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_stock(uuid, uuid) TO authenticated;

-- Quem gerencia estoque também cadastra e edita material.
DROP POLICY IF EXISTS "Stock managers create cost items" ON public.cost_items;
CREATE POLICY "Stock managers create cost items" ON public.cost_items FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_stock(auth.uid(), clinic_id));
DROP POLICY IF EXISTS "Stock managers update cost items" ON public.cost_items;
CREATE POLICY "Stock managers update cost items" ON public.cost_items FOR UPDATE TO authenticated
  USING (public.can_manage_stock(auth.uid(), clinic_id))
  WITH CHECK (public.can_manage_stock(auth.uid(), clinic_id));

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  cost_item_id uuid NOT NULL REFERENCES public.cost_items(id) ON DELETE CASCADE,
  -- entrada (+), consumo (-, automático), perda (-), ajuste (+/-, contagem)
  kind text NOT NULL CHECK (kind IN ('entrada', 'consumo', 'perda', 'ajuste')),
  quantity numeric(12,3) NOT NULL CHECK (quantity <> 0),
  unit_cost numeric(12,2),
  lot text,
  expires_at date,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  session_record_id uuid REFERENCES public.session_records(id) ON DELETE CASCADE,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'entrada' OR quantity > 0),
  CHECK (kind <> 'perda' OR quantity < 0),
  CHECK (kind <> 'consumo' OR quantity < 0)
);

CREATE INDEX IF NOT EXISTS stock_movements_item_idx ON public.stock_movements (clinic_id, cost_item_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_appointment_item_uq
  ON public.stock_movements (appointment_id, cost_item_id) WHERE appointment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_session_item_uq
  ON public.stock_movements (session_record_id, cost_item_id) WHERE session_record_id IS NOT NULL;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff views stock movements" ON public.stock_movements;
CREATE POLICY "Staff views stock movements" ON public.stock_movements FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));

-- Lançamentos manuais: só quem gerencia estoque, material da própria clínica, sem consumo (esse é automático).
DROP POLICY IF EXISTS "Stock managers add movements" ON public.stock_movements;
CREATE POLICY "Stock managers add movements" ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_stock(auth.uid(), clinic_id)
    AND kind IN ('entrada', 'perda', 'ajuste')
    AND appointment_id IS NULL AND session_record_id IS NULL
    AND created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.cost_items ci WHERE ci.id = cost_item_id AND ci.clinic_id = stock_movements.clinic_id)
  );

GRANT SELECT, INSERT ON public.stock_movements TO authenticated;

-- Saldo por material.
CREATE OR REPLACE VIEW public.stock_balances
WITH (security_invoker = true) AS
SELECT ci.clinic_id, ci.id AS cost_item_id, coalesce(sum(sm.quantity), 0)::numeric(12,3) AS balance
FROM public.cost_items ci
LEFT JOIN public.stock_movements sm ON sm.cost_item_id = ci.id
GROUP BY ci.clinic_id, ci.id;

GRANT SELECT ON public.stock_balances TO authenticated;

-- Entrada com custo atualiza o custo médio do material.
CREATE OR REPLACE FUNCTION public.stock_update_average_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_before numeric;
  v_cost numeric;
BEGIN
  IF NEW.kind <> 'entrada' OR NEW.unit_cost IS NULL OR NEW.unit_cost <= 0 THEN
    RETURN NEW;
  END IF;
  SELECT coalesce(sum(quantity), 0) - NEW.quantity INTO v_before
    FROM public.stock_movements WHERE cost_item_id = NEW.cost_item_id;
  SELECT unit_cost INTO v_cost FROM public.cost_items WHERE id = NEW.cost_item_id;
  UPDATE public.cost_items SET unit_cost = CASE
      WHEN v_before <= 0 OR coalesce(v_cost, 0) <= 0 THEN NEW.unit_cost
      ELSE round(((v_before * v_cost) + (NEW.quantity * NEW.unit_cost)) / (v_before + NEW.quantity), 2)
    END
  WHERE id = NEW.cost_item_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stock_movements_average_cost ON public.stock_movements;
CREATE TRIGGER stock_movements_average_cost AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.stock_update_average_cost();

-- Baixa automática: sessão concluída na agenda. Desfazer a conclusão devolve o material.
CREATE OR REPLACE FUNCTION public.stock_consume_on_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') AND NEW.treatment_id IS NOT NULL THEN
    -- Sessão já registrada (e baixada) antes de concluir na agenda: não baixa de novo.
    IF EXISTS (
      SELECT 1 FROM public.stock_movements sm JOIN public.session_records sr ON sr.id = sm.session_record_id
      WHERE sr.appointment_id = NEW.id
    ) THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.stock_movements (clinic_id, cost_item_id, kind, quantity, appointment_id, created_by, notes)
    SELECT NEW.clinic_id, tci.cost_item_id, 'consumo', -tci.quantity, NEW.id, NULL, 'Baixa automática da sessão'
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

DROP TRIGGER IF EXISTS appointments_stock_consume ON public.appointments;
CREATE TRIGGER appointments_stock_consume AFTER INSERT OR UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.stock_consume_on_appointment();

-- Sessão registrada sem agendamento (Sessões): baixa também. Com agendamento, a baixa já veio da agenda.
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
  INSERT INTO public.stock_movements (clinic_id, cost_item_id, kind, quantity, session_record_id, created_by, notes)
  SELECT NEW.clinic_id, tci.cost_item_id, 'consumo', -tci.quantity, NEW.id, NULL, 'Baixa automática da sessão'
  FROM public.treatment_cost_items tci
  JOIN public.cost_items ci ON ci.id = tci.cost_item_id AND ci.clinic_id = NEW.clinic_id AND ci.type <> 'labor'
  WHERE tci.treatment_id = NEW.treatment_id AND tci.quantity > 0
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS session_records_stock_consume ON public.session_records;
CREATE TRIGGER session_records_stock_consume AFTER INSERT ON public.session_records
  FOR EACH ROW EXECUTE FUNCTION public.stock_consume_on_session();

REVOKE EXECUTE ON FUNCTION public.stock_update_average_cost() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stock_consume_on_appointment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stock_consume_on_session() FROM PUBLIC, anon, authenticated;

-- Admin liga/desliga "Gerencia estoque" de uma pessoa da equipe.
CREATE OR REPLACE FUNCTION public.set_stock_manager(p_clinic_id uuid, p_user_id uuid, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_clinic_role(auth.uid(), p_clinic_id, 'admin') THEN
    RAISE EXCEPTION 'Apenas o administrador define quem gerencia o estoque.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.user_roles SET can_manage_stock = p_enabled
  WHERE clinic_id = p_clinic_id AND user_id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_stock_manager(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_stock_manager(uuid, uuid, boolean) TO authenticated;

-- Tela Estoque no menu: grupos de acesso que já veem a Agenda passam a ver o Estoque.
INSERT INTO public.access_group_permissions (clinic_id, group_id, permission_key, can_view)
SELECT agp.clinic_id, agp.group_id, 'stock.view', true
FROM public.access_group_permissions agp
WHERE agp.permission_key = 'appointments.view' AND agp.can_view
  AND NOT EXISTS (
    SELECT 1 FROM public.access_group_permissions x
    WHERE x.group_id = agp.group_id AND x.permission_key = 'stock.view'
  );
