-- Catálogo-modelo ampliado (5 áreas novas) + escolha tratamento a tratamento na implantação.
-- Os preços são uma TABELA BASE de referência: cada clínica ajusta na implantação
-- e depois em Configurações > Tratamentos.

-- 1) Áreas do catálogo (ordem, descrição e aviso exibidos na implantação).
CREATE TABLE IF NOT EXISTS public.treatment_catalog_areas (
  name text PRIMARY KEY,
  description text,
  notice text,
  sort integer NOT NULL DEFAULT 0
);

INSERT INTO public.treatment_catalog_areas (name, description, notice, sort) VALUES
  ('Estética Facial', 'Limpezas, hidratação, tecnologias e rejuvenescimento do rosto.', NULL, 1),
  ('Peelings', 'Renovação da pele: manchas, acne, textura e luminosidade.', NULL, 2),
  ('Celulite e Flacidez', 'Tecnologias e protocolos corporais para celulite, flacidez e estrias.', NULL, 3),
  ('Emagrecimento', 'Avaliação corporal, redução de medidas e gordura localizada.', NULL, 4),
  ('Injetáveis', 'Toxina, preenchimentos, bioestimuladores, enzimas e aplicações.', 'Procedimentos injetáveis só podem ser feitos por profissional habilitado pelo seu conselho (ex.: médico, biomédico, dentista, farmacêutico, enfermeiro esteta), conforme as regras vigentes.', 5),
  ('Laser e Depilação', 'Depilação a laser, luz pulsada e lasers para pele.', 'Lasers e luz pulsada exigem equipamento regularizado e profissional treinado.', 6),
  ('Massagens e Drenagem', 'Drenagem linfática, modeladora e massagens terapêuticas e relaxantes.', NULL, 7),
  ('Sobrancelhas e Cílios', 'Design, henna, lamination, micropigmentação e extensão de cílios.', NULL, 8),
  ('Capilar', 'Avaliação tricológica e tratamentos para queda e couro cabeludo.', NULL, 9)
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, notice = EXCLUDED.notice, sort = EXCLUDED.sort;

ALTER TABLE public.treatment_catalog_areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Áreas visíveis para usuários" ON public.treatment_catalog_areas;
CREATE POLICY "Áreas visíveis para usuários" ON public.treatment_catalog_areas FOR SELECT TO authenticated USING (true);

