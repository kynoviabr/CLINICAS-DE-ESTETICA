-- Entidades de classe (conselhos regionais) já cadastradas em toda clínica, como na Clinova anterior.
-- Clínicas existentes recebem as que faltam; clínica nova recebe ao ser criada.

CREATE OR REPLACE FUNCTION public.seed_class_entities(p_clinic_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.class_entities (clinic_id, abbreviation, name, description, linked_professionals, status)
  SELECT p_clinic_id, t.abbreviation, t.name, t.description, t.linked_professionals, 'active'
  FROM (VALUES
    ('CRM', 'Conselho Regional de Medicina', 'Conselho profissional regional da medicina.', 'Médicos, dermatologistas, nutrólogos, endocrinologistas, cirurgiões plásticos e responsáveis técnicos médicos'),
    ('CRBM', 'Conselho Regional de Biomedicina', 'Conselho profissional regional da biomedicina.', 'Biomédicos estetas, biomédicos habilitados em procedimentos estéticos'),
    ('CREFITO', 'Conselho Regional de Fisioterapia e Terapia Ocupacional', 'Conselho regional de fisioterapia e terapia ocupacional.', 'Fisioterapeutas dermato-funcionais, fisioterapeutas atuantes em estética corporal e reabilitação'),
    ('COREN', 'Conselho Regional de Enfermagem', 'Conselho regional da enfermagem.', 'Enfermeiros, técnicos e auxiliares de enfermagem'),
    ('CRO', 'Conselho Regional de Odontologia', 'Conselho regional da odontologia.', 'Cirurgiões-dentistas, harmonização orofacial, estética facial odontológica'),
    ('CRN', 'Conselho Regional de Nutricionistas', 'Conselho regional da nutrição.', 'Nutricionistas, profissionais de emagrecimento, reeducação alimentar e acompanhamento nutricional'),
    ('CRF', 'Conselho Regional de Farmácia', 'Conselho regional da farmácia.', 'Farmacêuticos estetas, farmacêuticos responsáveis por manipulação, cosméticos ou procedimentos permitidos'),
    ('CREF', 'Conselho Regional de Educação Física', 'Conselho regional da educação física.', 'Profissionais de educação física, personal trainers, acompanhamento físico e programas de emagrecimento'),
    ('CRP', 'Conselho Regional de Psicologia', 'Conselho regional da psicologia.', 'Psicólogos, apoio comportamental, compulsão alimentar, autoestima e acompanhamento emocional'),
    ('CRA', 'Conselho Regional de Administração', 'Conselho regional da administração.', 'Administradores, gestores administrativos, consultores de gestão, quando registrados')
  ) AS t(abbreviation, name, description, linked_professionals)
  ON CONFLICT (clinic_id, abbreviation) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_class_entities(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.seed_class_entities_on_clinic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.seed_class_entities(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_class_entities_on_clinic() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS seed_class_entities_after_insert ON public.clinics;
CREATE TRIGGER seed_class_entities_after_insert
  AFTER INSERT ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.seed_class_entities_on_clinic();

SELECT public.seed_class_entities(id) FROM public.clinics;
