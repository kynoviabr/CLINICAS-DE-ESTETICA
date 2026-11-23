import { supabase } from '@/integrations/supabase/client';
import { acceptanceFromRow, type AcceptanceRecord } from '@/lib/documents/signatureSheet';

export type DocumentKind = 'proposal' | 'contract' | 'anamnese' | 'deposit_policy' | 'deposit_receipt' | 'lead_signup' | 'consent_term';
type Row = Parameters<typeof acceptanceFromRow>[0] & { document_hash?: string | null };

export type AcceptanceSheetData = { records: AcceptanceRecord[]; documentHash: string | null };

const toResult = (rows: Row[]): AcceptanceSheetData => ({
  records: rows.map(acceptanceFromRow),
  documentHash: rows.find((r) => r.document_hash)?.document_hash ?? null,
});

/** Aceites de um documento (tela da clínica). Aceita mais de um tipo (ex.: condições e recibo do sinal). */
export async function loadAcceptances(kind: DocumentKind | DocumentKind[], documentId: string): Promise<AcceptanceSheetData> {
  const kinds = Array.isArray(kind) ? kind : [kind];
  const { data, error } = await supabase.from('document_acceptances')
    .select('document_kind, signer_name, accepted_at, method, verified_by, ip, user_agent, phone, geo, verification_code, document_hash, signature_image, staff_user_id')
    .in('document_kind', kinds).eq('document_id', documentId).order('accepted_at');
  if (error) throw error;
  const rows = (data || []) as Array<Row & { staff_user_id?: string | null }>;
  const staffIds = [...new Set(rows.map((r) => r.staff_user_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (staffIds.length) {
    const { data: pros } = await supabase.from('professionals').select('user_id, full_name').in('user_id', staffIds);
    (pros || []).forEach((p) => { if (p.user_id) names.set(p.user_id, p.full_name); });
  }
  return toResult(rows.map((r) => ({ ...r, staff_name: r.staff_user_id ? names.get(r.staff_user_id) ?? null : null })));
}

/** Aceites do documento aberto pelo link da cliente ("deposit" traz condições e recibo do sinal). */
export async function loadPublicAcceptances(kind: 'proposal' | 'contract' | 'deposit', token: string): Promise<AcceptanceSheetData> {
  const { data, error } = await supabase.rpc('document_acceptance_sheet', { p_kind: kind, p_token: token });
  if (error) throw error;
  return toResult((Array.isArray(data) ? data : []) as unknown as Row[]);
}

/** Igual a loadAcceptances, mas sem derrubar o PDF se o registro não puder ser lido. */
export async function loadAcceptancesSafe(kind: DocumentKind | DocumentKind[], documentId: string): Promise<AcceptanceSheetData | null> {
  try { return await loadAcceptances(kind, documentId); } catch { return null; }
}
