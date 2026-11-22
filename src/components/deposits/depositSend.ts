import { supabase } from '@/integrations/supabase/client';
import { publicOrigin } from '@/lib/publicOrigin';
import { generateContractPDF } from '@/lib/contractPDF';
import { loadClinicLetterhead } from '@/hooks/useClinicLetterhead';
import type { DocumentOutput } from '@/lib/documents/output';
import { loadAcceptancesSafe } from '@/lib/documents/acceptances';
import {
  buildDepositReceiptHtml, depositReceiptMessage, depositRequestMessage, depositUrl, receiptDataFromPublic, type DepositPublic,
} from '@/lib/finance/deposit';

/** Código novo do link do sinal (o anterior deixa de valer) e os dados que a cliente vê. */
async function linkAndData(depositId: string, token?: string) {
  let t = token;
  if (!t) {
    const { data, error } = await supabase.rpc('deposit_link', { p_deposit_id: depositId });
    if (error) throw error;
    t = (data as { token: string }).token;
  }
  const { data, error } = await supabase.rpc('deposit_public', { p_token: t });
  if (error) throw error;
  return { token: t, pub: data as unknown as DepositPublic, url: depositUrl(publicOrigin(), t) };
}

/** Mensagem de cobrança do sinal (com o link do Pix). */
export async function prepareDepositRequest(depositId: string, clientName: string, token?: string) {
  const { pub, url } = await linkAndData(depositId, token);
  if (!pub.appointment) throw new Error('Agendamento do sinal não encontrado.');
  return depositRequestMessage({
    clientName, clinicName: pub.clinic?.name || 'clínica', amount: Number(pub.amount || 0),
    startTime: pub.appointment.start_time, kind: pub.appointment.kind, treatment: pub.appointment.treatment,
    url, dueAt: pub.due_at ?? null, noticeHours: Number(pub.notice_hours ?? 24),
  });
}

/** Recibo em PDF + mensagem. O mesmo recibo fica no link para a cliente baixar. */
export async function prepareDepositReceipt(depositId: string, clientName: string, token?: string) {
  const { pub, url } = await linkAndData(depositId, token);
  const data = receiptDataFromPublic(pub);
  if (!data || !pub.appointment) throw new Error('Este sinal ainda não tem recibo.');
  const blob = await generateContractPDF(buildDepositReceiptHtml(data));
  const pdfFile = new File([blob], `Recibo-${data.number}.pdf`, { type: 'application/pdf' });
  const message = depositReceiptMessage({
    clientName, amount: data.amount, startTime: pub.appointment.start_time, kind: pub.appointment.kind,
    treatment: pub.appointment.treatment, noticeHours: data.noticeHours, url, pdfAttached: true,
  });
  return { message, pdfFile };
}

/**
 * Recibo para "Baixar PDF" e "Imprimir" na tela da clínica. Lê direto do banco (sem gerar link novo),
 * para não invalidar o link que a cliente já recebeu.
 */
export async function depositReceiptDocument(depositId: string): Promise<DocumentOutput> {
  const { data: dep, error } = await supabase.from('appointment_deposits').select('*').eq('id', depositId).single();
  if (error) throw error;
  if (!dep.receipt_number || !dep.paid_at) throw new Error('Este sinal ainda não tem recibo.');
  const { data: appt, error: apptError } = await supabase.from('appointments')
    .select('start_time, appointment_type, treatment_id, professional_id').eq('id', dep.appointment_id).single();
  if (apptError) throw apptError;
  const person = async (table: 'patients' | 'leads', id: string | null) =>
    id ? (await supabase.from(table).select('full_name').eq('id', id).maybeSingle()).data?.full_name ?? null : null;
  const professionalName = async (id: string | null) => {
    if (!id) return null;
    const { data } = await supabase.from('professionals').select('id, full_name').or(`id.eq.${id},user_id.eq.${id}`).limit(2);
    return (data || []).sort((a, b) => Number(b.id === id) - Number(a.id === id))[0]?.full_name ?? null;
  };
  const [clinic, patient, lead, treatment, professional, confirmedBy] = await Promise.all([
    loadClinicLetterhead(dep.clinic_id),
    person('patients', dep.patient_id),
    person('leads', dep.lead_id),
    appt.treatment_id ? supabase.from('treatments').select('name').eq('id', appt.treatment_id).maybeSingle().then((r) => r.data?.name ?? null) : null,
    professionalName(appt.professional_id),
    dep.confirmed_by ? supabase.from('professionals').select('full_name').eq('user_id', dep.confirmed_by).limit(1).maybeSingle().then((r) => r.data?.full_name ?? null) : null,
  ]);
  const acceptances = await loadAcceptancesSafe(['deposit_policy', 'deposit_receipt'], dep.id);
  const accepted = dep.policy_accepted as { at?: string; ip?: string; user_agent?: string } | null;
  const html = buildDepositReceiptHtml({
    clinic,
    number: dep.receipt_number,
    amount: Number(dep.amount || 0),
    paidAt: dep.paid_at,
    payerName: dep.payer_name || patient || lead || '—',
    payerCpf: dep.payer_cpf,
    clientName: patient || lead || '—',
    kind: appt.appointment_type,
    treatment,
    startTime: appt.start_time,
    professional,
    noticeHours: Number(dep.notice_hours ?? 24),
    creditDays: Number(dep.credit_days ?? 90),
    policyAcceptedAt: accepted?.at ?? null,
    policyAcceptedIp: accepted?.ip ?? null,
    policyAcceptedUserAgent: accepted?.user_agent ?? null,
    confirmedBy,
    acceptances: acceptances?.records,
  });
  return { html, title: `Recibo ${dep.receipt_number}`, filename: `Recibo-${dep.receipt_number}` };
}
