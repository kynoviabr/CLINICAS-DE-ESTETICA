-- Estrutura do atendimento da clínica (usada pela agenda, pela equipe e pela IA da Aura).
-- Antes: texto livre ("seg a sex 9h às 19h"). Agora: dados organizados que o sistema confere.
--   - Horário de funcionamento da clínica (diferente da disponibilidade de cada profissional).
--   - Dias fechados (feriados, recesso).
--   - Pagamento, estacionamento, planos/convênios, avaliação e regras de agenda.
--   - Por tratamento: como falar o preço, se exige avaliação antes e se a IA pode agendar.
--   - Por profissional: mostrar ou não o nome ao cliente.

-- ---------- Horário de funcionamento (pode ter mais de um intervalo no dia, ex.: pausa para almoço) ----------
CREATE TABLE public.clinic_business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = domingo
  opens_at time NOT NULL,
  closes_at time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at)
);
CREATE INDEX clinic_business_hours_clinic_idx ON public.clinic_business_hours (clinic_id, day_of_week);

-- ---------- Dias fechados ----------
CREATE TABLE public.clinic_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  closed_on date NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, closed_on)
);

-- ---------- Regras e informações do atendimento (uma linha por clínica) ----------
CREATE TABLE public.clinic_service_settings (
  clinic_id uuid PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  -- Pagamento
  payment_methods text[] NOT NULL DEFAULT '{}'
    CHECK (payment_methods <@ ARRAY['pix', 'debito', 'credito', 'dinheiro', 'boleto', 'transferencia']::text[]),
  max_installments smallint CHECK (max_installments BETWEEN 1 AND 24),
  installments_min_value numeric(12, 2) CHECK (installments_min_value >= 0),
  payment_notes text,
  -- Estacionamento
  parking text NOT NULL DEFAULT 'unknown' CHECK (parking IN ('unknown', 'none', 'free', 'paid', 'partner')),
  parking_notes text,
  -- Planos e convênios (informativo)
  accepts_insurance boolean NOT NULL DEFAULT false,
  insurance_plans text[] NOT NULL DEFAULT '{}',
  insurance_notes text,
  -- Avaliação
  offers_evaluation boolean NOT NULL DEFAULT true,
  evaluation_free boolean NOT NULL DEFAULT true,
  evaluation_minutes smallint NOT NULL DEFAULT 30 CHECK (evaluation_minutes BETWEEN 10 AND 240),
  evaluation_price numeric(12, 2) CHECK (evaluation_price >= 0),
  -- Regras de agenda
  min_notice_minutes integer NOT NULL DEFAULT 60 CHECK (min_notice_minutes BETWEEN 0 AND 10080),
  booking_horizon_days smallint NOT NULL DEFAULT 30 CHECK (booking_horizon_days BETWEEN 1 AND 365),
  buffer_minutes smallint NOT NULL DEFAULT 0 CHECK (buffer_minutes BETWEEN 0 AND 120),
  reschedule_notice_hours smallint CHECK (reschedule_notice_hours BETWEEN 0 AND 720),
  -- Como a IA fala de preço quando o tratamento não define
  price_display text NOT NULL DEFAULT 'exact' CHECK (price_display IN ('exact', 'from', 'hidden')),
  -- Texto livre só para o que não cabe nos campos
  policies text,
  notes text,
  faq jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(faq) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- ---------- Tratamentos e profissionais ----------
ALTER TABLE public.treatments
  ADD COLUMN price_display text CHECK (price_display IN ('exact', 'from', 'hidden')), -- vazio = padrão da clínica
  ADD COLUMN requires_evaluation boolean NOT NULL DEFAULT false,
  ADD COLUMN ai_bookable boolean NOT NULL DEFAULT true;

ALTER TABLE public.professionals
  ADD COLUMN show_name_to_clients boolean NOT NULL DEFAULT true;

-- ---------- Acesso: equipe lê, administrador altera ----------
ALTER TABLE public.clinic_business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_service_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff views business hours" ON public.clinic_business_hours FOR SELECT TO authenticated USING (is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Admin manages business hours" ON public.clinic_business_hours FOR ALL TO authenticated
  USING (has_clinic_role(auth.uid(), clinic_id, 'admin')) WITH CHECK (has_clinic_role(auth.uid(), clinic_id, 'admin'));

CREATE POLICY "Staff views closures" ON public.clinic_closures FOR SELECT TO authenticated USING (is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Admin manages closures" ON public.clinic_closures FOR ALL TO authenticated
  USING (has_clinic_role(auth.uid(), clinic_id, 'admin')) WITH CHECK (has_clinic_role(auth.uid(), clinic_id, 'admin'));

CREATE POLICY "Staff views service settings" ON public.clinic_service_settings FOR SELECT TO authenticated USING (is_clinic_staff(auth.uid(), clinic_id));
CREATE POLICY "Admin manages service settings" ON public.clinic_service_settings FOR ALL TO authenticated
  USING (has_clinic_role(auth.uid(), clinic_id, 'admin')) WITH CHECK (has_clinic_role(auth.uid(), clinic_id, 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_business_hours, public.clinic_closures, public.clinic_service_settings TO authenticated;
GRANT ALL ON public.clinic_business_hours, public.clinic_closures, public.clinic_service_settings TO service_role;

-- ---------- Aproveita o que a clínica já preencheu em "Informações para a IA" (texto livre) ----------
INSERT INTO public.clinic_service_settings (clinic_id, payment_notes, parking_notes, policies, notes, faq, price_display)
SELECT s.clinic_id,
  nullif(trim(j ->> 'payment'), ''),
  nullif(trim(j ->> 'parking'), ''),
  nullif(trim(concat_ws(E'\n', nullif(trim(j ->> 'policies'), ''),
    CASE WHEN nullif(trim(j ->> 'hours'), '') IS NOT NULL THEN 'Horário informado antes: ' || trim(j ->> 'hours') END)), ''),
  nullif(trim(j ->> 'notes'), ''),
  CASE WHEN jsonb_typeof(j -> 'faq') = 'array' THEN j -> 'faq' ELSE '[]'::jsonb END,
  CASE WHEN j ->> 'priceDisplay' IN ('exact', 'from', 'hidden') THEN j ->> 'priceDisplay' ELSE 'exact' END
FROM public.clinic_settings s
CROSS JOIN LATERAL (SELECT CASE WHEN s.value ~ '^\s*\{' THEN s.value::jsonb ELSE '{}'::jsonb END AS j) x
WHERE s.key = 'aura_info'
ON CONFLICT (clinic_id) DO NOTHING;

UPDATE public.treatments t SET price_display = o.value
FROM public.clinic_settings s
CROSS JOIN LATERAL jsonb_each_text(CASE WHEN s.value ~ '^\s*\{' THEN coalesce(s.value::jsonb -> 'priceOverrides', '{}'::jsonb) ELSE '{}'::jsonb END) o
WHERE s.key = 'aura_info' AND t.clinic_id = s.clinic_id AND t.id::text = o.key AND o.value IN ('exact', 'from', 'hidden');

-- Horário da clínica inicial = união da disponibilidade dos profissionais (a clínica ajusta depois na tela).
INSERT INTO public.clinic_business_hours (clinic_id, day_of_week, opens_at, closes_at)
SELECT clinic_id, day_of_week, min(start_time), max(end_time)
FROM public.professional_availability
WHERE is_active
GROUP BY clinic_id, day_of_week
HAVING max(end_time) > min(start_time);
