-- Materiais padrão por tratamento do catálogo, com custo de referência de mercado (nov/2026).
-- Ao criar um tratamento com nome do catálogo, a clínica já recebe os materiais (no Estoque) e a
-- composição de custo por sessão. Tudo editável. Clínicas atuais recebem para os tratamentos sem composição.

CREATE TABLE IF NOT EXISTS public.material_catalog (
  code text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('supply', 'medication')),
  unit text NOT NULL,
  reference_cost numeric(12,2) NOT NULL,
  reference_note text
);

CREATE TABLE IF NOT EXISTS public.treatment_catalog_materials (
  treatment_name text NOT NULL,
  material_code text NOT NULL REFERENCES public.material_catalog(code) ON DELETE CASCADE,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (treatment_name, material_code)
);

ALTER TABLE public.material_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_catalog_materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Catálogo de materiais visível" ON public.material_catalog;
CREATE POLICY "Catálogo de materiais visível" ON public.material_catalog FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Receitas do catálogo visíveis" ON public.treatment_catalog_materials;
CREATE POLICY "Receitas do catálogo visíveis" ON public.treatment_catalog_materials FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.material_catalog, public.treatment_catalog_materials TO authenticated;

INSERT INTO public.material_catalog (code, name, type, unit, reference_cost, reference_note) VALUES
  ('luva', 'Luva de procedimento', 'supply', 'par', 0.8, 'caixa c/100 ~R$ 40'),
  ('lencol', 'Lençol descartável', 'supply', 'un', 1.5, NULL),
  ('gaze', 'Gaze estéril (pacote)', 'supply', 'pacote', 1.2, NULL),
  ('seringa', 'Seringa 1 ml', 'supply', 'un', 0.6, NULL),
  ('agulha30', 'Agulha 30G', 'supply', 'un', 0.6, NULL),
  ('canula', 'Cânula 22G', 'supply', 'un', 25.0, NULL),
  ('alcool', 'Álcool 70%', 'supply', 'ml', 0.02, NULL),
  ('clorexidina', 'Clorexidina alcoólica', 'supply', 'ml', 0.05, NULL),
  ('anestesico', 'Anestésico tópico', 'medication', 'g', 3.0, 'bisnaga 30 g ~R$ 90'),
  ('espatula', 'Espátula descartável', 'supply', 'un', 0.15, NULL),
  ('sabonete', 'Sabonete de limpeza facial', 'supply', 'ml', 0.15, NULL),
  ('esfoliante', 'Esfoliante facial', 'supply', 'g', 0.3, NULL),
  ('emoliente', 'Emoliente para extração', 'supply', 'ml', 0.2, NULL),
  ('mascara_facial', 'Máscara facial', 'supply', 'aplicação', 8.0, NULL),
  ('serum_vitc', 'Sérum de vitamina C', 'medication', 'ml', 3.0, NULL),
  ('hidratante', 'Hidratante / pós-procedimento', 'supply', 'ml', 0.5, NULL),
  ('protetor', 'Protetor solar', 'supply', 'ml', 0.4, NULL),
  ('lanceta', 'Lanceta para extração', 'supply', 'un', 0.3, NULL),
  ('gel_cond', 'Gel condutor', 'supply', 'ml', 0.02, NULL),
  ('lamina_derma', 'Lâmina de dermaplaning', 'supply', 'un', 4.0, NULL),
  ('cartucho_micro', 'Cartucho de microagulhamento', 'supply', 'un', 28.0, 'kit 10 ~R$ 280'),
  ('ativo_drug', 'Ativo para drug delivery', 'medication', 'ampola', 15.0, NULL),
  ('hifu', 'Refil de ultrassom microfocado', 'supply', 'sessão', 120.0, 'disparos do cartucho'),
  ('acido_glicolico', 'Ácido glicólico 70%', 'medication', 'ml', 4.0, 'frasco 30 ml ~R$ 120'),
  ('acido_mandelico', 'Ácido mandélico (peeling)', 'medication', 'ml', 3.5, NULL),
  ('acido_salicilico', 'Ácido salicílico (peeling)', 'medication', 'ml', 3.5, NULL),
  ('acido_retinoico', 'Retinol / retinoico (peeling)', 'medication', 'ml', 6.0, NULL),
  ('acido_tranexamico', 'Ácido tranexâmico', 'medication', 'ml', 4.0, NULL),
  ('peeling_enzimatico', 'Peeling enzimático', 'medication', 'g', 1.5, NULL),
  ('neutralizador', 'Neutralizador de peeling', 'supply', 'ml', 0.3, NULL),
  ('toxina', 'Toxina botulínica 100U', 'medication', 'frasco', 800.0, 'Botox ~R$ 835; Botulim ~R$ 603'),
  ('soro', 'Soro fisiológico 10 ml', 'supply', 'ampola', 1.0, NULL),
  ('ah_preenchedor', 'Ácido hialurônico preenchedor 1 ml', 'medication', 'seringa', 450.0, 'faixa R$ 300–900 por marca'),
  ('skinbooster', 'Skinbooster 1 ml', 'medication', 'seringa', 350.0, NULL),
  ('bioestimulador', 'Bioestimulador de colágeno', 'medication', 'frasco', 1100.0, 'PLLA / hidroxiapatita'),
  ('fio_pdo', 'Fio de PDO espiculado', 'medication', 'un', 90.0, NULL),
  ('enzima', 'Enzima lipolítica', 'medication', 'ampola', 45.0, NULL),
  ('ativo_intradermo', 'Ativo para intradermoterapia', 'medication', 'ampola', 20.0, NULL),
  ('ativo_capilar', 'Ativo capilar', 'medication', 'ampola', 25.0, NULL),
  ('detox_capilar', 'Produto detox capilar', 'supply', 'ml', 0.4, NULL),
  ('oleo', 'Óleo / creme de massagem', 'supply', 'ml', 0.08, NULL),
  ('creme_redutor', 'Creme / gel redutor', 'supply', 'ml', 0.25, NULL),
  ('argila', 'Argila / envoltório', 'supply', 'g', 0.05, NULL),
  ('filme_pvc', 'Filme / bandagem para envoltório', 'supply', 'aplicação', 3.0, NULL),
  ('manta_crio', 'Manta anticongelante (criolipólise)', 'supply', 'un', 12.0, 'caixa 10 ~R$ 115–150'),
  ('henna', 'Henna para sobrancelha', 'supply', 'aplicação', 2.0, NULL),
  ('kit_lash', 'Kit lash lifting', 'supply', 'aplicação', 12.0, 'kit ~R$ 340 / ~30 aplicações'),
  ('kit_brow', 'Kit brow lamination', 'supply', 'aplicação', 10.0, NULL),
  ('fios_cilios', 'Fios de cílios', 'supply', 'aplicação', 20.0, NULL),
  ('cola_cilios', 'Cola para cílios', 'supply', 'aplicação', 3.0, NULL),
  ('pigmento', 'Pigmento de micropigmentação', 'medication', 'ml', 15.0, NULL),
  ('agulha_micro', 'Agulha / cartucho de micropigmentação', 'supply', 'un', 8.0, NULL)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, unit = EXCLUDED.unit,
  reference_cost = EXCLUDED.reference_cost, reference_note = EXCLUDED.reference_note;