-- 2) Tratamentos das 5 áreas novas (tabela base, editável por clínica).
INSERT INTO public.treatment_catalog (category_name, name, description, duration_minutes, num_sessions, price, default_price, min_price, cost) VALUES
  ('Injetáveis', 'Toxina botulínica terço superior', 'Testa, glabela e pés de galinha. Inclui retorno de avaliação.', 30, 1, 1200.00, 1200.00, 950.00, 450.00),
  ('Injetáveis', 'Toxina botulínica full face', 'Aplicação em terço superior, médio e inferior conforme avaliação.', 45, 1, 1800.00, 1800.00, 1450.00, 650.00),
  ('Injetáveis', 'Preenchimento labial (1 ml)', 'Ácido hialurônico para contorno e volume labial.', 60, 1, 1500.00, 1500.00, 1200.00, 550.00),
  ('Injetáveis', 'Preenchimento de olheiras', 'Ácido hialurônico para sulco lacrimal conforme avaliação.', 60, 1, 1600.00, 1600.00, 1300.00, 600.00),
  ('Injetáveis', 'Bioestimulador de colágeno (1 frasco)', 'Estímulo de colágeno para flacidez facial ou corporal.', 60, 1, 2200.00, 2200.00, 1800.00, 900.00),
  ('Injetáveis', 'Skinbooster', 'Hidratação profunda injetável para viço e textura.', 45, 3, 700.00, 700.00, 550.00, 220.00),
  ('Injetáveis', 'Enzimas para gordura localizada', 'Aplicação de enzimas em áreas de gordura localizada, por sessão.', 30, 4, 350.00, 350.00, 280.00, 90.00),
  ('Injetáveis', 'Intradermoterapia corporal', 'Aplicações para gordura localizada, celulite ou flacidez, por sessão.', 40, 6, 280.00, 280.00, 220.00, 70.00),
  ('Injetáveis', 'Fios de PDO de sustentação', 'Fios absorvíveis para sustentação e estímulo de colágeno.', 60, 1, 2500.00, 2500.00, 2000.00, 800.00),
  ('Laser e Depilação', 'Depilação a laser axilas', 'Por sessão. Protocolo médio de 8 a 10 sessões.', 20, 8, 120.00, 120.00, 90.00, 25.00),
  ('Laser e Depilação', 'Depilação a laser virilha completa', 'Por sessão.', 30, 8, 220.00, 220.00, 170.00, 45.00),
  ('Laser e Depilação', 'Depilação a laser buço', 'Por sessão.', 15, 8, 90.00, 90.00, 70.00, 20.00),
  ('Laser e Depilação', 'Depilação a laser pernas inteiras', 'Por sessão.', 60, 8, 450.00, 450.00, 360.00, 90.00),
  ('Laser e Depilação', 'Depilação a laser corpo inteiro', 'Por sessão, áreas combinadas.', 120, 8, 1100.00, 1100.00, 900.00, 220.00),
  ('Laser e Depilação', 'Laser fracionado facial', 'Rejuvenescimento, textura e cicatrizes de acne.', 45, 3, 900.00, 900.00, 750.00, 200.00),
  ('Laser e Depilação', 'Luz pulsada para manchas', 'Manchas solares e uniformização do tom.', 40, 4, 350.00, 350.00, 280.00, 80.00),
  ('Laser e Depilação', 'Remoção de tatuagem a laser', 'Por sessão, conforme tamanho e cores.', 30, 6, 400.00, 400.00, 320.00, 80.00),
  ('Massagens e Drenagem', 'Drenagem linfática corporal', 'Técnica manual para retenção de líquido e circulação.', 60, 10, 150.00, 150.00, 120.00, 25.00),
  ('Massagens e Drenagem', 'Drenagem linfática pós-operatória', 'Drenagem especializada no pós-cirúrgico, conforme liberação médica.', 60, 10, 180.00, 180.00, 150.00, 30.00),
  ('Massagens e Drenagem', 'Massagem modeladora', 'Manobras intensas para contorno corporal.', 60, 10, 160.00, 160.00, 130.00, 25.00),
  ('Massagens e Drenagem', 'Massagem relaxante', 'Massagem para alívio de tensão e bem-estar.', 60, 1, 150.00, 150.00, 120.00, 20.00),
  ('Massagens e Drenagem', 'Massagem com pedras quentes', 'Relaxamento profundo com pedras aquecidas.', 75, 1, 190.00, 190.00, 150.00, 30.00),
  ('Massagens e Drenagem', 'Liberação miofascial', 'Alívio de pontos de tensão e dores musculares.', 60, 1, 170.00, 170.00, 140.00, 20.00),
  ('Massagens e Drenagem', 'Reflexologia podal', 'Massagem nos pés por pontos reflexos.', 45, 1, 120.00, 120.00, 95.00, 15.00),
  ('Sobrancelhas e Cílios', 'Design de sobrancelhas', 'Mapeamento e design com pinça.', 30, 1, 60.00, 60.00, 45.00, 8.00),
  ('Sobrancelhas e Cílios', 'Design de sobrancelhas com henna', 'Design com coloração em henna.', 40, 1, 80.00, 80.00, 60.00, 12.00),
  ('Sobrancelhas e Cílios', 'Brow lamination', 'Alinhamento e fixação dos fios.', 60, 1, 180.00, 180.00, 140.00, 30.00),
  ('Sobrancelhas e Cílios', 'Micropigmentação de sobrancelhas', 'Técnica fio a fio ou shadow. Inclui retoque.', 120, 2, 900.00, 900.00, 750.00, 150.00),
  ('Sobrancelhas e Cílios', 'Micropigmentação labial', 'Revitalização da cor dos lábios. Inclui retoque.', 120, 2, 1000.00, 1000.00, 850.00, 180.00),
  ('Sobrancelhas e Cílios', 'Extensão de cílios fio a fio', 'Aplicação completa.', 120, 1, 220.00, 220.00, 180.00, 50.00),
  ('Sobrancelhas e Cílios', 'Manutenção de extensão de cílios', 'Reposição a cada 15 a 21 dias.', 75, 1, 130.00, 130.00, 100.00, 30.00),
  ('Sobrancelhas e Cílios', 'Lash lifting', 'Curvatura e nutrição dos cílios naturais.', 60, 1, 160.00, 160.00, 130.00, 30.00),
  ('Capilar', 'Avaliação tricológica', 'Análise do couro cabeludo e plano de tratamento.', 60, 1, 250.00, 250.00, 200.00, 30.00),
  ('Capilar', 'Intradermoterapia capilar', 'Aplicações no couro cabeludo para queda, por sessão.', 45, 6, 320.00, 320.00, 260.00, 80.00),
  ('Capilar', 'Microagulhamento capilar', 'Estímulo do couro cabeludo com ativos, por sessão.', 60, 6, 380.00, 380.00, 300.00, 90.00),
  ('Capilar', 'LED e laser capilar', 'Fotobiomodulação para fortalecimento dos fios.', 30, 10, 150.00, 150.00, 120.00, 25.00),
  ('Capilar', 'Detox do couro cabeludo', 'Esfoliação e limpeza profunda do couro cabeludo.', 45, 1, 180.00, 180.00, 140.00, 35.00),
  ('Capilar', 'Protocolo queda capilar 3 meses', 'Acompanhamento com sessões combinadas por 3 meses.', 45, 12, 2400.00, 2400.00, 2000.00, 500.00)
