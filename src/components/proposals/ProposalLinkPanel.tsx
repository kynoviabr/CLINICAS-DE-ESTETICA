import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Ban, Eye, EyeOff, Link2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BrandButton } from '@/components/ui/brand-button';
import { useToast } from '@/hooks/use-toast';
import { createProposalLink, summarizeLinks } from '@/lib/proposals/publicLink';

const fmt = (iso: string) => format(new Date(iso), "dd/MM 'às' HH:mm", { locale: ptBR });

/** Link público da proposta: se o cliente abriu, copiar link novo, invalidar links. */
export default function ProposalLinkPanel({ proposalId }: { proposalId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = ['proposal-links', proposalId];

  const { data: rows = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from('proposal_links')
        .select('created_at, expires_at, revoked_at, first_opened_at, last_opened_at, open_count')
        .eq('proposal_id', proposalId).order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  const s = summarizeLinks(rows);

  const copy = useMutation({
    mutationFn: async () => {
      const { url, expiresAt } = await createProposalLink(proposalId);
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      return { url, expiresAt };
    },
    onSuccess: ({ expiresAt }) => {
      qc.invalidateQueries({ queryKey: key });
      toast({ title: 'Link copiado', description: `Vale até ${fmt(expiresAt)}.` });
    },
    onError: (e: Error) => toast({ title: 'Não foi possível gerar o link', description: e.message, variant: 'destructive' }),
  });

  const revoke = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('revoke_proposal_links', { p_proposal_id: proposalId });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: key });
      toast({ title: n ? 'Links invalidados' : 'Nenhum link ativo', description: n ? 'Os links enviados não abrem mais.' : undefined });
    },
    onError: (e: Error) => toast({ title: 'Não foi possível invalidar', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm">
        {s.lastOpened ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
        {s.lastOpened
          ? <span>Cliente abriu a proposta · última vez em {fmt(s.lastOpened)}{s.opens > 1 ? ` (${s.opens} vezes)` : ''}</span>
          : <span className="text-muted-foreground">{s.total ? 'Cliente ainda não abriu o link' : 'Nenhum link enviado ainda'}</span>}
      </div>
      {s.activeUntil && <p className="text-xs text-muted-foreground">Link ativo até {fmt(s.activeUntil)}.</p>}
      <div className="flex flex-wrap gap-2">
        <BrandButton variant="outline" size="sm" onClick={() => copy.mutate()} disabled={copy.isPending}>
          {copy.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Copiar link
        </BrandButton>
        {s.active > 0 && (
          <BrandButton variant="outline" size="sm" onClick={() => revoke.mutate()} disabled={revoke.isPending}>
            <Ban className="h-4 w-4" /> Invalidar links
          </BrandButton>
        )}
      </div>
    </div>
  );
}
