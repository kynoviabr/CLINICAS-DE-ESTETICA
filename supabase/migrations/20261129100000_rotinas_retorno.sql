-- Épico 20: rotinas de retorno do paciente.
-- Listas automáticas de quem chamar: manutenção vencendo, pacote acabando, paciente sumido e aniversariantes.
-- A equipe chama pelo WhatsApp com mensagem pronta; o contato é registrado e o painel mostra quem voltou e a receita.

ALTER TABLE public.treatments ADD COLUMN IF NOT EXISTS maintenance_days integer CHECK (maintenance_days IS NULL OR maintenance_days BETWEEN 7 AND 730);
COMMENT ON COLUMN public.treatments.maintenance_days IS 'Dias até a manutenção recomendada (ex.: toxina 120). Vazio = sem rotina de manutenção.';

CREATE TABLE IF NOT EXISTS public.retention_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('maintenance', 'package_ending', 'inactive', 'birthday')),
  treatment_id uuid REFERENCES public.treatments(id) ON DELETE SET NULL,
  contacted_by uuid DEFAULT auth.uid(),
  contacted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS retention_contacts_clinic_idx ON public.retention_contacts (clinic_id, contacted_at DESC);
CREATE INDEX IF NOT EXISTS retention_contacts_patient_idx ON public.retention_contacts (patient_id, kind, contacted_at DESC);
ALTER TABLE public.retention_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff views retention contacts" ON public.retention_contacts;
CREATE POLICY "Staff views retention contacts" ON public.retention_contacts FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
DROP POLICY IF EXISTS "Staff records retention contacts" ON public.retention_contacts;
CREATE POLICY "Staff records retention contacts" ON public.retention_contacts FOR INSERT TO authenticated
  WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id) AND contacted_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = retention_contacts.clinic_id));

