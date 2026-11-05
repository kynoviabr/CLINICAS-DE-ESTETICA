import { supabase } from '@/integrations/supabase/client';
import { findPatientDuplicates, pickExistingPatient } from '@/lib/patients/duplicates';
import { onlyDigits } from '@/lib/patients/validation';
import { proposalNumber, saleTotal, type SaleItem } from '@/lib/proposals/sale';

export interface LeadForSale {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  patient_id: string | null;
}

/** Interessada vira cliente (ou é ligada à cliente que já tem o mesmo CPF). */
export async function ensurePatientFromLead(clinicId: string, lead: LeadForSale): Promise<string> {
  if (lead.patient_id) return lead.patient_id;
  const duplicates = (lead.cpf || lead.phone)
    ? await findPatientDuplicates(clinicId, lead.cpf, lead.phone)
    : [];
  let patientId = pickExistingPatient(duplicates, !!onlyDigits(lead.cpf));
  if (!patientId) {
    const { data, error } = await supabase.from('patients').insert({
      clinic_id: clinicId,
      full_name: lead.full_name,
      phone: lead.phone,
      email: lead.email,
      cpf: onlyDigits(lead.cpf) || null,
      status: 'active',
      is_self_payer: true,
    }).select('id').single();
    if (error) throw error;
    patientId = data.id;
  }
  const { error: leadError } = await supabase.from('leads').update({ patient_id: patientId }).eq('clinic_id', clinicId).eq('id', lead.id);
  if (leadError) throw leadError;
  return patientId;
}

export interface CreateSaleInput {
  clinicId: string;
  userId: string | null;
  patientId: string;
  leadId?: string | null;
  items: SaleItem[];
  notesPayload: string | null;
  validUntil: string | null;
  /** true = cliente fechou na hora (proposta já aprovada, segue para o contrato). */
  closeNow: boolean;
}

/** Cria a proposta da venda e atualiza o funil da interessada. */
export async function createSale(input: CreateSaleInput) {
  if (input.items.length === 0) throw new Error('Adicione ao menos um tratamento.');
  const total = saleTotal(input.items);
  const { data: proposal, error } = await supabase.from('proposals').insert({
    clinic_id: input.clinicId,
    patient_id: input.patientId,
    proposal_number: proposalNumber(),
    total_amount: total,
    final_amount: total,
    notes: input.notesPayload,
    valid_until: input.validUntil,
    created_by: input.userId,
    status: input.closeNow ? 'accepted' : 'sent',
  }).select('id, proposal_number, final_amount').single();
  if (error) throw error;

  const { error: itemsError } = await supabase.from('proposal_items').insert(
    input.items.map((item) => ({
      proposal_id: proposal.id,
      treatment_id: item.treatment_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.quantity * item.unit_price,
    })),
  );
  if (itemsError) {
    await supabase.from('proposals').delete().eq('id', proposal.id);
    throw itemsError;
  }

  // Funil: a interessada desta cliente avança (a escolhida ou a que estiver aberta).
  let leadId = input.leadId ?? null;
  if (!leadId) {
    const { data: openLead } = await supabase.from('leads').select('id')
      .eq('clinic_id', input.clinicId).eq('patient_id', input.patientId)
      .not('kanban_stage', 'in', '(closed_won,closed_lost)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    leadId = openLead?.id ?? null;
  }
  if (leadId) {
    await supabase.from('leads').update({
      patient_id: input.patientId,
      proposal_id: proposal.id,
      kanban_stage: input.closeNow ? 'closed_won' : 'proposal_sent',
      ...(input.closeNow ? { converted_at: new Date().toISOString() } : {}),
    }).eq('clinic_id', input.clinicId).eq('id', leadId);
  }

  return proposal;
}
