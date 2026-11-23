-- Proposta pública (/proposta/:id e /p/:id).
-- A função já existia no banco de homologação, criada fora das migrations.
-- Aqui ela é versionada exatamente como está, para não sumir ao recriar o banco ou subir para produção.
-- O endurecimento (link com código secreto e validade) fica para o épico 4.

CREATE OR REPLACE FUNCTION public.get_public_proposal(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', p.id,
    'proposal_number', p.proposal_number,
    'created_at', p.created_at,
    'valid_until', p.valid_until,
    'status', p.status,
    'total_amount', p.total_amount,
    'final_amount', p.final_amount,
    'discount_amount', p.discount_amount,
    'discount_percent', p.discount_percent,
    'notes', p.notes,
    'patient', jsonb_build_object(
      'full_name', pt.full_name,
      'phone', pt.phone
    ),
    'clinic', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'phone', c.phone,
      'email', c.email,
      'city', c.city,
      'state', c.state,
      'address', c.address,
      'primary_color', c.primary_color,
      'logo_url', c.logo_url
    ),
    'items', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'id', pi.id,
          'treatment_id', pi.treatment_id,
          'treatment_name', t.name,
          'quantity', pi.quantity,
          'unit_price', pi.unit_price,
          'num_sessions', t.num_sessions
        )
      ), '[]'::jsonb)
      FROM public.proposal_items pi
      LEFT JOIN public.treatments t ON t.id = pi.treatment_id
      WHERE pi.proposal_id = p.id
    )
  ) INTO v_result
  FROM public.proposals p
  LEFT JOIN public.patients pt ON pt.id = p.patient_id
  LEFT JOIN public.clinics c ON c.id = p.clinic_id
  WHERE p.id = p_proposal_id;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_public_proposal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_proposal(uuid) TO anon, authenticated, service_role;