-- Quem chamar agora. Esconde quem já foi chamado (mesmo motivo) nos últimos 30 dias e quem já tem horário marcado.
CREATE OR REPLACE FUNCTION public.retention_lists(p_clinic_id uuid, p_inactive_days integer DEFAULT 60)
RETURNS TABLE (kind text, patient_id uuid, full_name text, phone text, treatment_id uuid, treatment_name text, reference_date date, detail text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT public.is_clinic_staff(auth.uid(), p_clinic_id) THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  WITH future AS (
    SELECT DISTINCT a.patient_id FROM public.appointments a
    WHERE a.clinic_id = p_clinic_id AND a.start_time > now() AND a.status IN ('scheduled', 'confirmed') AND a.patient_id IS NOT NULL
  ),
  recent AS (
    SELECT DISTINCT rc.patient_id, rc.kind FROM public.retention_contacts rc
    WHERE rc.clinic_id = p_clinic_id AND rc.contacted_at > now() - interval '30 days'
  ),
  done AS (
    SELECT a.patient_id, a.treatment_id, max((a.start_time AT TIME ZONE 'America/Sao_Paulo')::date) AS last_day
    FROM public.appointments a
    WHERE a.clinic_id = p_clinic_id AND a.status = 'completed' AND a.patient_id IS NOT NULL
    GROUP BY a.patient_id, a.treatment_id
  ),
  maintenance AS (
    SELECT 'maintenance'::text AS kind, d.patient_id, d.treatment_id, t.name AS treatment_name, (d.last_day + t.maintenance_days) AS ref
    FROM done d JOIN public.treatments t ON t.id = d.treatment_id
    WHERE t.maintenance_days IS NOT NULL AND (d.last_day + t.maintenance_days) BETWEEN v_today - 30 AND v_today + 14
  ),
  last_session AS (
    SELECT DISTINCT ON (s.patient_id, s.treatment_id) s.patient_id, s.treatment_id, s.session_number, s.total_sessions, (s.performed_at AT TIME ZONE 'America/Sao_Paulo')::date AS day
    FROM public.session_records s WHERE s.clinic_id = p_clinic_id
    ORDER BY s.patient_id, s.treatment_id, s.session_number DESC, s.performed_at DESC
  ),
  package AS (
    SELECT 'package_ending'::text, ls.patient_id, ls.treatment_id, t.name, ls.day
    FROM last_session ls LEFT JOIN public.treatments t ON t.id = ls.treatment_id
    WHERE ls.total_sessions > 1 AND ls.total_sessions - ls.session_number <= 1 AND ls.day > v_today - 120
  ),
  last_visit AS (
    SELECT d.patient_id, max(d.last_day) AS day FROM done d GROUP BY d.patient_id
  ),
  inactive AS (
    SELECT 'inactive'::text, lv.patient_id, NULL::uuid, NULL::text, lv.day
    FROM last_visit lv WHERE lv.day < v_today - greatest(coalesce(p_inactive_days, 60), 15) AND lv.day > v_today - 730
  ),
  birthday AS (
    SELECT 'birthday'::text, p.id, NULL::uuid, NULL::text,
      make_date(extract(year FROM v_today)::int + CASE WHEN to_char(p.date_of_birth, 'MMDD') < to_char(v_today, 'MMDD') THEN 1 ELSE 0 END,
                extract(month FROM p.date_of_birth)::int,
                CASE WHEN to_char(p.date_of_birth, 'MMDD') = '0229' THEN 28 ELSE extract(day FROM p.date_of_birth)::int END)
    FROM public.patients p
    WHERE p.clinic_id = p_clinic_id AND p.date_of_birth IS NOT NULL AND coalesce(p.status::text, 'active') <> 'inactive'
  ),
  all_rows AS (
    SELECT * FROM maintenance UNION ALL SELECT * FROM package UNION ALL SELECT * FROM inactive
    UNION ALL SELECT * FROM birthday b WHERE b.make_date BETWEEN v_today AND v_today + 7
  )
  SELECT r.kind, p.id, p.full_name, p.phone, r.treatment_id, r.treatment_name, r.ref,
    CASE r.kind
      WHEN 'maintenance' THEN format('Manutenção de %s %s em %s', r.treatment_name, CASE WHEN r.ref < v_today THEN 'venceu' ELSE 'vence' END, to_char(r.ref, 'DD/MM'))
      WHEN 'package_ending' THEN format('Pacote de %s no fim (última sessão em %s)', coalesce(r.treatment_name, 'tratamento'), to_char(r.ref, 'DD/MM'))
      WHEN 'inactive' THEN format('Última visita em %s (%s dias)', to_char(r.ref, 'DD/MM/YYYY'), v_today - r.ref)
      ELSE format('Aniversário em %s', to_char(r.ref, 'DD/MM'))
    END
  FROM all_rows r
  JOIN public.patients p ON p.id = r.patient_id AND p.clinic_id = p_clinic_id
  WHERE (r.kind = 'birthday' OR r.patient_id NOT IN (SELECT f.patient_id FROM future f))
    AND NOT EXISTS (SELECT 1 FROM recent x WHERE x.patient_id = r.patient_id AND x.kind = r.kind)
  ORDER BY r.kind, r.ref;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.retention_lists(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retention_lists(uuid, integer) TO authenticated;

-- Resultado das chamadas: quantos voltaram (marcaram em até 30 dias) e quanto venderam (propostas aceitas em até 30 dias).
CREATE OR REPLACE FUNCTION public.retention_results(p_clinic_id uuid, p_from date, p_to date)
RETURNS TABLE (kind text, contacted bigint, returned bigint, revenue numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_clinic_staff(auth.uid(), p_clinic_id) THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT rc.kind, count(*),
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.appointments a WHERE a.patient_id = rc.patient_id AND a.created_at BETWEEN rc.contacted_at AND rc.contacted_at + interval '30 days'
        AND a.status NOT IN ('cancelled'))),
    coalesce(sum((
      SELECT sum(pr.final_amount) FROM public.proposals pr WHERE pr.patient_id = rc.patient_id AND pr.status = 'accepted'
        AND pr.updated_at BETWEEN rc.contacted_at AND rc.contacted_at + interval '30 days')), 0)
  FROM public.retention_contacts rc
  WHERE rc.clinic_id = p_clinic_id AND (rc.contacted_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_from AND p_to
  GROUP BY rc.kind;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.retention_results(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retention_results(uuid, date, date) TO authenticated;
