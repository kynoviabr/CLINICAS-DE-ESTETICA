-- 1. Create contract_templates table
CREATE TABLE IF NOT EXISTS public.contract_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  content_html TEXT NOT NULL CHECK (char_length(trim(content_html)) > 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  legal_reviewed_at TIMESTAMPTZ,
  legal_reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  legal_review_notes TEXT,
  CONSTRAINT contract_templates_clinic_version_key UNIQUE (clinic_id, version)
);

-- Unique index for active template
DROP INDEX IF EXISTS idx_active_template;
CREATE UNIQUE INDEX idx_active_template ON public.contract_templates (clinic_id) WHERE status = 'active';

-- Trigger for updated_at on contract_templates
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_contract_templates_updated_at ON public.contract_templates;
CREATE TRIGGER set_contract_templates_updated_at
BEFORE UPDATE ON public.contract_templates
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_templates TO authenticated;
GRANT SELECT ON public.user_roles, public.patients, public.patient_users TO authenticated;

-- Policies for contract_templates
DROP POLICY IF EXISTS "Admins can manage contract templates" ON public.contract_templates;
DROP POLICY IF EXISTS "Admins can select contract templates" ON public.contract_templates;
CREATE POLICY "Admins can select contract templates" ON public.contract_templates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.clinic_id = contract_templates.clinic_id 
      AND ur.role = 'admin' 
      AND ur.is_active = true
    )
  );

DROP POLICY IF EXISTS "Admins can insert contract templates" ON public.contract_templates;
CREATE POLICY "Admins can insert contract templates" ON public.contract_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.clinic_id = contract_templates.clinic_id 
      AND ur.role = 'admin' 
      AND ur.is_active = true
    )
  );

DROP POLICY IF EXISTS "Admins can update contract templates" ON public.contract_templates;
CREATE POLICY "Admins can update contract templates" ON public.contract_templates
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.clinic_id = contract_templates.clinic_id AND ur.role = 'admin' AND ur.is_active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.clinic_id = contract_templates.clinic_id AND ur.role = 'admin' AND ur.is_active = true)
  );

DROP POLICY IF EXISTS "Admins can delete contract templates" ON public.contract_templates;
CREATE POLICY "Admins can delete contract templates" ON public.contract_templates
  FOR DELETE TO authenticated
  USING (
    status = 'draft' AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.clinic_id = contract_templates.clinic_id AND ur.role = 'admin' AND ur.is_active = true)
  );

DROP POLICY IF EXISTS "Staff can view active templates" ON public.contract_templates;
CREATE POLICY "Staff can view active templates" ON public.contract_templates
  FOR SELECT TO authenticated
  USING (
    status = 'active' AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.clinic_id = contract_templates.clinic_id 
      AND ur.is_active = true
    )
  );

