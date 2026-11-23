import { publicOrigin } from '@/lib/publicOrigin';
import { supabase } from '@/integrations/supabase/client';

/** Gera um link novo e seguro da proposta (código secreto, vale 15 dias). */
export async function createProposalLink(proposalId: string, origin = publicOrigin()) {
  const { data, error } = await supabase.rpc('create_proposal_link', { p_proposal_id: proposalId });
  if (error) throw error;
  const res = data as { token: string; expires_at: string };
  return { url: proposalLinkUrl(res.token, origin), token: res.token, expiresAt: res.expires_at };
}

export const proposalLinkUrl = (token: string, origin: string) => `${origin}/proposta/${token}`;

export type ProposalLinkError = 'invalid' | 'expired' | 'revoked';

/** Mensagem para o cliente quando o link não abre. */
export function proposalLinkErrorMessage(reason: string | undefined): string {
  if (reason === 'expired') return 'Este link venceu. Peça à clínica um novo link da sua proposta.';
  if (reason === 'revoked') return 'Este link foi substituído pela clínica. Peça o link mais recente.';
  return 'Link inválido. Verifique se ele foi copiado inteiro ou peça um novo à clínica.';
}

type LinkRow = { created_at: string; expires_at: string; revoked_at: string | null; first_opened_at: string | null; last_opened_at: string | null; open_count: number };

/** Resumo dos links de uma proposta para a equipe. */
export function summarizeLinks(rows: LinkRow[], now = new Date()) {
  const active = rows.filter((r) => !r.revoked_at && new Date(r.expires_at) > now);
  const opened = rows.filter((r) => r.first_opened_at);
  const lastOpened = opened.map((r) => r.last_opened_at || r.first_opened_at!).sort().at(-1) || null;
  const activeUntil = active.map((r) => r.expires_at).sort().at(-1) || null;
  return { total: rows.length, active: active.length, activeUntil, lastOpened, opens: rows.reduce((s, r) => s + (r.open_count || 0), 0) };
}
