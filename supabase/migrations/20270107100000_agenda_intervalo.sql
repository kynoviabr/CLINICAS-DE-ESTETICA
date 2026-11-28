-- Intervalo da agenda configurável por clínica (antes fixo em 30 min).
-- Vale para a grade da Agenda e para os horários oferecidos ao paciente (agendamento online, remarcar, IA).
ALTER TABLE public.clinic_service_settings
  ADD COLUMN IF NOT EXISTS slot_minutes integer NOT NULL DEFAULT 30;
DO $$ BEGIN
  ALTER TABLE public.clinic_service_settings ADD CONSTRAINT clinic_service_settings_slot_minutes_check CHECK (slot_minutes IN (10, 15, 20, 30, 45, 60));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