-- 2. Update contracts table
ALTER TABLE public.contracts 
  ADD COLUMN IF NOT EXISTS contract_template_id UUID REFERENCES public.contract_templates(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS contract_template_version INTEGER,
  ADD COLUMN IF NOT EXISTS template_snapshot_html TEXT,
  ADD COLUMN IF NOT EXISTS contract_data_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS document_hash TEXT,
  ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS issuance_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS contracts_clinic_issuance_key_key
  ON public.contracts (clinic_id, issuance_key)
  WHERE issuance_key IS NOT NULL;

-- 3. Atomic Activation RPC
CREATE OR REPLACE FUNCTION public.activate_contract_template(p_template_id UUID, p_clinic_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key BIGINT;
BEGIN
  -- Verify admin role
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.clinic_id = p_clinic_id 
    AND ur.role = 'admin' 
    AND ur.is_active = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem ativar modelos.';
  END IF;

  -- Advisory lock transacional
  v_lock_key := hashtextextended(p_clinic_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Ensure template belongs to clinic and is in draft
  IF NOT EXISTS (
    SELECT 1 FROM public.contract_templates 
    WHERE id = p_template_id AND clinic_id = p_clinic_id AND status = 'draft'
  ) THEN
    RAISE EXCEPTION 'Modelo inválido ou já ativado.';
  END IF;

  -- Archive currently active
  UPDATE public.contract_templates 
  SET status = 'archived' 
  WHERE clinic_id = p_clinic_id AND status = 'active';

  -- Activate new
  UPDATE public.contract_templates 
  SET status = 'active', activated_at = now() 
  WHERE id = p_template_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.activate_contract_template FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.activate_contract_template FROM anon;
GRANT EXECUTE ON FUNCTION public.activate_contract_template TO authenticated;

-- 3.b Atomic Duplicate/Create Version RPC
CREATE OR REPLACE FUNCTION public.duplicate_contract_template(p_source_template_id UUID, p_clinic_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_version INTEGER;
  v_new_id UUID;
  v_source RECORD;
  v_lock_key BIGINT;
BEGIN
  -- Verify admin role
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.clinic_id = p_clinic_id 
    AND ur.role = 'admin' 
    AND ur.is_active = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem criar modelos.';
  END IF;

  -- Advisory lock transacional baseado no hash do clinic_id para prevenir race conditions
  v_lock_key := hashtextextended(p_clinic_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Get source template
  SELECT * INTO v_source FROM public.contract_templates WHERE id = p_source_template_id AND clinic_id = p_clinic_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modelo base não encontrado.';
  END IF;

  -- Calculate next version atomically
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version FROM public.contract_templates WHERE clinic_id = p_clinic_id;

  INSERT INTO public.contract_templates (
    clinic_id, name, version, status, title, content_html, created_by
  ) VALUES (
    p_clinic_id, v_source.name, v_next_version, 'draft', v_source.title, v_source.content_html, auth.uid()
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.duplicate_contract_template FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.duplicate_contract_template FROM anon;
GRANT EXECUTE ON FUNCTION public.duplicate_contract_template TO authenticated;


-- 4. Immutability Trigger
CREATE OR REPLACE FUNCTION public.check_contract_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Definition of issued: generated_at and template_snapshot_html are populated.
  -- Once issued, core snapshot fields cannot be updated.
  IF OLD.generated_at IS NOT NULL AND OLD.template_snapshot_html IS NOT NULL THEN
    IF 
      NEW.contract_template_id IS DISTINCT FROM OLD.contract_template_id OR
      NEW.clinic_id IS DISTINCT FROM OLD.clinic_id OR
      NEW.patient_id IS DISTINCT FROM OLD.patient_id OR
      NEW.payer_id IS DISTINCT FROM OLD.payer_id OR
      NEW.proposal_id IS DISTINCT FROM OLD.proposal_id OR
      NEW.contract_number IS DISTINCT FROM OLD.contract_number OR
      NEW.issuance_key IS DISTINCT FROM OLD.issuance_key OR
      NEW.contract_template_version IS DISTINCT FROM OLD.contract_template_version OR
      NEW.template_snapshot_html IS DISTINCT FROM OLD.template_snapshot_html OR
      NEW.contract_data_snapshot IS DISTINCT FROM OLD.contract_data_snapshot OR
      NEW.generated_at IS DISTINCT FROM OLD.generated_at OR
      NEW.generated_by IS DISTINCT FROM OLD.generated_by OR
      NEW.document_hash IS DISTINCT FROM OLD.document_hash OR
      NEW.pdf_storage_path IS DISTINCT FROM OLD.pdf_storage_path
      OR NEW.template_html IS DISTINCT FROM OLD.template_html
    THEN
      RAISE EXCEPTION 'Violação de imutabilidade: Snapshot do contrato não pode ser alterado após emissão.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_contract_immutability ON public.contracts;
CREATE TRIGGER enforce_contract_immutability
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.check_contract_immutability();

-- 5. Seed initial template for existing clinics (Backfill)
DO $$
DECLARE
  c RECORD;
  base_html TEXT := '<h2>[MARCA D''ÁGUA: DOCUMENTO DE TESTE] Contrato de Prestação de Serviços Estéticos</h2>
<p><strong>[PENDENTE DE REVISÃO JURÍDICA]</strong> Este modelo necessita de homologação jurídica antes da utilização comercial.</p>

<p>Pelo presente instrumento particular, a clínica <strong>{{clinic.name}}</strong> (CNPJ: {{clinic.cnpj}}), localizada em {{clinic.address}}, {{clinic.city}} - {{clinic.state}}, telefone {{clinic.phone}}, doravante denominada CONTRATADA, e o(a) paciente <strong>{{patient.name}}</strong> (CPF: {{patient.cpf}}), residente em {{patient.address}}, nascido(a) em {{patient.birth_date}}, doravante denominado(a) CONTRATANTE.</p>

{{#if payer}}
<p>Comparece também como responsável financeiro <strong>{{payer.name}}</strong> (CPF: {{payer.cpf}}), nascido(a) em {{payer.birth_date}}, doravante denominado PAGADOR, assumindo responsabilidade solidária pelas obrigações financeiras.</p>
{{/if}}

<h3>Cláusula 1ª — Objeto do Contrato</h3>
<p>A CONTRATADA compromete-se a prestar os seguintes serviços estéticos:</p>
<ul>
  <li>Tratamento: {{treatments.summary}}</li>
  <li>Quantidade de Sessões: {{treatments.total_sessions}}</li>
  <li>Proposta/Orçamento Nº: {{proposal.number}}</li>
  <li>Anamnese Ref: {{anamnesis.number}}</li>
</ul>

<h3>Cláusula 2ª — Valor e Forma de Pagamento</h3>
<p>O valor total acordado para o tratamento é de <strong>{{payment.total_value}}</strong>.</p>
<p>Condição: {{payment.condition}}<br>Método(s): {{payment.methods}}<br>Parcelamento: {{payment.installments}}x<br>Vencimentos previstos: {{payment.due_dates}}</p>

<h3>Cláusula 3ª — Responsabilidades e Riscos</h3>
<p>A CONTRATADA compromete-se a aplicar as melhores técnicas disponíveis. O CONTRATANTE declara ciência de que os procedimentos estéticos são caracterizados como obrigação de meio e não de resultado garantido, devido a reações biológicas individuais. O CONTRATANTE compromete-se a informar na Anamnese qualquer condição de saúde e seguir as recomendações pós-procedimento.</p>

<h3>Cláusula 4ª — Cancelamento, Atraso e Reembolso</h3>
<p>Faltas e atrasos superiores a 15 minutos sem aviso prévio de 24h não configuram a sessão como realizada automaticamente, mas podem estar sujeitos a taxas de remarcação e prejudicar a evolução do tratamento. Em caso de desistência ou interrupção clínica, o cancelamento se dará de forma proporcional às sessões já realizadas, sendo facultada retenção de multa compensatória conforme CDC (Código de Defesa do Consumidor).</p>

<h3>Cláusula 5ª — Uso de Imagem (Opcional)</h3>
<p>A documentação fotográfica é parte integrante do registro clínico/assistencial. A divulgação pública dessas imagens dependerá de termo de autorização apartado e específico.</p>

<h3>Cláusula 6ª — Proteção de Dados (LGPD)</h3>
<p>Os dados pessoais coletados serão tratados exclusivamente para cumprimento das obrigações deste contrato e normativas de saúde (Lei 13.709/2018), garantindo-se o direito de acesso e revogação consentida.</p>

<h3>Cláusula 7ª — Menores e Incapazes</h3>
<p>Caso o paciente seja menor de idade, a assinatura do Responsável Legal/Pagador é condição indispensável para a validade do ato e início dos procedimentos.</p>

<h3>Assinaturas</h3>
<p>{{clinic.city}}, {{contract.date}}</p>

<br><br>
<p>____________________________________________<br>{{patient.name}} (Paciente/Contratante)</p>

{{#if payer}}
<br><br>
<p>____________________________________________<br>{{payer.name}} (Responsável Financeiro/Pagador)</p>
{{/if}}

<br><br>
<p>____________________________________________<br>{{clinic.name}} (Clínica/Contratada)</p>
';
BEGIN
  FOR c IN SELECT id FROM public.clinics LOOP
    -- Only insert if clinic has no templates
    IF NOT EXISTS (SELECT 1 FROM public.contract_templates WHERE clinic_id = c.id) THEN
      INSERT INTO public.contract_templates (clinic_id, name, version, status, title, content_html, legal_reviewed_at)
      VALUES (c.id, 'Contrato Padrão', 1, 'draft', 'Contrato de Prestação de Serviços (Teste)', base_html, NULL);
    END IF;
  END LOOP;
END;
$$;

-- 6. Backfill existing contracts
UPDATE public.contracts 
SET 
  template_snapshot_html = template_html,
  contract_data_snapshot = '{"origin": "legacy"}'::jsonb
WHERE template_snapshot_html IS NULL AND template_html IS NOT NULL;

-- 7. Update Storage Bucket Privacy and Policies
UPDATE storage.buckets SET public = false WHERE id = 'contracts';

-- Drop existing policies without exception block
DROP POLICY IF EXISTS "Public can read contracts" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read contracts" ON storage.objects;
DROP POLICY IF EXISTS "Clinic staff can manage contracts" ON storage.objects;
DROP POLICY IF EXISTS "Patients can view own contracts" ON storage.objects;
DROP POLICY IF EXISTS "Auth users view contracts storage" ON storage.objects;
DROP POLICY IF EXISTS "Auth users upload contracts storage" ON storage.objects;
DROP POLICY IF EXISTS "Staff views contracts storage" ON storage.objects;
DROP POLICY IF EXISTS "Staff uploads contracts storage" ON storage.objects;
DROP POLICY IF EXISTS "Staff updates contracts storage" ON storage.objects;
DROP POLICY IF EXISTS "Patient views own contracts storage" ON storage.objects;

-- Staff SELECT
CREATE POLICY "Staff SELECT contracts" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'contracts' AND 
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.patients p ON p.clinic_id = ur.clinic_id
      WHERE ur.user_id = auth.uid() AND ur.is_active = true
        AND ur.clinic_id::text = (storage.foldername(name))[1]
        AND p.id::text = (storage.foldername(name))[2]
    )
  );

-- Patient SELECT
CREATE POLICY "Patient SELECT contracts" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'contracts' AND 
    EXISTS (
      SELECT 1 FROM public.patient_users pu 
      WHERE pu.auth_user_id = auth.uid() 
      AND pu.status = 'active'
      AND pu.clinic_id::text = (storage.foldername(name))[1]
      AND pu.patient_id::text = (storage.foldername(name))[2]
    )
  );

-- Staff INSERT
CREATE POLICY "Staff INSERT contracts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contracts' AND 
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.patients p ON p.clinic_id = ur.clinic_id
      WHERE ur.user_id = auth.uid() AND ur.is_active = true
        AND ur.clinic_id::text = (storage.foldername(name))[1]
        AND p.id::text = (storage.foldername(name))[2]
    )
  );

-- Staff UPDATE
CREATE POLICY "Staff UPDATE contracts" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'contracts' AND 
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.patients p ON p.clinic_id = ur.clinic_id
      WHERE ur.user_id = auth.uid() AND ur.is_active = true
        AND ur.clinic_id::text = (storage.foldername(name))[1]
        AND p.id::text = (storage.foldername(name))[2]
    )
  )
  WITH CHECK (
    bucket_id = 'contracts' AND 
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.patients p ON p.clinic_id = ur.clinic_id
      WHERE ur.user_id = auth.uid() AND ur.is_active = true
        AND ur.clinic_id::text = (storage.foldername(name))[1]
        AND p.id::text = (storage.foldername(name))[2]
    )
  );

-- Staff DELETE
CREATE POLICY "Staff DELETE contracts" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'contracts' AND 
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.patients p ON p.clinic_id = ur.clinic_id
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin' AND ur.is_active = true
        AND ur.clinic_id::text = (storage.foldername(name))[1]
        AND p.id::text = (storage.foldername(name))[2]
    )
  );

