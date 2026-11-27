-- Prévia dos links enviados ao paciente (cartão do WhatsApp e afins) com o nome e o logo da CLÍNICA.
-- Só lê: não marca o link como aberto e não devolve nenhum dado do paciente.

CREATE OR REPLACE FUNCTION public.link_preview(p_kind text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_clinic uuid; v_hash text; v_title text;
BEGIN
  IF p_token IS NULL OR length(p_token) NOT BETWEEN 3 AND 128 THEN RETURN NULL; END IF;
  v_hash := private.anamnese_token_hash(p_token);
  CASE p_kind
    WHEN 'proposta' THEN SELECT clinic_id INTO v_clinic FROM public.proposal_links WHERE token_hash = v_hash; v_title := 'Sua proposta';
    WHEN 'anamnese' THEN SELECT clinic_id INTO v_clinic FROM public.anamnese_links WHERE token_hash = v_hash; v_title := 'Sua ficha de anamnese';
    WHEN 'cadastro' THEN SELECT clinic_id INTO v_clinic FROM public.lead_signup_links WHERE token_hash = v_hash; v_title := 'Seu cadastro';
    WHEN 'sinal' THEN SELECT clinic_id INTO v_clinic FROM public.appointment_deposits WHERE token_hash = v_hash; v_title := 'Sinal do seu agendamento';
    WHEN 'agendamento' THEN SELECT clinic_id INTO v_clinic FROM public.appointment_links WHERE token_hash = v_hash; v_title := 'Seu agendamento';
    WHEN 'contrato' THEN SELECT clinic_id INTO v_clinic FROM public.contract_links WHERE token_hash = v_hash; v_title := 'Seu contrato';
    WHEN 'contrato-copia' THEN SELECT clinic_id INTO v_clinic FROM public.contract_links WHERE token_hash = v_hash; v_title := 'Cópia do seu contrato';
    WHEN 'aditivo' THEN SELECT clinic_id INTO v_clinic FROM public.contract_links WHERE token_hash = v_hash; v_title := 'Revisão do seu contrato';
    WHEN 'portal' THEN SELECT clinic_id INTO v_clinic FROM public.portal_links WHERE token_hash = v_hash; v_title := 'Sua área de paciente';
    WHEN 'agendar' THEN SELECT id INTO v_clinic FROM public.clinics WHERE slug = p_token; v_title := 'Agende sua avaliação';
    WHEN 'indicar' THEN SELECT clinic_id INTO v_clinic FROM public.patients WHERE referral_code = p_token; v_title := 'Uma indicação para você';
    ELSE RETURN NULL;
  END CASE;
  IF v_clinic IS NULL THEN RETURN NULL; END IF;
  RETURN (SELECT jsonb_build_object('title', v_title, 'clinic_name', c.name, 'logo_url', c.logo_url) FROM public.clinics c WHERE c.id = v_clinic);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.link_preview(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_preview(text, text) TO anon, authenticated;
