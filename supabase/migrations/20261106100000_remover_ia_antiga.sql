-- Remove a IA de WhatsApp antiga do Clínicas.
-- O atendimento com IA passa a ser o produto Aura, conectado como integração.
-- As tabelas whatsapp_ai_* ficam sem uso (dados preservados) até a limpeza final.

UPDATE public.plans
SET modules = array_replace(modules, 'whatsapp_ai', 'aura')
WHERE 'whatsapp_ai' = ANY (modules);

DELETE FROM public.clinic_module_overrides WHERE module_key = 'whatsapp_ai';

-- Permissão antiga deixa de existir nas telas.
DELETE FROM public.access_group_permissions WHERE permission_key = 'whatsapp_ai.view';

CREATE OR REPLACE FUNCTION public.permission_module(p_permission_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_permission_key
    WHEN 'crm.view' THEN 'crm'
    WHEN 'sessions.view' THEN 'clinical'
    WHEN 'evolution.view' THEN 'clinical'
    WHEN 'photos.view' THEN 'clinical'
    WHEN 'feedback.view' THEN 'clinical'
    WHEN 'goals.view' THEN 'performance'
    WHEN 'reports.view' THEN 'performance'
    ELSE 'core'
  END;
$$;
