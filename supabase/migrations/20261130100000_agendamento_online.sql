-- Épico 21: agendamento feito pelo paciente.
-- 1) Link público de avaliação (/agendar/<slug da clínica>) para Instagram e site: cria o lead no CRM e marca a avaliação.
-- 2) No portal, o paciente marca a próxima sessão dos tratamentos do contrato dele.
-- Só funciona com "Agendamento online" ligado em Configurações > Atendimento.
-- Horários e marcação passam pela função agendamento-online (mesmo cálculo da agenda e da IA).

ALTER TABLE public.clinic_service_settings ADD COLUMN IF NOT EXISTS online_booking_enabled boolean NOT NULL DEFAULT false;

-- Dados públicos da página de agendamento (sem login).
CREATE OR REPLACE FUNCTION public.public_booking_page(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'ok', coalesce(s.online_booking_enabled, false) AND coalesce(s.offers_evaluation, true),
    'clinic', jsonb_build_object('name', c.name, 'logo_url', c.logo_url, 'primary_color', c.primary_color, 'phone', c.phone,
      'address', nullif(concat_ws(' - ', c.address, nullif(concat_ws('/', c.city, c.state), '')), '')),
    'evaluation', jsonb_build_object('minutes', coalesce(s.evaluation_minutes, 30), 'free', coalesce(s.evaluation_free, true), 'price', s.evaluation_price)
  )
  FROM public.clinics c
  LEFT JOIN public.clinic_service_settings s ON s.clinic_id = c.id
  WHERE c.slug = p_slug;
$$;
REVOKE EXECUTE ON FUNCTION public.public_booking_page(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_booking_page(text) TO anon, authenticated;
