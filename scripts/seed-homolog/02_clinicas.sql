-- Seed de testes da HOMOLOG: duas clínicas independentes com equipe,
-- 10 tratamentos, 10 clientes em fases diferentes e metas de venda.
-- Depende da tabela temporária seed_staff criada em 01_equipe.sql.
-- Pode rodar de novo: apaga e recria só os dados das duas clínicas de teste.

CREATE OR REPLACE FUNCTION pg_temp.sid(_key text) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT md5('clinova-seed-homolog:' || _key)::uuid $$;

CREATE OR REPLACE FUNCTION pg_temp.staff(_clinic int, _role text, _n int) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT u.id
  FROM (
    SELECT s.email, row_number() OVER (ORDER BY s.ctid) AS n
    FROM seed_staff s
    WHERE s.clinic_no = _clinic AND s.role::text = _role
  ) s
  JOIN auth.users u ON lower(u.email) = lower(s.email)
  WHERE s.n = _n
$$;

DO $$
DECLARE
  c int;
  v_clinic uuid;
  v_ids uuid[] := ARRAY[pg_temp.sid('clinic:1'), pg_temp.sid('clinic:2')];
  r record;
  v_user uuid;
  v_skipped text := '';
  v_cat_facial uuid; v_cat_inj uuid; v_cat_corp uuid; v_cat_laser uuid;
  t uuid[];
  p uuid[];
  v_prefix text;
  v_names text[];
  v_v1 uuid; v_v2 uuid; v_v3 uuid;
  v_e1 uuid; v_e2 uuid; v_e3 uuid; v_e4 uuid; v_e5 uuid;
  v_rec uuid; v_gestora uuid;
  v_today date := current_date;
  i int;
  v_contract uuid;
  v_appt uuid;
  v_sess uuid;