INSERT INTO public.treatment_catalog_materials (treatment_name, material_code, quantity) VALUES
  ('Avaliação tricológica', 'luva', 1),
  ('Avaliação tricológica', 'lencol', 1),
  ('Detox do couro cabeludo', 'luva', 1),
  ('Detox do couro cabeludo', 'lencol', 1),
  ('Detox do couro cabeludo', 'detox_capilar', 30),
  ('Intradermoterapia capilar', 'luva', 1),
  ('Intradermoterapia capilar', 'ativo_capilar', 2),
  ('Intradermoterapia capilar', 'seringa', 2),
  ('Intradermoterapia capilar', 'agulha30', 4),
  ('Intradermoterapia capilar', 'clorexidina', 10),
  ('Intradermoterapia capilar', 'gaze', 1),
  ('LED e laser capilar', 'luva', 1),
  ('Microagulhamento capilar', 'luva', 1),
  ('Microagulhamento capilar', 'cartucho_micro', 1),
  ('Microagulhamento capilar', 'ativo_capilar', 2),
  ('Microagulhamento capilar', 'clorexidina', 10),
  ('Microagulhamento capilar', 'gaze', 1),
  ('Microagulhamento capilar', 'anestesico', 5),
  ('Protocolo queda capilar 3 meses', 'luva', 1),
  ('Protocolo queda capilar 3 meses', 'ativo_capilar', 1),
  ('Protocolo queda capilar 3 meses', 'seringa', 1),
  ('Protocolo queda capilar 3 meses', 'agulha30', 2),
  ('Protocolo queda capilar 3 meses', 'clorexidina', 10),
  ('Drenomodeladora', 'lencol', 1),
  ('Drenomodeladora', 'oleo', 40),
  ('Endermoterapia corporal', 'lencol', 1),
  ('Endermoterapia corporal', 'oleo', 30),
  ('Microagulhamento para estrias', 'luva', 1),
  ('Microagulhamento para estrias', 'cartucho_micro', 1),
  ('Microagulhamento para estrias', 'ativo_drug', 1),
  ('Microagulhamento para estrias', 'clorexidina', 10),
  ('Microagulhamento para estrias', 'gaze', 2),
  ('Microagulhamento para estrias', 'anestesico', 10),
  ('Protocolo glúteos firmes', 'lencol', 1),
  ('Protocolo glúteos firmes', 'gel_cond', 100),
  ('Protocolo glúteos firmes', 'creme_redutor', 30),
  ('Protocolo pernas leves', 'lencol', 1),
  ('Protocolo pernas leves', 'oleo', 40),
  ('Protocolo pernas leves', 'creme_redutor', 20),
  ('Pump up glúteos', 'lencol', 1),
  ('Pump up glúteos', 'oleo', 20),
  ('Radiofrequência corporal', 'lencol', 1),
  ('Radiofrequência corporal', 'gel_cond', 100),
  ('Tratamento de celulite grau I e II', 'lencol', 1),
  ('Tratamento de celulite grau I e II', 'gel_cond', 80),
  ('Tratamento de celulite grau I e II', 'creme_redutor', 30),
  ('Tratamento de celulite grau III', 'lencol', 1),
  ('Tratamento de celulite grau III', 'gel_cond', 100),
  ('Tratamento de celulite grau III', 'creme_redutor', 40),
  ('Tratamento de flacidez abdominal', 'lencol', 1),
  ('Tratamento de flacidez abdominal', 'gel_cond', 80),
  ('Tratamento de flacidez abdominal', 'creme_redutor', 30),
  ('Avaliação corporal com bioimpedância', 'lencol', 1),
  ('Avaliação corporal com bioimpedância', 'alcool', 5),
  ('Criolipólise abdômen', 'manta_crio', 2),
  ('Criolipólise abdômen', 'lencol', 1),
  ('Criolipólise flancos', 'manta_crio', 2),
  ('Criolipólise flancos', 'lencol', 1),
  ('Envoltório corporal redutor', 'lencol', 1),
  ('Envoltório corporal redutor', 'argila', 200),
  ('Envoltório corporal redutor', 'filme_pvc', 1),
  ('Manta térmica com ativos', 'lencol', 1),
  ('Manta térmica com ativos', 'creme_redutor', 40),
  ('Manta térmica com ativos', 'filme_pvc', 1),
  ('Programa redução de medidas 4 semanas', 'lencol', 1),
  ('Programa redução de medidas 4 semanas', 'gel_cond', 80),
  ('Programa redução de medidas 4 semanas', 'creme_redutor', 30),
  ('Programa redução de medidas 8 semanas', 'lencol', 1),
  ('Programa redução de medidas 8 semanas', 'gel_cond', 80),
  ('Programa redução de medidas 8 semanas', 'creme_redutor', 30),
  ('Protocolo barriga zero', 'lencol', 1),
  ('Protocolo barriga zero', 'gel_cond', 80),
  ('Protocolo barriga zero', 'creme_redutor', 30),
  ('Protocolo detox corporal', 'lencol', 1),
  ('Protocolo detox corporal', 'argila', 200),
  ('Protocolo detox corporal', 'oleo', 30),
  ('Protocolo detox corporal', 'filme_pvc', 1),
  ('Ultrassom cavitacional', 'lencol', 1),
  ('Ultrassom cavitacional', 'gel_cond', 100),
  ('Dermaplaning', 'luva', 1),
  ('Dermaplaning', 'lencol', 1),
  ('Dermaplaning', 'lamina_derma', 1),
  ('Dermaplaning', 'sabonete', 5),
  ('Dermaplaning', 'hidratante', 3),
  ('Dermaplaning', 'protetor', 2),
  ('Hidratação facial intensiva', 'luva', 1),
  ('Hidratação facial intensiva', 'lencol', 1),
  ('Hidratação facial intensiva', 'sabonete', 5),
  ('Hidratação facial intensiva', 'esfoliante', 5),
  ('Hidratação facial intensiva', 'mascara_facial', 1),
  ('Hidratação facial intensiva', 'hidratante', 3),
  ('Hidratação facial intensiva', 'protetor', 2),
  ('Limpeza de pele premium com LED', 'luva', 2),
  ('Limpeza de pele premium com LED', 'lencol', 1),
  ('Limpeza de pele premium com LED', 'sabonete', 5),
  ('Limpeza de pele premium com LED', 'esfoliante', 5),
  ('Limpeza de pele premium com LED', 'emoliente', 10),
  ('Limpeza de pele premium com LED', 'lanceta', 2),
  ('Limpeza de pele premium com LED', 'gaze', 2),
  ('Limpeza de pele premium com LED', 'mascara_facial', 1),
  ('Limpeza de pele premium com LED', 'hidratante', 3),
  ('Limpeza de pele premium com LED', 'protetor', 2),
  ('Limpeza de pele profunda', 'luva', 2),
  ('Limpeza de pele profunda', 'lencol', 1),
  ('Limpeza de pele profunda', 'sabonete', 5),
  ('Limpeza de pele profunda', 'esfoliante', 5),
  ('Limpeza de pele profunda', 'emoliente', 10),
  ('Limpeza de pele profunda', 'lanceta', 2),
  ('Limpeza de pele profunda', 'gaze', 2),
  ('Limpeza de pele profunda', 'mascara_facial', 1),
  ('Limpeza de pele profunda', 'protetor', 2),
  ('Microagulhamento facial', 'luva', 1),
  ('Microagulhamento facial', 'lencol', 1),
  ('Microagulhamento facial', 'cartucho_micro', 1),
  ('Microagulhamento facial', 'ativo_drug', 1),
  ('Microagulhamento facial', 'anestesico', 10),
  ('Microagulhamento facial', 'clorexidina', 10),
  ('Microagulhamento facial', 'gaze', 2),
  ('Microagulhamento facial', 'protetor', 2),
  ('Radiofrequência facial', 'luva', 1),
  ('Radiofrequência facial', 'lencol', 1),
  ('Radiofrequência facial', 'gel_cond', 30),
  ('Radiofrequência facial', 'sabonete', 5),
  ('Radiofrequência facial', 'protetor', 2),
  ('Rejuvenescimento facial global', 'luva', 1),
  ('Rejuvenescimento facial global', 'lencol', 1),
  ('Rejuvenescimento facial global', 'sabonete', 5),
  ('Rejuvenescimento facial global', 'ativo_drug', 1),
  ('Rejuvenescimento facial global', 'mascara_facial', 1),
  ('Rejuvenescimento facial global', 'gel_cond', 30),
  ('Rejuvenescimento facial global', 'protetor', 2),
  ('Revitalização com vitamina C', 'luva', 1),
  ('Revitalização com vitamina C', 'lencol', 1),
  ('Revitalização com vitamina C', 'sabonete', 5),
  ('Revitalização com vitamina C', 'serum_vitc', 2),
  ('Revitalização com vitamina C', 'mascara_facial', 1),
  ('Revitalização com vitamina C', 'protetor', 2),
  ('Tratamento para olheiras estéticas', 'luva', 1),
  ('Tratamento para olheiras estéticas', 'ativo_drug', 1),
  ('Tratamento para olheiras estéticas', 'gel_cond', 10),
  ('Ultrassom microfocado facial', 'luva', 1),
  ('Ultrassom microfocado facial', 'lencol', 1),
  ('Ultrassom microfocado facial', 'hifu', 1),
  ('Ultrassom microfocado facial', 'gel_cond', 40),
  ('Ultrassom microfocado facial', 'anestesico', 10),
  ('Ultrassom microfocado facial', 'sabonete', 5),
  ('Bioestimulador de colágeno (1 frasco)', 'bioestimulador', 1),
  ('Bioestimulador de colágeno (1 frasco)', 'soro', 1),
  ('Bioestimulador de colágeno (1 frasco)', 'seringa', 2),
  ('Bioestimulador de colágeno (1 frasco)', 'agulha30', 2),
  ('Bioestimulador de colágeno (1 frasco)', 'canula', 1),
  ('Bioestimulador de colágeno (1 frasco)', 'clorexidina', 10),
  ('Bioestimulador de colágeno (1 frasco)', 'luva', 1),
  ('Bioestimulador de colágeno (1 frasco)', 'gaze', 2),
  ('Bioestimulador de colágeno (1 frasco)', 'anestesico', 5),
  ('Enzimas para gordura localizada', 'enzima', 1),
  ('Enzimas para gordura localizada', 'seringa', 1),
  ('Enzimas para gordura localizada', 'agulha30', 2),
  ('Enzimas para gordura localizada', 'clorexidina', 10),
  ('Enzimas para gordura localizada', 'luva', 1),
  ('Enzimas para gordura localizada', 'gaze', 1),
  ('Fios de PDO de sustentação', 'fio_pdo', 8),
  ('Fios de PDO de sustentação', 'anestesico', 10),
  ('Fios de PDO de sustentação', 'clorexidina', 15),
  ('Fios de PDO de sustentação', 'luva', 2),
  ('Fios de PDO de sustentação', 'gaze', 3),
  ('Fios de PDO de sustentação', 'agulha30', 2),
  ('Intradermoterapia corporal', 'ativo_intradermo', 2),
  ('Intradermoterapia corporal', 'seringa', 2),
  ('Intradermoterapia corporal', 'agulha30', 4),
  ('Intradermoterapia corporal', 'clorexidina', 10),
  ('Intradermoterapia corporal', 'luva', 1),
  ('Intradermoterapia corporal', 'gaze', 2),
  ('Preenchimento de olheiras', 'ah_preenchedor', 1),
  ('Preenchimento de olheiras', 'canula', 1),
  ('Preenchimento de olheiras', 'anestesico', 5),
  ('Preenchimento de olheiras', 'clorexidina', 10),
  ('Preenchimento de olheiras', 'luva', 1),
  ('Preenchimento de olheiras', 'gaze', 2),
  ('Preenchimento de olheiras', 'agulha30', 1),
  ('Preenchimento labial (1 ml)', 'ah_preenchedor', 1),
  ('Preenchimento labial (1 ml)', 'anestesico', 5),
  ('Preenchimento labial (1 ml)', 'clorexidina', 10),
  ('Preenchimento labial (1 ml)', 'luva', 1),
  ('Preenchimento labial (1 ml)', 'gaze', 2),
  ('Skinbooster', 'skinbooster', 1),
  ('Skinbooster', 'agulha30', 2),
  ('Skinbooster', 'anestesico', 10),
  ('Skinbooster', 'clorexidina', 10),
  ('Skinbooster', 'luva', 1),
  ('Skinbooster', 'gaze', 2),
  ('Toxina botulínica full face', 'toxina', 0.6),
  ('Toxina botulínica full face', 'soro', 1),
  ('Toxina botulínica full face', 'seringa', 2),
  ('Toxina botulínica full face', 'agulha30', 2),
  ('Toxina botulínica full face', 'alcool', 10),
  ('Toxina botulínica full face', 'luva', 1),
  ('Toxina botulínica full face', 'gaze', 2),
  ('Toxina botulínica terço superior', 'toxina', 0.3),
  ('Toxina botulínica terço superior', 'soro', 1),
  ('Toxina botulínica terço superior', 'seringa', 1),
  ('Toxina botulínica terço superior', 'agulha30', 1),
  ('Toxina botulínica terço superior', 'alcool', 10),
  ('Toxina botulínica terço superior', 'luva', 1),
  ('Toxina botulínica terço superior', 'gaze', 1),
  ('Depilação a laser axilas', 'luva', 1),
  ('Depilação a laser axilas', 'gel_cond', 20),
  ('Depilação a laser buço', 'luva', 1),
  ('Depilação a laser buço', 'gel_cond', 5),
  ('Depilação a laser corpo inteiro', 'luva', 2),
  ('Depilação a laser corpo inteiro', 'lencol', 1),
  ('Depilação a laser corpo inteiro', 'gel_cond', 200),
  ('Depilação a laser pernas inteiras', 'luva', 1),
  ('Depilação a laser pernas inteiras', 'lencol', 1),
  ('Depilação a laser pernas inteiras', 'gel_cond', 120),
  ('Depilação a laser virilha completa', 'luva', 1),
  ('Depilação a laser virilha completa', 'lencol', 1),
  ('Depilação a laser virilha completa', 'gel_cond', 30),
  ('Laser fracionado facial', 'luva', 1),
  ('Laser fracionado facial', 'lencol', 1),
  ('Laser fracionado facial', 'anestesico', 15),
  ('Laser fracionado facial', 'hidratante', 3),
  ('Laser fracionado facial', 'protetor', 2),
  ('Luz pulsada para manchas', 'luva', 1),
  ('Luz pulsada para manchas', 'gel_cond', 30),
  ('Luz pulsada para manchas', 'protetor', 2),
  ('Remoção de tatuagem a laser', 'luva', 1),
  ('Remoção de tatuagem a laser', 'gaze', 2),
  ('Remoção de tatuagem a laser', 'hidratante', 3),
  ('Drenagem linfática corporal', 'lencol', 1),
  ('Drenagem linfática corporal', 'oleo', 30),
  ('Drenagem linfática pós-operatória', 'lencol', 1),
  ('Drenagem linfática pós-operatória', 'oleo', 30),
  ('Drenagem linfática pós-operatória', 'luva', 1),
  ('Liberação miofascial', 'lencol', 1),
  ('Liberação miofascial', 'oleo', 20),
  ('Massagem com pedras quentes', 'lencol', 1),
  ('Massagem com pedras quentes', 'oleo', 40),
  ('Massagem modeladora', 'lencol', 1),
  ('Massagem modeladora', 'creme_redutor', 40),
  ('Massagem relaxante', 'lencol', 1),
  ('Massagem relaxante', 'oleo', 40),
  ('Reflexologia podal', 'oleo', 10),
  ('Peeling antiacne', 'luva', 1),
  ('Peeling antiacne', 'sabonete', 5),
  ('Peeling antiacne', 'acido_salicilico', 3),
  ('Peeling antiacne', 'neutralizador', 5),
  ('Peeling antiacne', 'gaze', 2),
  ('Peeling antiacne', 'protetor', 2),
  ('Peeling corporal clareador', 'luva', 1),
  ('Peeling corporal clareador', 'lencol', 1),
  ('Peeling corporal clareador', 'acido_glicolico', 10),
  ('Peeling corporal clareador', 'neutralizador', 20),
  ('Peeling corporal clareador', 'gaze', 4),
  ('Peeling de ácido glicólico', 'luva', 1),
  ('Peeling de ácido glicólico', 'sabonete', 5),
  ('Peeling de ácido glicólico', 'acido_glicolico', 3),
  ('Peeling de ácido glicólico', 'neutralizador', 5),
  ('Peeling de ácido glicólico', 'gaze', 2),
  ('Peeling de ácido glicólico', 'protetor', 2),
  ('Peeling de retinol', 'luva', 1),
  ('Peeling de retinol', 'sabonete', 5),
  ('Peeling de retinol', 'acido_retinoico', 2),
  ('Peeling de retinol', 'gaze', 2),
  ('Peeling de retinol', 'protetor', 2),
  ('Peeling enzimático facial', 'luva', 1),
  ('Peeling enzimático facial', 'sabonete', 5),
  ('Peeling enzimático facial', 'peeling_enzimatico', 10),
  ('Peeling enzimático facial', 'hidratante', 3),
  ('Peeling enzimático facial', 'protetor', 2),
  ('Peeling glow', 'luva', 1),
  ('Peeling glow', 'sabonete', 5),
  ('Peeling glow', 'acido_glicolico', 2),
  ('Peeling glow', 'mascara_facial', 1),
  ('Peeling glow', 'protetor', 2),
  ('Peeling mandélico pele sensível', 'luva', 1),
  ('Peeling mandélico pele sensível', 'sabonete', 5),
  ('Peeling mandélico pele sensível', 'acido_mandelico', 3),
  ('Peeling mandélico pele sensível', 'neutralizador', 5),
  ('Peeling mandélico pele sensível', 'gaze', 2),
  ('Peeling mandélico pele sensível', 'protetor', 2),
  ('Peeling para poros dilatados', 'luva', 1),
  ('Peeling para poros dilatados', 'sabonete', 5),
  ('Peeling para poros dilatados', 'acido_salicilico', 3),
  ('Peeling para poros dilatados', 'neutralizador', 5),
  ('Peeling para poros dilatados', 'gaze', 2),
  ('Peeling para poros dilatados', 'protetor', 2),
  ('Peeling químico clareador', 'luva', 1),
  ('Peeling químico clareador', 'sabonete', 5),
  ('Peeling químico clareador', 'acido_glicolico', 2),
  ('Peeling químico clareador', 'acido_mandelico', 2),
  ('Peeling químico clareador', 'neutralizador', 5),
  ('Peeling químico clareador', 'gaze', 2),
  ('Peeling químico clareador', 'protetor', 2),
  ('Peeling tranexâmico para melasma', 'luva', 1),
  ('Peeling tranexâmico para melasma', 'sabonete', 5),
  ('Peeling tranexâmico para melasma', 'acido_tranexamico', 3),
  ('Peeling tranexâmico para melasma', 'gaze', 2),
  ('Peeling tranexâmico para melasma', 'protetor', 2),
  ('Brow lamination', 'kit_brow', 1),
  ('Brow lamination', 'luva', 1),
  ('Design de sobrancelhas', 'luva', 1),
  ('Design de sobrancelhas', 'espatula', 2),
  ('Design de sobrancelhas com henna', 'henna', 1),
  ('Design de sobrancelhas com henna', 'espatula', 2),
  ('Design de sobrancelhas com henna', 'luva', 1),
  ('Extensão de cílios fio a fio', 'fios_cilios', 1),
  ('Extensão de cílios fio a fio', 'cola_cilios', 1),
  ('Extensão de cílios fio a fio', 'luva', 1),
  ('Lash lifting', 'kit_lash', 1),
  ('Lash lifting', 'luva', 1),
  ('Manutenção de extensão de cílios', 'fios_cilios', 0.5),
  ('Manutenção de extensão de cílios', 'cola_cilios', 1),
  ('Manutenção de extensão de cílios', 'luva', 1),
  ('Micropigmentação de sobrancelhas', 'pigmento', 1),
  ('Micropigmentação de sobrancelhas', 'agulha_micro', 2),
  ('Micropigmentação de sobrancelhas', 'anestesico', 5),
  ('Micropigmentação de sobrancelhas', 'luva', 1),
  ('Micropigmentação de sobrancelhas', 'gaze', 2),
  ('Micropigmentação de sobrancelhas', 'clorexidina', 5),
  ('Micropigmentação labial', 'pigmento', 1),
  ('Micropigmentação labial', 'agulha_micro', 2),
  ('Micropigmentação labial', 'anestesico', 10),
  ('Micropigmentação labial', 'luva', 1),
  ('Micropigmentação labial', 'gaze', 2),
  ('Micropigmentação labial', 'clorexidina', 5)
