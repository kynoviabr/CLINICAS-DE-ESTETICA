-- Épico 5: revisão das regras de acesso a dados e arquivos.
--
-- 1. Funcionário desativado (Configurações > Equipe) continuava com acesso a tudo:
--    is_clinic_staff, has_clinic_role e has_role não olhavam user_roles.is_active.
-- 2. patient-files usava "tem qualquer papel na clínica", sem conferir se está ativo.
--    Passa a usar is_clinic_staff, como os outros espaços.
-- 3. Limites de tamanho e tipo nos espaços de arquivos.

CREATE OR REPLACE FUNCTION public.is_clinic_staff(_user_id uuid, _clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND clinic_id = _clinic_id
      AND is_active
      AND role::text IN ('admin', 'receptionist', 'professional', 'sales')
  )
$$;

CREATE OR REPLACE FUNCTION public.has_clinic_role(_user_id uuid, _clinic_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND clinic_id = _clinic_id AND role = _role AND is_active) $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role AND is_active) $$;

DROP POLICY IF EXISTS "Staff uploads patient files" ON storage.objects;
DROP POLICY IF EXISTS "Staff views patient files" ON storage.objects;
CREATE POLICY "Staff uploads patient files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'patient-files' AND public.is_clinic_staff(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "Staff views patient files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'patient-files' AND public.is_clinic_staff(auth.uid(), ((storage.foldername(name))[1])::uuid));

-- Restos das primeiras versões, caso ainda existam em algum banco.
DROP POLICY IF EXISTS "Auth users view patient photos" ON storage.objects;
DROP POLICY IF EXISTS "Auth users upload patient photos" ON storage.objects;
DROP POLICY IF EXISTS "Auth users view contracts storage" ON storage.objects;
DROP POLICY IF EXISTS "Auth users upload contracts storage" ON storage.objects;
DROP POLICY IF EXISTS "Auth users view documents storage" ON storage.objects;
DROP POLICY IF EXISTS "Auth users upload documents storage" ON storage.objects;

UPDATE storage.buckets SET file_size_limit = 15 * 1024 * 1024, allowed_mime_types = ARRAY['image/*'] WHERE id = 'patient-photos';
UPDATE storage.buckets SET file_size_limit = 2 * 1024 * 1024, allowed_mime_types = ARRAY['image/*'] WHERE id = 'clinic-logos';
UPDATE storage.buckets SET file_size_limit = 25 * 1024 * 1024 WHERE id IN ('contracts', 'documents', 'patient-files', 'patient-anamneses');