BEGIN
  -- 1. Limpeza das duas clínicas de teste (re-execução).
  UPDATE public.contract_installments
     SET status = 'cancelado', paid_at = NULL, paid_amount = NULL, paid_method = NULL
   WHERE clinic_id = ANY (v_ids) AND status = 'pago';
  DELETE FROM public.session_feedback WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.session_records WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.renewal_tasks WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.notifications WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.leads WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.appointments WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.contract_installments WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.contract_payment_methods WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.contract_payment_plans WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.contracts WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.proposals WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.patient_anamneses WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.patients WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.payers WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.sales_goals WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.professional_treatments WHERE professional_id IN (SELECT id FROM public.professionals WHERE clinic_id = ANY (v_ids));
  DELETE FROM public.treatments WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.treatment_categories WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.professionals WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.contract_templates WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.clinic_settings WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.audit_logs WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.user_roles WHERE clinic_id = ANY (v_ids);
  DELETE FROM public.clinics WHERE id = ANY (v_ids);

  FOR c IN 1..2 LOOP
    v_clinic := v_ids[c];
    v_prefix := 'C' || c;

    -- 2. Clínica
    INSERT INTO public.clinics (id, name, slug, phone, email, city, state, is_active, status)
    VALUES (
      v_clinic,
      CASE c WHEN 1 THEN 'Vive Estética (teste)' ELSE 'Eras Estética (teste)' END,
      CASE c WHEN 1 THEN 'teste-vive-estetica' ELSE 'teste-eras-estetica' END,
      CASE c WHEN 1 THEN '11930000001' ELSE '11930000002' END,
      CASE c WHEN 1 THEN 'viveesaude@gmail.com' ELSE 'erascosmeticos@gmail.com' END,
      'São Paulo', 'SP', true, 'active'
    );
    PERFORM public.provision_initial_contract_template(v_clinic);

    -- 3. Equipe: perfil de acesso + cadastro de profissional (nome na agenda e no CRM)
    FOR r IN
      SELECT s.*, u.id AS user_id
      FROM seed_staff s JOIN auth.users u ON lower(u.email) = lower(s.email)
      WHERE s.clinic_no = c
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = r.user_id AND is_active AND clinic_id <> ALL (v_ids)
      ) THEN
        v_skipped := v_skipped || ' ' || r.email;
        CONTINUE;
      END IF;

      INSERT INTO public.user_roles (user_id, clinic_id, role, is_active)
      VALUES (r.user_id, v_clinic, r.role, true);

      INSERT INTO public.professionals (id, clinic_id, user_id, full_name, email, phone, specialty, status)
      VALUES (pg_temp.sid('prof:' || r.email), v_clinic, r.user_id, r.full_name, lower(r.email), NULL, COALESCE(r.specialty, r.cargo), 'active');
    END LOOP;

    v_gestora := pg_temp.staff(c, 'admin', 2);
    v_v1 := pg_temp.staff(c, 'sales', 1);
    v_v2 := pg_temp.staff(c, 'sales', 2);
    v_v3 := pg_temp.staff(c, 'sales', 3);
    v_e1 := pg_temp.staff(c, 'professional', 1);
    v_e2 := pg_temp.staff(c, 'professional', 2);
    v_e3 := pg_temp.staff(c, 'professional', 3);
    v_e4 := pg_temp.staff(c, 'professional', 4);
    v_e5 := pg_temp.staff(c, 'professional', 5);
    v_rec := pg_temp.staff(c, 'receptionist', 1);

    -- 4. Categorias e 10 tratamentos padrão
    v_cat_facial := pg_temp.sid(v_prefix || ':cat:facial');
    v_cat_inj := pg_temp.sid(v_prefix || ':cat:injetaveis');
    v_cat_corp := pg_temp.sid(v_prefix || ':cat:corporal');
    v_cat_laser := pg_temp.sid(v_prefix || ':cat:laser');
    INSERT INTO public.treatment_categories (id, clinic_id, name, status, description) VALUES
      (v_cat_facial, v_clinic, 'Facial', 'active', 'Cuidados e procedimentos faciais.'),
      (v_cat_inj, v_clinic, 'Injetáveis', 'active', 'Toxina, preenchimentos e bioestimuladores.'),
      (v_cat_corp, v_clinic, 'Corporal', 'active', 'Protocolos corporais.'),
      (v_cat_laser, v_clinic, 'Laser', 'active', 'Depilação e tecnologias a laser.');

    t := ARRAY(SELECT pg_temp.sid(v_prefix || ':trat:' || n) FROM generate_series(1, 10) n);
    INSERT INTO public.treatments (id, clinic_id, name, description, duration_minutes, num_sessions, price, default_price, min_price, cost, category, category_id, is_active) VALUES
      (t[1],  v_clinic, 'Limpeza de Pele Profunda', 'Higienização, extração e máscara calmante.', 60, 1, 250, 250, 210, 60, 'Facial', v_cat_facial, true),
      (t[2],  v_clinic, 'Peeling Químico (3 sessões)', 'Renovação celular para manchas e textura.', 45, 3, 900, 900, 765, 220, 'Facial', v_cat_facial, true),
      (t[3],  v_clinic, 'Microagulhamento (3 sessões)', 'Estímulo de colágeno para cicatrizes e poros.', 60, 3, 1500, 1500, 1275, 380, 'Facial', v_cat_facial, true),
      (t[4],  v_clinic, 'Toxina Botulínica', 'Aplicação para linhas de expressão.', 45, 1, 1800, 1800, 1530, 450, 'Injetáveis', v_cat_inj, true),
      (t[5],  v_clinic, 'Preenchimento Labial', 'Ácido hialurônico para contorno e volume.', 60, 1, 1600, 1600, 1360, 420, 'Injetáveis', v_cat_inj, true),
      (t[6],  v_clinic, 'Bioestimulador de Colágeno (2 sessões)', 'Firmeza e qualidade da pele.', 60, 2, 3200, 3200, 2720, 900, 'Injetáveis', v_cat_inj, true),
      (t[7],  v_clinic, 'Drenagem Linfática (10 sessões)', 'Pacote de drenagem manual.', 60, 10, 1200, 1200, 1020, 300, 'Corporal', v_cat_corp, true),
      (t[8],  v_clinic, 'Criolipólise', 'Redução de gordura localizada por resfriamento.', 60, 1, 1400, 1400, 1190, 350, 'Corporal', v_cat_corp, true),
      (t[9],  v_clinic, 'Radiofrequência Corporal (8 sessões)', 'Firmeza e combate à flacidez.', 50, 8, 2000, 2000, 1700, 500, 'Corporal', v_cat_corp, true),
      (t[10], v_clinic, 'Depilação a Laser - Pernas (10 sessões)', 'Pacote de laser para pernas inteiras.', 40, 10, 2500, 2500, 2125, 600, 'Laser', v_cat_laser, true);

    -- 5. Metas do mês para cada vendedor
    INSERT INTO public.sales_goals (id, clinic_id, user_id, period_type, period_reference, goal_amount, goal_type, goal_name, status, created_by)
    SELECT pg_temp.sid(v_prefix || ':meta:' || s.n), v_clinic, s.uid, 'monthly', to_char(v_today, 'YYYY-MM'), 15000, 'user', 'Meta do mês', 'active', v_gestora
    FROM (VALUES (1, v_v1), (2, v_v2), (3, v_v3)) AS s(n, uid)
    WHERE s.uid IS NOT NULL;

    -- 6. Dez clientes em fases diferentes
    v_names := CASE c
      WHEN 1 THEN ARRAY['Aline Barros','Bianca Torres','Cecília Nogueira','Débora Cardoso','Eduarda Pinto','Flávia Monteiro','Gabriela Reis','Heloísa Campos','Isabela Fontes','Joana Vieira']
      ELSE ARRAY['Kátia Lopes','Letícia Brandão','Marina Queiroz','Nicole Azevedo','Paula Siqueira','Renata Dias','Sabrina Coelho','Tatiane Ramos','Vanessa Lacerda','Yasmin Oliveira']
    END;
    p := ARRAY(SELECT pg_temp.sid(v_prefix || ':paciente:' || n) FROM generate_series(1, 10) n);

    -- Clientes 4 a 10 já são pacientes cadastrados.
    FOR i IN 4..10 LOOP
      INSERT INTO public.patients (id, clinic_id, full_name, email, phone, cpf, date_of_birth, gender, city, state, status, is_self_payer, notes)
      VALUES (
        p[i], v_clinic, v_names[i],
        lower(replace(translate(v_names[i], 'áâãéêíóôõúçÁÉÍÓÚ', 'aaaeeiooouCAEIOU'), ' ', '.')) || '.c' || c || '@exemplo.com.br',
        '119' || lpad((c * 100 + i)::text, 8, '0'),
        NULL,
        (DATE '1985-01-15' + (i * 400 + c * 37)),
        'female', 'São Paulo', 'SP',
        (CASE i WHEN 4 THEN 'pending' WHEN 8 THEN 'completed' ELSE 'active' END)::public.patient_status,
        true,
        'Cliente de teste (seed homolog).'
      );
    END LOOP;

    -- Leads do CRM (um por cliente, cada um numa fase)
    INSERT INTO public.leads (id, clinic_id, full_name, phone, email, kanban_stage, assigned_to, source, treatments_of_interest, notes, lost_reason, patient_id, priority_level, next_action, next_action_at, created_by, created_at, stage_changed_at, converted_at)
    VALUES
      (pg_temp.sid(v_prefix || ':lead:1'), v_clinic, v_names[1], '119' || lpad((c*100+1)::text, 8, '0'), NULL, 'new_lead', v_v1, 'instagram', ARRAY['Limpeza de Pele Profunda'], 'Chegou pelo Instagram, ainda sem contato.', NULL, NULL, 'medium', 'Fazer primeiro contato', now() + interval '2 hours', v_rec, now() - interval '3 hours', now() - interval '3 hours', NULL),
      (pg_temp.sid(v_prefix || ':lead:2'), v_clinic, v_names[2], '119' || lpad((c*100+2)::text, 8, '0'), NULL, 'contacted', v_v2, 'whatsapp', ARRAY['Toxina Botulínica'], 'Pediu valores pelo WhatsApp.', NULL, NULL, 'high', 'Enviar valores e agendar avaliação', now() + interval '1 day', v_v2, now() - interval '2 days', now() - interval '1 day', NULL),
      (pg_temp.sid(v_prefix || ':lead:3'), v_clinic, v_names[3], '119' || lpad((c*100+3)::text, 8, '0'), NULL, 'scheduled', v_v3, 'indicacao', ARRAY['Criolipólise'], 'Avaliação marcada.', NULL, NULL, 'medium', 'Confirmar presença na avaliação', now() + interval '1 day', v_v3, now() - interval '5 days', now() - interval '2 days', NULL),
      (pg_temp.sid(v_prefix || ':lead:4'), v_clinic, v_names[4], '119' || lpad((c*100+4)::text, 8, '0'), NULL, 'proposal_sent', v_v1, 'google', ARRAY['Microagulhamento (3 sessões)'], 'Proposta enviada, aguardando retorno.', NULL, p[4], 'high', 'Cobrar retorno da proposta', now() + interval '2 days', v_v1, now() - interval '10 days', now() - interval '3 days', NULL),
      (pg_temp.sid(v_prefix || ':lead:5'), v_clinic, v_names[5], '119' || lpad((c*100+5)::text, 8, '0'), NULL, 'closed_lost', v_v2, 'instagram', ARRAY['Preenchimento Labial'], 'Achou o valor alto.', 'Preço acima do orçamento', NULL, 'low', NULL, NULL, v_v2, now() - interval '20 days', now() - interval '12 days', NULL),
      (pg_temp.sid(v_prefix || ':lead:6'), v_clinic, v_names[6], '119' || lpad((c*100+6)::text, 8, '0'), NULL, 'closed_won', v_v3, 'whatsapp', ARRAY['Toxina Botulínica'], 'Fechou após avaliação.', NULL, p[6], 'medium', NULL, NULL, v_v3, now() - interval '8 days', now() - interval '2 days', now() - interval '2 days'),
      (pg_temp.sid(v_prefix || ':lead:7'), v_clinic, v_names[7], '119' || lpad((c*100+7)::text, 8, '0'), NULL, 'closed_won', v_v1, 'indicacao', ARRAY['Radiofrequência Corporal (8 sessões)'], 'Em tratamento.', NULL, p[7], 'medium', NULL, NULL, v_v1, now() - interval '50 days', now() - interval '40 days', now() - interval '40 days'),
      (pg_temp.sid(v_prefix || ':lead:8'), v_clinic, v_names[8], '119' || lpad((c*100+8)::text, 8, '0'), NULL, 'closed_won', v_v2, 'google', ARRAY['Peeling Químico (3 sessões)'], 'Tratamento concluído.', NULL, p[8], 'low', NULL, NULL, v_v2, now() - interval '100 days', now() - interval '90 days', now() - interval '90 days'),
      (pg_temp.sid(v_prefix || ':lead:9'), v_clinic, v_names[9], '119' || lpad((c*100+9)::text, 8, '0'), NULL, 'closed_won', v_v3, 'instagram', ARRAY['Drenagem Linfática (10 sessões)'], 'Parcela em atraso.', NULL, p[9], 'high', NULL, NULL, v_v3, now() - interval '60 days', now() - interval '50 days', now() - interval '50 days'),
      (pg_temp.sid(v_prefix || ':lead:10'), v_clinic, v_names[10], '119' || lpad((c*100+10)::text, 8, '0'), NULL, 'closed_won', v_v1, 'whatsapp', ARRAY['Criolipólise'], 'Cliente insatisfeita após a sessão.', NULL, p[10], 'high', NULL, NULL, v_v1, now() - interval '30 days', now() - interval '20 days', now() - interval '20 days');

    -- Cliente 3: avaliação agendada (ainda é lead)
    v_appt := pg_temp.sid(v_prefix || ':agenda:3');
    INSERT INTO public.appointments (id, clinic_id, patient_id, lead_id, professional_id, treatment_id, start_time, end_time, status, appointment_type, notes, created_by)
    VALUES (v_appt, v_clinic, NULL, pg_temp.sid(v_prefix || ':lead:3'), v_e2, t[8], date_trunc('hour', now()) + interval '2 days 10 hours', date_trunc('hour', now()) + interval '2 days 11 hours', 'scheduled', 'evaluation', 'Avaliação de criolipólise.', v_rec);
    UPDATE public.leads SET appointment_id = v_appt WHERE id = pg_temp.sid(v_prefix || ':lead:3');

    -- Propostas (4 enviada; 6 a 10 aprovadas)
    INSERT INTO public.proposals (id, clinic_id, patient_id, proposal_number, status, total_amount, discount_percent, discount_amount, final_amount, valid_until, notes, created_by, created_at)
    VALUES
      (pg_temp.sid(v_prefix || ':prop:4'),  v_clinic, p[4],  'PROP-' || v_prefix || '-0004', 'sent',     1500, 0, 0, 1500, v_today + 10, 'Proposta enviada.', v_v1, now() - interval '3 days'),
      (pg_temp.sid(v_prefix || ':prop:6'),  v_clinic, p[6],  'PROP-' || v_prefix || '-0006', 'accepted', 1800, 0, 0, 1800, v_today + 5,  'Aprovada na avaliação.', v_v3, now() - interval '3 days'),
      (pg_temp.sid(v_prefix || ':prop:7'),  v_clinic, p[7],  'PROP-' || v_prefix || '-0007', 'accepted', 2000, 0, 0, 2000, v_today - 30, 'Pacote corporal.', v_v1, now() - interval '41 days'),
      (pg_temp.sid(v_prefix || ':prop:8'),  v_clinic, p[8],  'PROP-' || v_prefix || '-0008', 'accepted', 900,  0, 0, 900,  v_today - 80, 'Peeling em 3 sessões.', v_v2, now() - interval '91 days'),
      (pg_temp.sid(v_prefix || ':prop:9'),  v_clinic, p[9],  'PROP-' || v_prefix || '-0009', 'accepted', 1200, 0, 0, 1200, v_today - 40, 'Drenagem 10 sessões no boleto.', v_v3, now() - interval '51 days'),
      (pg_temp.sid(v_prefix || ':prop:10'), v_clinic, p[10], 'PROP-' || v_prefix || '-0010', 'accepted', 1400, 0, 0, 1400, v_today - 10, 'Criolipólise à vista.', v_v1, now() - interval '21 days');

    INSERT INTO public.proposal_items (proposal_id, treatment_id, quantity, unit_price, subtotal) VALUES
      (pg_temp.sid(v_prefix || ':prop:4'),  t[3],  1, 1500, 1500),
      (pg_temp.sid(v_prefix || ':prop:6'),  t[4],  1, 1800, 1800),
      (pg_temp.sid(v_prefix || ':prop:7'),  t[9],  1, 2000, 2000),
      (pg_temp.sid(v_prefix || ':prop:8'),  t[2],  1, 900,  900),
      (pg_temp.sid(v_prefix || ':prop:9'),  t[7],  1, 1200, 1200),
      (pg_temp.sid(v_prefix || ':prop:10'), t[8],  1, 1400, 1400);

    UPDATE public.leads SET proposal_id = pg_temp.sid(v_prefix || ':prop:' || n)
    FROM generate_series(4, 10) n
    WHERE id = pg_temp.sid(v_prefix || ':lead:' || n) AND n <> 5;

    -- Contratos (6 a 10) com a previsão financeira gerada pelo próprio sistema
    INSERT INTO public.contracts (id, clinic_id, patient_id, proposal_id, contract_number, status, start_date, end_date, notes, signed_at, created_by, created_at)
    VALUES
      (pg_temp.sid(v_prefix || ':ctr:6'),  v_clinic, p[6],  pg_temp.sid(v_prefix || ':prop:6'),  'CTR-' || v_prefix || '-0006', 'active',    v_today + 3,  v_today + 60,  'Formas: Pix R$ 1.800,00', now() - interval '2 days', v_v3, now() - interval '2 days'),
      (pg_temp.sid(v_prefix || ':ctr:7'),  v_clinic, p[7],  pg_temp.sid(v_prefix || ':prop:7'),  'CTR-' || v_prefix || '-0007', 'active',    v_today - 40, v_today + 120, 'Formas: Cartão de crédito R$ 2.000,00 em 4x de R$ 500,00', now() - interval '40 days', v_v1, now() - interval '40 days'),
      (pg_temp.sid(v_prefix || ':ctr:8'),  v_clinic, p[8],  pg_temp.sid(v_prefix || ':prop:8'),  'CTR-' || v_prefix || '-0008', 'completed', v_today - 90, v_today - 20,  'Formas: Pix R$ 900,00', now() - interval '90 days', v_v2, now() - interval '90 days'),
      (pg_temp.sid(v_prefix || ':ctr:9'),  v_clinic, p[9],  pg_temp.sid(v_prefix || ':prop:9'),  'CTR-' || v_prefix || '-0009', 'active',    v_today - 50, v_today + 90,  'Formas: Boleto R$ 1.200,00 em 3x de R$ 400,00', now() - interval '50 days', v_v3, now() - interval '50 days'),
      (pg_temp.sid(v_prefix || ':ctr:10'), v_clinic, p[10], pg_temp.sid(v_prefix || ':prop:10'), 'CTR-' || v_prefix || '-0010', 'active',    v_today - 20, v_today + 40,  'Formas: Pix R$ 1.400,00', now() - interval '20 days', v_v1, now() - interval '20 days');

    FOR i IN 6..10 LOOP
      PERFORM private.upsert_contract_financial_forecast(pg_temp.sid(v_prefix || ':ctr:' || i), true);
    END LOOP;

    -- Baixas: 7 pagou 2 de 4; 8 quitado; 9 pagou só a 1ª (2ª vencida); 10 quitado
    UPDATE public.contract_installments ci
       SET status = 'pago', paid_at = ci.due_date, paid_amount = ci.amount, paid_method = ci.payment_method
     WHERE ci.clinic_id = v_clinic
       AND (
            (ci.contract_id = pg_temp.sid(v_prefix || ':ctr:7') AND ci.installment_number <= 2)
         OR  ci.contract_id = pg_temp.sid(v_prefix || ':ctr:8')
         OR (ci.contract_id = pg_temp.sid(v_prefix || ':ctr:9') AND ci.installment_number = 1)
         OR  ci.contract_id = pg_temp.sid(v_prefix || ':ctr:10')
       );

    -- Agenda e sessões
    -- 6: primeira aplicação marcada
    INSERT INTO public.appointments (id, clinic_id, patient_id, professional_id, treatment_id, contract_id, start_time, end_time, status, appointment_type, notes, created_by)
    VALUES (pg_temp.sid(v_prefix || ':agenda:6'), v_clinic, p[6], v_e3, t[4], pg_temp.sid(v_prefix || ':ctr:6'),
            date_trunc('hour', now()) + interval '5 days 14 hours', date_trunc('hour', now()) + interval '5 days 14 hours 45 minutes', 'confirmed', 'session', 'Primeira aplicação.', v_rec);

    -- 7: 3 de 8 sessões feitas e a próxima marcada
    FOR i IN 1..3 LOOP
      v_appt := pg_temp.sid(v_prefix || ':agenda:7:' || i);
      v_sess := pg_temp.sid(v_prefix || ':sessao:7:' || i);
      INSERT INTO public.appointments (id, clinic_id, patient_id, professional_id, treatment_id, contract_id, start_time, end_time, status, appointment_type, created_by)
      VALUES (v_appt, v_clinic, p[7], v_e2, t[9], pg_temp.sid(v_prefix || ':ctr:7'),
              now() - ((40 - i * 10) || ' days')::interval, now() - ((40 - i * 10) || ' days')::interval + interval '50 minutes', 'completed', 'session', v_rec);
      INSERT INTO public.session_records (id, clinic_id, appointment_id, patient_id, treatment_id, professional_id, session_number, total_sessions, notes, performed_at)
      VALUES (v_sess, v_clinic, v_appt, p[7], t[9], v_e2, i, 8, 'Sessão sem intercorrências.', now() - ((40 - i * 10) || ' days')::interval);
    END LOOP;
    INSERT INTO public.appointments (id, clinic_id, patient_id, professional_id, treatment_id, contract_id, start_time, end_time, status, appointment_type, created_by)
    VALUES (pg_temp.sid(v_prefix || ':agenda:7:4'), v_clinic, p[7], v_e2, t[9], pg_temp.sid(v_prefix || ':ctr:7'),
            date_trunc('hour', now()) + interval '2 days 9 hours', date_trunc('hour', now()) + interval '2 days 9 hours 50 minutes', 'scheduled', 'session', v_rec);

    -- 8: 3 de 3 sessões feitas, avaliação 5 estrelas
    FOR i IN 1..3 LOOP
      v_appt := pg_temp.sid(v_prefix || ':agenda:8:' || i);
      v_sess := pg_temp.sid(v_prefix || ':sessao:8:' || i);
      INSERT INTO public.appointments (id, clinic_id, patient_id, professional_id, treatment_id, contract_id, start_time, end_time, status, appointment_type, created_by)
      VALUES (v_appt, v_clinic, p[8], v_e1, t[2], pg_temp.sid(v_prefix || ':ctr:8'),
              now() - ((90 - i * 20) || ' days')::interval, now() - ((90 - i * 20) || ' days')::interval + interval '45 minutes', 'completed', 'session', v_rec);
      INSERT INTO public.session_records (id, clinic_id, appointment_id, patient_id, treatment_id, professional_id, session_number, total_sessions, notes, performed_at)
      VALUES (v_sess, v_clinic, v_appt, p[8], t[2], v_e1, i, 3, 'Boa resposta ao peeling.', now() - ((90 - i * 20) || ' days')::interval);
    END LOOP;
    INSERT INTO public.session_feedback (id, clinic_id, session_record_id, patient_id, rating, comment, treatment_id, professional_id, created_at)
    VALUES (pg_temp.sid(v_prefix || ':feedback:8'), v_clinic, pg_temp.sid(v_prefix || ':sessao:8:3'), p[8], 5, 'Amei o resultado, pele muito mais uniforme.', t[2], v_e1, now() - interval '29 days');

    -- 9: 2 de 10 sessões feitas, parcela vencida
    FOR i IN 1..2 LOOP
      v_appt := pg_temp.sid(v_prefix || ':agenda:9:' || i);
      v_sess := pg_temp.sid(v_prefix || ':sessao:9:' || i);
      INSERT INTO public.appointments (id, clinic_id, patient_id, professional_id, treatment_id, contract_id, start_time, end_time, status, appointment_type, created_by)
      VALUES (v_appt, v_clinic, p[9], v_e5, t[7], pg_temp.sid(v_prefix || ':ctr:9'),
              now() - ((50 - i * 14) || ' days')::interval, now() - ((50 - i * 14) || ' days')::interval + interval '1 hour', 'completed', 'session', v_rec);
      INSERT INTO public.session_records (id, clinic_id, appointment_id, patient_id, treatment_id, professional_id, session_number, total_sessions, notes, performed_at)
      VALUES (v_sess, v_clinic, v_appt, p[9], t[7], v_e5, i, 10, 'Drenagem realizada.', now() - ((50 - i * 14) || ' days')::interval);
    END LOOP;
    -- e faltou na última
    INSERT INTO public.appointments (id, clinic_id, patient_id, professional_id, treatment_id, contract_id, start_time, end_time, status, appointment_type, no_show_reason, created_by)
    VALUES (pg_temp.sid(v_prefix || ':agenda:9:3'), v_clinic, p[9], v_e5, t[7], pg_temp.sid(v_prefix || ':ctr:9'),
            now() - interval '6 days', now() - interval '6 days' + interval '1 hour', 'no_show', 'session', 'Não avisou.', v_rec);

    -- 10: sessão feita com avaliação ruim (fica marcada como insatisfeita)
    v_appt := pg_temp.sid(v_prefix || ':agenda:10:1');
    v_sess := pg_temp.sid(v_prefix || ':sessao:10:1');
    INSERT INTO public.appointments (id, clinic_id, patient_id, professional_id, treatment_id, contract_id, start_time, end_time, status, appointment_type, created_by)
    VALUES (v_appt, v_clinic, p[10], v_e4, t[8], pg_temp.sid(v_prefix || ':ctr:10'),
            now() - interval '15 days', now() - interval '15 days' + interval '1 hour', 'completed', 'session', v_rec);
    INSERT INTO public.session_records (id, clinic_id, appointment_id, patient_id, treatment_id, professional_id, session_number, total_sessions, notes, performed_at)
    VALUES (v_sess, v_clinic, v_appt, p[10], t[8], v_e4, 1, 1, 'Paciente relatou desconforto.', now() - interval '15 days');
    INSERT INTO public.session_feedback (id, clinic_id, session_record_id, patient_id, rating, comment, treatment_id, professional_id, created_at)
    VALUES (pg_temp.sid(v_prefix || ':feedback:10'), v_clinic, v_sess, p[10], 2, 'Senti muito frio e dor, esperava resultado mais rápido.', t[8], v_e4, now() - interval '14 days');
    UPDATE public.patients
       SET dissatisfaction_flag = true, dissatisfaction_level = 'alto',
           dissatisfaction_reason = 'Avaliou a sessão com 2 estrelas: dor e expectativa de resultado.'
     WHERE id = p[10];
  END LOOP;

  IF v_skipped <> '' THEN
    RAISE NOTICE 'Atenção: estas contas já têm perfil ativo em outra clínica e ficaram de fora:%', v_skipped;
  END IF;
  RAISE NOTICE 'Clínicas de teste prontas: Vive Estética (teste) e Eras Estética (teste).';
END $$;

DROP TABLE seed_staff;