ON CONFLICT (treatment_name, material_code) DO UPDATE SET quantity = EXCLUDED.quantity;

-- Composição padrão de um tratamento: cria os materiais que a clínica ainda não tem (pelo nome)
-- e liga ao tratamento. Só se o tratamento ainda não tiver composição.
CREATE OR REPLACE FUNCTION public.apply_catalog_materials(p_treatment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic uuid;
  v_name text;
  v_count integer := 0;
BEGIN
  SELECT clinic_id, name INTO v_clinic, v_name FROM public.treatments WHERE id = p_treatment_id;
  IF v_clinic IS NULL THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM public.treatment_cost_items WHERE treatment_id = p_treatment_id) THEN RETURN 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.treatment_catalog_materials WHERE lower(treatment_name) = lower(v_name)) THEN RETURN 0; END IF;

  INSERT INTO public.cost_items (clinic_id, name, type, unit, unit_cost, status)
  SELECT v_clinic, mc.name, mc.type, mc.unit, mc.reference_cost, 'active'
  FROM public.treatment_catalog_materials tcm
  JOIN public.material_catalog mc ON mc.code = tcm.material_code
  WHERE lower(tcm.treatment_name) = lower(v_name)
    AND NOT EXISTS (SELECT 1 FROM public.cost_items ci WHERE ci.clinic_id = v_clinic AND lower(ci.name) = lower(mc.name));

  INSERT INTO public.treatment_cost_items (treatment_id, cost_item_id, quantity)
  SELECT p_treatment_id, ci.id, tcm.quantity
  FROM public.treatment_catalog_materials tcm
  JOIN public.material_catalog mc ON mc.code = tcm.material_code
  JOIN LATERAL (
    SELECT id FROM public.cost_items c WHERE c.clinic_id = v_clinic AND lower(c.name) = lower(mc.name) ORDER BY c.created_at LIMIT 1
  ) ci ON true
  WHERE lower(tcm.treatment_name) = lower(v_name);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_catalog_materials(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_catalog_materials_on_treatment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.apply_catalog_materials(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_catalog_materials_on_treatment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS treatments_catalog_materials ON public.treatments;
CREATE TRIGGER treatments_catalog_materials AFTER INSERT ON public.treatments
  FOR EACH ROW EXECUTE FUNCTION public.apply_catalog_materials_on_treatment();

-- Clínicas atuais: tratamentos do catálogo que ainda não têm composição.
SELECT public.apply_catalog_materials(t.id) FROM public.treatments t;

-- Material só entra nos alertas do estoque depois do primeiro lançamento (entrada, ajuste...).
CREATE OR REPLACE VIEW public.stock_balances
WITH (security_invoker = true) AS
SELECT ci.clinic_id, ci.id AS cost_item_id, coalesce(sum(sm.quantity), 0)::numeric(12,3) AS balance,
  count(sm.id)::integer AS movements
FROM public.cost_items ci
LEFT JOIN public.stock_movements sm ON sm.cost_item_id = ci.id
GROUP BY ci.clinic_id, ci.id;

GRANT SELECT ON public.stock_balances TO authenticated;
