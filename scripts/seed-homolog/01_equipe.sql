-- Seed de testes da HOMOLOG: equipe das duas clínicas de teste.
-- Rodado pelo seed-homolog.sh. A senha de teste chega pela configuração
-- de sessão clinova_seed.senha (definida pelo script, nunca gravada aqui).
-- Contas que já existem não são recriadas: só recebem a senha de teste,
-- o e-mail confirmado e o nome.

CREATE TEMP TABLE seed_staff (
  clinic_no int NOT NULL,
  email text NOT NULL,
  full_name text NOT NULL,
  role public.app_role NOT NULL,
  cargo text NOT NULL,
  specialty text
) ON COMMIT PRESERVE ROWS;

INSERT INTO seed_staff (clinic_no, email, full_name, role, cargo, specialty) VALUES
  -- Clínica 1: Vive Estética (teste)
  (1, 'kynoviabr@gmail.com',                      'Administrador Geral Kynovia', 'admin',        'Administrador geral',   NULL),
  (1, 'viveesaude@gmail.com',                     'Rafaela',                     'admin',        'Gestora administradora', NULL),
  (1, 'paschoa.demetrio@gmail.com',               'Lucas Andrade',               'sales',        'Vendedor',              NULL),
  (1, 'clinicas.kynoviabr@gmail.com',             'Camila Ferreira',             'sales',        'Vendedora',             NULL),
  (1, 'blogger.kynoviabr@gmail.com',              'Diego Martins',               'sales',        'Vendedor',              NULL),
  (1, 'demetriobooks@gmail.com',                  'Ana Paula Souza',             'professional', 'Esteticista',           'Estética facial'),
  (1, 'youtube.demetrio@gmail.com',               'Beatriz Lima',                'professional', 'Esteticista',           'Estética corporal'),
  (1, 'demetriobooks+c1est3@gmail.com',           'Carla Mendes',                'professional', 'Esteticista',           'Injetáveis'),
  (1, 'youtube.demetrio+c1est4@gmail.com',        'Daniela Rocha',               'professional', 'Esteticista',           'Laser'),
  (1, 'paschoa.demetrio+c1est5@gmail.com',        'Elisa Prado',                 'professional', 'Esteticista',           'Estética corporal'),
  (1, 'clinicas.kynoviabr+c1recepcao@gmail.com',  'Fabiana Costa',               'receptionist', 'Recepcionista',         NULL),
  -- Clínica 2: Eras Estética (teste)
  (2, 'kynoviabr+clinica2@gmail.com',             'Administrador Geral Kynovia', 'admin',        'Administrador geral',   NULL),
  (2, 'erascosmeticos@gmail.com',                 'Rafaela',                     'admin',        'Gestora administradora', NULL),
  (2, 'paschoa.demetrio+c2vendas1@gmail.com',     'Gustavo Ribeiro',             'sales',        'Vendedor',              NULL),
  (2, 'clinicas.kynoviabr+c2vendas2@gmail.com',   'Helena Duarte',               'sales',        'Vendedora',             NULL),
  (2, 'blogger.kynoviabr+c2vendas3@gmail.com',    'Igor Nascimento',             'sales',        'Vendedor',              NULL),
  (2, 'demetriobooks+c2est1@gmail.com',           'Juliana Pires',               'professional', 'Esteticista',           'Estética facial'),
  (2, 'youtube.demetrio+c2est2@gmail.com',        'Karina Alves',                'professional', 'Esteticista',           'Estética corporal'),
  (2, 'demetriobooks+c2est3@gmail.com',           'Larissa Moura',               'professional', 'Esteticista',           'Injetáveis'),
  (2, 'youtube.demetrio+c2est4@gmail.com',        'Mariana Teles',               'professional', 'Esteticista',           'Laser'),
  (2, 'blogger.kynoviabr+c2est5@gmail.com',       'Natália Freitas',             'professional', 'Esteticista',           'Estética corporal'),
  (2, 'clinicas.kynoviabr+c2recepcao@gmail.com',  'Olivia Santos',               'receptionist', 'Recepcionista',         NULL);

DO $$
DECLARE
  v_senha text := current_setting('clinova_seed.senha', true);
  v_hash text;
  r record;
  v_id uuid;
BEGIN
  IF v_senha IS NULL OR length(v_senha) < 8 THEN
    RAISE EXCEPTION 'Senha de teste ausente ou curta. Rode pelo seed-homolog.sh.';
  END IF;

  v_hash := extensions.crypt(v_senha, extensions.gen_salt('bf'));

  FOR r IN SELECT * FROM seed_staff LOOP
    SELECT id INTO v_id FROM auth.users WHERE lower(email) = lower(r.email);

    IF v_id IS NULL THEN
      v_id := md5('clinova-seed-homolog:user:' || lower(r.email))::uuid;
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, phone_change, phone_change_token, reauthentication_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', lower(r.email), v_hash, now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', r.full_name),
        now(), now(),
        '', '', '', '', '', '', '', ''
      );
    ELSE
      UPDATE auth.users
      SET encrypted_password = v_hash,
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', r.full_name),
          updated_at = now()
      WHERE id = v_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_id AND provider = 'email') THEN
      INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (
        gen_random_uuid(), v_id, v_id::text,
        jsonb_build_object('sub', v_id::text, 'email', lower(r.email), 'email_verified', true),
        'email', NULL, now(), now()
      );
    END IF;
  END LOOP;

  RAISE NOTICE 'Equipe pronta: % contas.', (SELECT count(*) FROM seed_staff);
END $$;