ON CONFLICT (category_name, name) DO UPDATE SET
  description = EXCLUDED.description, duration_minutes = EXCLUDED.duration_minutes, num_sessions = EXCLUDED.num_sessions,
  price = EXCLUDED.price, default_price = EXCLUDED.default_price, min_price = EXCLUDED.min_price, cost = EXCLUDED.cost;

-- 3) Implantação escolhe tratamento a tratamento (com preço) e aceita "faço outro".
--    p_items: [{"name","category","price","custom":bool,"sessions","duration"}]
--    p_items NULL = todos os tratamentos das áreas (comportamento anterior).
DROP FUNCTION IF EXISTS public.setup_clinic_defaults(uuid, text[]);

CREATE OR REPLACE FUNCTION public.setup_clinic_defaults(p_clinic_id uuid, p_categories text[], p_items jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_categories integer := 0;
  v_treatments integer := 0;
  v_custom integer := 0;
  v_roles integer := 0;
  v_areas text[];
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_clinic_role(auth.uid(), p_clinic_id, 'admin') THEN
    RAISE EXCEPTION 'Apenas o administrador da clínica pode fazer a implantação.' USING ERRCODE = '42501';
  END IF;

  -- Áreas = as escolhidas + as dos itens (inclusive as de tratamentos próprios).
  SELECT array_agg(DISTINCT a) INTO v_areas FROM (
    SELECT unnest(coalesce(p_categories, ARRAY[]::text[])) AS a
    UNION SELECT trim(i ->> 'category') FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
    WHERE coalesce(trim(i ->> 'category'), '') <> ''
  ) x;

  INSERT INTO public.treatment_categories (clinic_id, name, status)
  SELECT p_clinic_id, a, 'active' FROM unnest(coalesce(v_areas, ARRAY[]::text[])) a
  WHERE NOT EXISTS (SELECT 1 FROM public.treatment_categories tc WHERE tc.clinic_id = p_clinic_id AND lower(tc.name) = lower(a));
  GET DIAGNOSTICS v_categories = ROW_COUNT;

  IF p_items IS NULL THEN
    INSERT INTO public.treatments (clinic_id, name, description, duration_minutes, num_sessions, price,
      category, category_id, default_price, min_price, cost, is_active)
    SELECT p_clinic_id, cat.name, cat.description, cat.duration_minutes, cat.num_sessions, cat.price,
      tc.name, tc.id, cat.default_price, cat.min_price, cat.cost, true
    FROM public.treatment_catalog cat
    JOIN public.treatment_categories tc ON tc.clinic_id = p_clinic_id AND lower(tc.name) = lower(cat.category_name)
    WHERE cat.category_name = ANY (coalesce(p_categories, ARRAY[]::text[]))
      AND NOT EXISTS (SELECT 1 FROM public.treatments t WHERE t.clinic_id = p_clinic_id AND lower(t.name) = lower(cat.name));
    GET DIAGNOSTICS v_treatments = ROW_COUNT;
  ELSE
    -- Do catálogo, com o preço que a clínica escolheu.
    INSERT INTO public.treatments (clinic_id, name, description, duration_minutes, num_sessions, price,
      category, category_id, default_price, min_price, cost, is_active)
    SELECT p_clinic_id, cat.name, cat.description, cat.duration_minutes, cat.num_sessions, v.price,
      tc.name, tc.id, v.price, LEAST(coalesce(cat.min_price, v.price), v.price), cat.cost, true
    FROM (
      SELECT DISTINCT ON (lower(i ->> 'name')) i ->> 'name' AS name, i ->> 'category' AS category,
        NULLIF(i ->> 'price', '')::numeric AS raw_price
      FROM jsonb_array_elements(p_items) i
      WHERE coalesce((i ->> 'custom')::boolean, false) = false
    ) sel
    JOIN public.treatment_catalog cat ON cat.name = sel.name AND cat.category_name = sel.category
    JOIN public.treatment_categories tc ON tc.clinic_id = p_clinic_id AND lower(tc.name) = lower(cat.category_name)
    CROSS JOIN LATERAL (SELECT CASE WHEN sel.raw_price > 0 THEN sel.raw_price ELSE cat.price END AS price) v
    WHERE NOT EXISTS (SELECT 1 FROM public.treatments t WHERE t.clinic_id = p_clinic_id AND lower(t.name) = lower(cat.name));
    GET DIAGNOSTICS v_treatments = ROW_COUNT;

    -- Tratamentos próprios ("faço outro").
    INSERT INTO public.treatments (clinic_id, name, duration_minutes, num_sessions, price,
      category, category_id, default_price, min_price, is_active)
    SELECT p_clinic_id, sel.name, sel.duration, sel.sessions, sel.price, tc.name, tc.id, sel.price, sel.price, true
    FROM (
      SELECT DISTINCT ON (lower(trim(i ->> 'name'))) trim(i ->> 'name') AS name, trim(i ->> 'category') AS category,
        GREATEST(coalesce(NULLIF(i ->> 'price', '')::numeric, 0), 0) AS price,
        GREATEST(coalesce(NULLIF(i ->> 'sessions', '')::integer, 1), 1) AS sessions,
        GREATEST(coalesce(NULLIF(i ->> 'duration', '')::integer, 60), 5) AS duration
      FROM jsonb_array_elements(p_items) i
      WHERE coalesce((i ->> 'custom')::boolean, false) = true AND coalesce(trim(i ->> 'name'), '') <> ''
    ) sel
    JOIN public.treatment_categories tc ON tc.clinic_id = p_clinic_id AND lower(tc.name) = lower(sel.category)
    WHERE NOT EXISTS (SELECT 1 FROM public.treatments t WHERE t.clinic_id = p_clinic_id AND lower(t.name) = lower(sel.name));
    GET DIAGNOSTICS v_custom = ROW_COUNT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.clinic_id = p_clinic_id) THEN
    INSERT INTO public.roles (clinic_id, name, description, status) VALUES
      (p_clinic_id, 'Administração', 'Dona(o) ou gestor(a) da clínica', 'active'),
      (p_clinic_id, 'Recepção', 'Agenda, atendimento e cadastro de clientes', 'active'),
      (p_clinic_id, 'Profissional', 'Realiza os atendimentos e procedimentos', 'active'),
      (p_clinic_id, 'Comercial', 'Avaliações, propostas e fechamento de vendas', 'active');
    GET DIAGNOSTICS v_roles = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('categories', v_categories, 'treatments', v_treatments + v_custom, 'custom', v_custom, 'roles', v_roles);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.setup_clinic_defaults(uuid, text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.setup_clinic_defaults(uuid, text[], jsonb) TO authenticated;
