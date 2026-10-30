\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;
CREATE FUNCTION pg_temp.expect_error(sql_text text, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE sql_text;
  EXCEPTION WHEN insufficient_privilege OR raise_exception OR unique_violation THEN RAISE NOTICE 'PASS: %', msg; RETURN;
  END;
  RAISE EXCEPTION 'ASSERT: expected error: %', msg;
END $$;

INSERT INTO auth.users(id,email) VALUES
('10000000-0000-0000-0000-000000000001','admin-a@test'),('10000000-0000-0000-0000-000000000002','staff-a@test'),
('10000000-0000-0000-0000-000000000003','admin-b@test'),('10000000-0000-0000-0000-000000000004','patient-a@test'),
('10000000-0000-0000-0000-000000000005','patient-a2@test'),('10000000-0000-0000-0000-000000000006','patient-b@test'),
('10000000-0000-0000-0000-000000000007','unlinked@test');
INSERT INTO public.clinics(id,name,slug) VALUES
('20000000-0000-0000-0000-000000000001','TEST A','contract-test-a'),('20000000-0000-0000-0000-000000000002','TEST B','contract-test-b');
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','admin',true),
('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','receptionist',true),
('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','admin',true);
INSERT INTO public.patients(id,clinic_id,full_name) VALUES
('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','A1'),
('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','A2'),
('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','B1');
INSERT INTO public.patient_users(clinic_id,patient_id,auth_user_id,status) VALUES
('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','active'),
('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000005','active'),
('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000006','active');

SELECT public.provision_initial_contract_template('20000000-0000-0000-0000-000000000001');
SELECT public.provision_initial_contract_template('20000000-0000-0000-0000-000000000001');
SELECT public.provision_initial_contract_template('20000000-0000-0000-0000-000000000002');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.contract_templates WHERE clinic_id='20000000-0000-0000-0000-000000000001'),'provision is idempotent');
UPDATE public.contract_templates SET status='active' WHERE clinic_id IN ('20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002');
INSERT INTO public.contract_templates(id,clinic_id,name,version,status,title,content_html) VALUES
('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','A2',2,'draft','Draft','<p>x</p>'),
('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','B2',2,'draft','Draft','<p>x</p>');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.contract_templates),'admin sees own active and draft');
SELECT pg_temp.expect_error($q$INSERT INTO public.contract_templates(clinic_id,name,version,status,title,content_html) VALUES('20000000-0000-0000-0000-000000000002','x',9,'draft','x','x')$q$,'admin cannot insert cross tenant');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.contract_templates),'staff sees only active own template');
SELECT pg_temp.expect_error($q$INSERT INTO public.contract_templates(clinic_id,name,version,status,title,content_html) VALUES('20000000-0000-0000-0000-000000000001','x',9,'draft','x','x')$q$,'staff cannot create template');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.contract_templates),'patient sees no templates');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000007',true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.contract_templates),'unlinked user sees no templates');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.expect_error($q$SELECT public.duplicate_contract_template('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002')$q$,'cross tenant duplicate denied');
SELECT public.activate_contract_template('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.contract_templates WHERE clinic_id='20000000-0000-0000-0000-000000000001' AND status='active'),'one active template');

INSERT INTO public.contracts(id,clinic_id,patient_id,contract_number,status,template_html) VALUES
('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','DRAFT','draft','draft');
UPDATE public.contracts SET template_html='changed' WHERE id='50000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT template_html='changed' FROM public.contracts WHERE id='50000000-0000-0000-0000-000000000001'),'draft mutable');
INSERT INTO public.contracts(id,clinic_id,patient_id,contract_number,status,template_html,contract_template_id,contract_template_version,template_snapshot_html,contract_data_snapshot,generated_at,generated_by,document_hash,pdf_storage_path,issuance_key) VALUES
('50000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','ISSUED','active','issued','40000000-0000-0000-0000-000000000002',2,'issued','{"origin":"test"}',now(),'10000000-0000-0000-0000-000000000001','hash','20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/a.pdf','proposal:test');
SELECT pg_temp.expect_error($q$UPDATE public.contracts SET document_hash='bad' WHERE id='50000000-0000-0000-0000-000000000002'$q$,'issued hash immutable');
SELECT pg_temp.expect_error($q$UPDATE public.contracts SET patient_id='30000000-0000-0000-0000-000000000002' WHERE id='50000000-0000-0000-0000-000000000002'$q$,'issued party immutable');
UPDATE public.contracts SET signed_pdf_url='signed.pdf',signed_at=now(),process_status='pending_confirmation' WHERE id='50000000-0000-0000-0000-000000000002';
SELECT pg_temp.assert_true((SELECT signed_at IS NOT NULL FROM public.contracts WHERE id='50000000-0000-0000-0000-000000000002'),'signature status remains mutable');
SELECT pg_temp.expect_error($q$INSERT INTO public.contracts(clinic_id,patient_id,contract_number,issuance_key) VALUES('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','DUP','proposal:test')$q$,'same tenant issuance duplicate rejected');
INSERT INTO public.contracts(clinic_id,patient_id,contract_number,issuance_key) VALUES('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003','OTHER','proposal:test');

INSERT INTO storage.objects(bucket_id,name) VALUES
('contracts','20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/a.pdf'),
('contracts','20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000002/a2.pdf'),
('contracts','20000000-0000-0000-0000-000000000002/30000000-0000-0000-0000-000000000003/b.pdf');
SELECT pg_temp.assert_true((SELECT public=false FROM storage.buckets WHERE id='contracts'),'contracts bucket private');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM storage.objects WHERE bucket_id='contracts'),'staff reads own clinic objects');
SELECT pg_temp.expect_error($q$INSERT INTO storage.objects(bucket_id,name) VALUES('contracts','20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000003/cross.pdf')$q$,'cross tenant patient path denied');
SELECT pg_temp.expect_error($q$DELETE FROM storage.objects WHERE bucket_id='contracts'$q$,'non-admin delete denied');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM storage.objects WHERE bucket_id='contracts'),'patient reads only own object');
SELECT pg_temp.expect_error($q$INSERT INTO storage.objects(bucket_id,name) VALUES('contracts','20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/p.pdf')$q$,'patient upload denied');
RESET ROLE;

ROLLBACK;
