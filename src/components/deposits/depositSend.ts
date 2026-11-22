import { supabase } from '@/integrations/supabase/client';
import { publicOrigin } from '@/lib/publicOrigin';
import { generateContractPDF } from '@/lib/contractPDF';
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
