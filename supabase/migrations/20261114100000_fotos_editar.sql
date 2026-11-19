-- Equipe da clínica pode corrigir data, rótulo (antes/depois), tratamento e comentário das fotos.
DROP POLICY IF EXISTS "Staff updates photos" ON public.patient_photos;
CREATE POLICY "Staff updates photos" ON public.patient_photos FOR UPDATE TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id))
  WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));
