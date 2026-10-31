-- Tenant isolation hardening (diagnóstico de 31/10/2026).
-- 1. v_renewal_tasks_active passa a respeitar o RLS de quem consulta.
-- 2. RPCs financeiras SECURITY DEFINER passam a exigir vínculo de staff com a clínica.
-- 3. Logos de clínica só podem ser gravados por admin da própria clínica.
-- 4. Helpers SECURITY DEFINER deixam de ser executáveis por anon.

-- 1. View
ALTER VIEW public.v_renewal_tasks_active SET (security_invoker = true);

-- 2. RPCs financeiras: implementação vai para o schema private (não exposto pela API)
--    e o schema public fica com um wrapper que valida o chamador.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.assert_clinic_staff(p_clinic_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN true;
  END IF;
  IF auth.uid() IS NULL OR p_clinic_id IS NULL OR NOT public.is_clinic_staff(auth.uid(), p_clinic_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION private.assert_contract_staff(p_contract_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  SELECT c.clinic_id INTO v_clinic_id FROM public.contracts c WHERE c.id = p_contract_id;
  RETURN private.assert_clinic_staff(v_clinic_id);
END;
$$;

REVOKE ALL ON FUNCTION private.assert_clinic_staff(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.assert_contract_staff(uuid) FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.backfill_contract_financial_forecast(uuid,boolean) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.backfill_contract_financial_forecast(uuid,boolean) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.backfill_contract_financial_forecast(p_clinic_id uuid, p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.backfill_contract_financial_forecast(p_clinic_id, p_force)
  FROM private.assert_clinic_staff(p_clinic_id) AS g;
$$;
REVOKE ALL ON FUNCTION public.backfill_contract_financial_forecast(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_contract_financial_forecast(uuid,boolean) TO authenticated, service_role;

ALTER FUNCTION public.get_finance_contract_forecast_detail(uuid) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.get_finance_contract_forecast_detail(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_finance_contract_forecast_detail(p_contract_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.get_finance_contract_forecast_detail(p_contract_id)
  FROM private.assert_contract_staff(p_contract_id) AS g;
$$;
REVOKE ALL ON FUNCTION public.get_finance_contract_forecast_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_contract_forecast_detail(uuid) TO authenticated, service_role;

ALTER FUNCTION public.get_finance_contract_sellers(uuid) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.get_finance_contract_sellers(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_finance_contract_sellers(p_clinic_id uuid)
RETURNS TABLE(seller_id uuid, seller_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.*
  FROM private.assert_clinic_staff(p_clinic_id) AS g, private.get_finance_contract_sellers(p_clinic_id) AS f;
$$;
REVOKE ALL ON FUNCTION public.get_finance_contract_sellers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_contract_sellers(uuid) TO authenticated, service_role;

ALTER FUNCTION public.get_finance_contracts_monthly_matrix(uuid,date,date,uuid,uuid,text,text,text) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.get_finance_contracts_monthly_matrix(uuid,date,date,uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_finance_contracts_monthly_matrix(p_clinic_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seller_id uuid DEFAULT NULL::uuid, p_treatment_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT NULL::text, p_contract_status text DEFAULT NULL::text, p_search text DEFAULT NULL::text)
RETURNS TABLE(contract_id uuid, contract_number text, patient_name text, patient_cpf text, seller_name text, treatments text, contract_total numeric, cash_total numeric, pix_total numeric, card_total numeric, boleto_total numeric, other_total numeric, jan_total numeric, feb_total numeric, mar_total numeric, apr_total numeric, may_total numeric, jun_total numeric, jul_total numeric, aug_total numeric, sep_total numeric, oct_total numeric, nov_total numeric, dec_total numeric, total_predicted numeric, has_financial_divergence boolean, divergence_reason text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.*
  FROM private.assert_clinic_staff(p_clinic_id) AS g, private.get_finance_contracts_monthly_matrix(p_clinic_id, p_start_date, p_end_date, p_seller_id, p_treatment_id, p_payment_method, p_contract_status, p_search) AS f;
$$;
REVOKE ALL ON FUNCTION public.get_finance_contracts_monthly_matrix(uuid,date,date,uuid,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_contracts_monthly_matrix(uuid,date,date,uuid,uuid,text,text,text) TO authenticated, service_role;

ALTER FUNCTION public.get_finance_contracts_monthly_matrix(uuid,date,date,integer,uuid,uuid,text,text,text) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.get_finance_contracts_monthly_matrix(uuid,date,date,integer,uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_finance_contracts_monthly_matrix(p_clinic_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_reference_year integer DEFAULT NULL::integer, p_seller_id uuid DEFAULT NULL::uuid, p_treatment_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT NULL::text, p_contract_status text DEFAULT NULL::text, p_search text DEFAULT NULL::text)
RETURNS TABLE(contract_id uuid, contract_number text, approval_date timestamp with time zone, patient_name text, patient_cpf text, seller_name text, seller_id uuid, treatments text, contract_total numeric, cash_total numeric, pix_total numeric, card_total numeric, boleto_total numeric, other_total numeric, jan_total numeric, feb_total numeric, mar_total numeric, apr_total numeric, may_total numeric, jun_total numeric, jul_total numeric, aug_total numeric, sep_total numeric, oct_total numeric, nov_total numeric, dec_total numeric, out_of_period_total numeric, total_predicted numeric, has_financial_divergence boolean, divergence_reason text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.*
  FROM private.assert_clinic_staff(p_clinic_id) AS g, private.get_finance_contracts_monthly_matrix(p_clinic_id, p_start_date, p_end_date, p_reference_year, p_seller_id, p_treatment_id, p_payment_method, p_contract_status, p_search) AS f;
$$;
REVOKE ALL ON FUNCTION public.get_finance_contracts_monthly_matrix(uuid,date,date,integer,uuid,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_contracts_monthly_matrix(uuid,date,date,integer,uuid,uuid,text,text,text) TO authenticated, service_role;

ALTER FUNCTION public.get_finance_contracts_prediction_summary(uuid,date,date,uuid,uuid,text,text,text) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.get_finance_contracts_prediction_summary(uuid,date,date,uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_finance_contracts_prediction_summary(p_clinic_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seller_id uuid DEFAULT NULL::uuid, p_treatment_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT NULL::text, p_contract_status text DEFAULT NULL::text, p_search text DEFAULT NULL::text)
RETURNS TABLE(total_contracts bigint, total_contract_value numeric, total_predicted_period numeric, cash_predicted numeric, pix_predicted numeric, card_predicted numeric, boleto_predicted numeric, other_predicted numeric, average_ticket numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.*
  FROM private.assert_clinic_staff(p_clinic_id) AS g, private.get_finance_contracts_prediction_summary(p_clinic_id, p_start_date, p_end_date, p_seller_id, p_treatment_id, p_payment_method, p_contract_status, p_search) AS f;
$$;
REVOKE ALL ON FUNCTION public.get_finance_contracts_prediction_summary(uuid,date,date,uuid,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_contracts_prediction_summary(uuid,date,date,uuid,uuid,text,text,text) TO authenticated, service_role;

ALTER FUNCTION public.get_finance_contracts_prediction_summary(uuid,date,date,integer,uuid,uuid,text,text,text) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.get_finance_contracts_prediction_summary(uuid,date,date,integer,uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_finance_contracts_prediction_summary(p_clinic_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_reference_year integer DEFAULT NULL::integer, p_seller_id uuid DEFAULT NULL::uuid, p_treatment_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT NULL::text, p_contract_status text DEFAULT NULL::text, p_search text DEFAULT NULL::text)
RETURNS TABLE(total_contracts bigint, total_contract_value numeric, total_predicted_period numeric, cash_predicted numeric, pix_predicted numeric, card_predicted numeric, boleto_predicted numeric, other_predicted numeric, average_ticket numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.*
  FROM private.assert_clinic_staff(p_clinic_id) AS g, private.get_finance_contracts_prediction_summary(p_clinic_id, p_start_date, p_end_date, p_reference_year, p_seller_id, p_treatment_id, p_payment_method, p_contract_status, p_search) AS f;
$$;
REVOKE ALL ON FUNCTION public.get_finance_contracts_prediction_summary(uuid,date,date,integer,uuid,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_contracts_prediction_summary(uuid,date,date,integer,uuid,uuid,text,text,text) TO authenticated, service_role;

ALTER FUNCTION public.upsert_contract_financial_forecast(uuid,boolean) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.upsert_contract_financial_forecast(uuid,boolean) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.upsert_contract_financial_forecast(p_contract_id uuid, p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.upsert_contract_financial_forecast(p_contract_id, p_force)
  FROM private.assert_contract_staff(p_contract_id) AS g;
$$;
REVOKE ALL ON FUNCTION public.upsert_contract_financial_forecast(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_contract_financial_forecast(uuid,boolean) TO authenticated, service_role;

-- Rotinas internas: só service_role.
REVOKE ALL ON FUNCTION public.renewal_tasks_daily_maintenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renewal_tasks_daily_maintenance() TO service_role;

-- Helpers sem uso em policies nem no app: não expor.
REVOKE ALL ON FUNCTION public.get_user_clinic_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_clinic_ids(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

-- 4. Helpers usados por policies: authenticated e service_role, nunca anon.
DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN (
        'is_clinic_staff', 'has_clinic_role', 'user_belongs_to_clinic', 'has_menu_access',
        'get_patient_ids_for_user', 'get_patient_clinic_id', 'auth_clinic_id', 'auth_patient_id',
        'auth_user_role'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END;
$$;

-- 3. Logos: caminho "<clinic_id>/logo.<ext>", gravação só por admin da clínica.
DROP POLICY IF EXISTS "Admin uploads clinic logos" ON storage.objects;
DROP POLICY IF EXISTS "Admin updates clinic logos" ON storage.objects;

CREATE POLICY "Admin uploads clinic logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'clinic-logos'
  AND public.has_clinic_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'admin')
);

CREATE POLICY "Admin updates clinic logos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'clinic-logos'
  AND public.has_clinic_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'admin')
)
WITH CHECK (
  bucket_id = 'clinic-logos'
  AND public.has_clinic_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'admin')
);
