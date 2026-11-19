-- Resumo do que ficou na homolog depois do seed.
SELECT
  c.name AS clinica,
  (SELECT count(*) FROM public.user_roles r WHERE r.clinic_id = c.id AND r.is_active) AS equipe,
  (SELECT count(*) FROM public.treatments r WHERE r.clinic_id = c.id) AS tratamentos,
  (SELECT count(*) FROM public.leads r WHERE r.clinic_id = c.id) AS clientes_crm,
  (SELECT count(*) FROM public.patients r WHERE r.clinic_id = c.id) AS pacientes,
  (SELECT count(*) FROM public.contracts r WHERE r.clinic_id = c.id) AS contratos,
  (SELECT count(*) FROM public.appointments r WHERE r.clinic_id = c.id) AS agendamentos
FROM public.clinics c
WHERE c.slug IN ('teste-vive-estetica', 'teste-eras-estetica')
ORDER BY c.name;