-- 8. Provisioning RPC for new clinics
CREATE OR REPLACE FUNCTION public.provision_initial_contract_template(p_clinic_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_html TEXT := '<h2>[MARCA D''ÁGUA: DOCUMENTO DE TESTE] Contrato de Prestação de Serviços Estéticos</h2>
<p><strong>[PENDENTE DE REVISÃO JURÍDICA]</strong> Este modelo necessita de homologação jurídica antes da utilização comercial.</p>

<p>Pelo presente instrumento particular, a clínica <strong>{{clinic.name}}</strong> (CNPJ: {{clinic.cnpj}}), localizada em {{clinic.address}}, {{clinic.city}} - {{clinic.state}}, telefone {{clinic.phone}}, doravante denominada CONTRATADA, e o(a) paciente <strong>{{patient.name}}</strong> (CPF: {{patient.cpf}}), residente em {{patient.address}}, nascido(a) em {{patient.birth_date}}, doravante denominado(a) CONTRATANTE.</p>

{{#if payer}}
<p>Comparece também como responsável financeiro <strong>{{payer.name}}</strong> (CPF: {{payer.cpf}}), nascido(a) em {{payer.birth_date}}, doravante denominado PAGADOR, assumindo responsabilidade solidária pelas obrigações financeiras.</p>
{{/if}}

<h3>Cláusula 1ª — Objeto do Contrato</h3>
<p>A CONTRATADA compromete-se a prestar os seguintes serviços estéticos:</p>
<ul>
  <li>Tratamento: {{treatments.summary}}</li>
  <li>Quantidade de Sessões: {{treatments.total_sessions}}</li>
  <li>Proposta/Orçamento Nº: {{proposal.number}}</li>
  <li>Anamnese Ref: {{anamnesis.number}}</li>
</ul>

<h3>Cláusula 2ª — Valor e Forma de Pagamento</h3>
<p>O valor total acordado para o tratamento é de <strong>{{payment.total_value}}</strong>.</p>
<p>Condição: {{payment.condition}}<br>Método(s): {{payment.methods}}<br>Parcelamento: {{payment.installments}}x<br>Vencimentos previstos: {{payment.due_dates}}</p>

<h3>Cláusula 3ª — Responsabilidades e Riscos</h3>
<p>A CONTRATADA compromete-se a aplicar as melhores técnicas disponíveis. O CONTRATANTE declara ciência de que os procedimentos estéticos são caracterizados como obrigação de meio e não de resultado garantido, devido a reações biológicas individuais. O CONTRATANTE compromete-se a informar na Anamnese qualquer condição de saúde e seguir as recomendações pós-procedimento.</p>

<h3>Cláusula 4ª — Cancelamento, Atraso e Reembolso</h3>
<p>Faltas e atrasos superiores a 15 minutos sem aviso prévio de 24h não configuram a sessão como realizada automaticamente, mas podem estar sujeitos a taxas de remarcação e prejudicar a evolução do tratamento. Em caso de desistência ou interrupção clínica, o cancelamento se dará de forma proporcional às sessões já realizadas, sendo facultada retenção de multa compensatória conforme CDC (Código de Defesa do Consumidor).</p>

<h3>Cláusula 5ª — Uso de Imagem (Opcional)</h3>
<p>A documentação fotográfica é parte integrante do registro clínico/assistencial. A divulgação pública dessas imagens dependerá de termo de autorização apartado e específico.</p>

<h3>Cláusula 6ª — Proteção de Dados (LGPD)</h3>
<p>Os dados pessoais coletados serão tratados exclusivamente para cumprimento das obrigações deste contrato e normativas de saúde (Lei 13.709/2018), garantindo-se o direito de acesso e revogação consentida.</p>

<h3>Cláusula 7ª — Menores e Incapazes</h3>
<p>Caso o paciente seja menor de idade, a assinatura do Responsável Legal/Pagador é condição indispensável para a validade do ato e início dos procedimentos.</p>

<h3>Assinaturas</h3>
<p>{{clinic.city}}, {{contract.date}}</p>

<br><br>
<p>____________________________________________<br>{{patient.name}} (Paciente/Contratante)</p>

{{#if payer}}
<br><br>
<p>____________________________________________<br>{{payer.name}} (Responsável Financeiro/Pagador)</p>
{{/if}}

<br><br>
<p>____________________________________________<br>{{clinic.name}} (Clínica/Contratada)</p>
';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.contract_templates WHERE clinic_id = p_clinic_id) THEN
    INSERT INTO public.contract_templates (clinic_id, name, version, status, title, content_html, legal_reviewed_at)
    VALUES (p_clinic_id, 'Contrato Padrão', 1, 'draft', 'Contrato de Prestação de Serviços (Teste)', base_html, NULL);
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.provision_initial_contract_template(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provision_initial_contract_template(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.provision_initial_contract_template(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.provision_initial_contract_template(UUID) TO service_role;
