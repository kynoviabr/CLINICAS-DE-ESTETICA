import { supabase } from '@/integrations/supabase/client';
import { acceptanceFromRow, type AcceptanceRecord } from '@/lib/documents/signatureSheet';

export type DocumentKind = 'proposal' | 'contract' | 'anamnese' | 'deposit_policy' | 'deposit_receipt' | 'lead_signup' | 'consent_term';
type Row = Parameters<typeof acceptanceFromRow>[0] & { document_hash?: string | null };

const toResult = (rows: Row[]) => ({
  records: rows.map(acceptanceFromRow) as AcceptanceRecord[],
  documentHash: rows.find((r) => r.document_hash)?.document_hash ?? null,
});

/** Aceites de um documento (tela da clínica). */
export async function loadAcceptances(kind: DocumentKind, documentId: string) {
  const { data, error } = await supabase.from('document_acceptances')
    .select('signer_name, accepted_at, method, verified_by, ip, user_agent, phone, geo, verification_code, document_hash')
    .eq('document_kind', kind).eq('document_id', documentId).order('accepted_at');
  if (error) throw error;
  return toResult((data || []) as Row[]);
}

/** Aceites do documento aberto pelo link da cliente. */
export async function loadPublicAcceptances(kind: 'proposal' | 'contract', token: string) {
  const { data, error } = await supabase.rpc('document_acceptance_sheet', { p_kind: kind, p_token: token });
  if (error) throw error;
  return toResult((Array.isArray(data) ? data : []) as unknown as Row[]);
}
