import { Copy, Download, FileText, Loader2, MessageCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BrandButton } from '@/components/ui/brand-button';
import { useToast } from '@/hooks/use-toast';
import type { SendPrep } from './useProposalsPage';

type Props = {
  prep: SendPrep | null;
  onClose: () => void;
  onSend: () => void;
};

/** Envio da proposta: prepara PDF e link de aprovação, mostra a mensagem e envia com um clique. */
export function SendProposalDialog({ prep, onClose, onSend }: Props) {
  const { toast } = useToast();
  const first = prep?.clientName.trim().split(/\s+/)[0] || '';

  const download = () => {
    if (!prep?.pdfFile) return;
    const url = URL.createObjectURL(prep.pdfFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = prep.pdfFile.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <Dialog open={!!prep} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar proposta {prep?.proposal.proposal_number} para {first}</DialogTitle>
          <DialogDescription>
            {prep?.status === 'ready' && !prep.canAttach
              ? 'Neste computador o WhatsApp não aceita anexo automático: ao enviar, a conversa abre com a mensagem e o PDF é baixado para você arrastar.'
              : 'A mensagem vai com o PDF anexado e o link para a paciente ver e aprovar.'}
          </DialogDescription>
        </DialogHeader>

        {!prep || prep.status === 'preparing' ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Preparando o PDF e o link de aprovação…
          </p>
        ) : prep.status === 'error' ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-destructive">Não foi possível preparar a proposta: {prep.error}</p>
            <BrandButton variant="outline" onClick={onClose}>Fechar</BrandButton>
          </div>
        ) : (
          <div className="space-y-3">
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border bg-muted/40 p-3 font-sans text-sm leading-relaxed text-foreground">
              {prep.message}
            </pre>
            {prep.pdfFile && (
              <div className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{prep.pdfFile.name}</span>
                </span>
                <button type="button" onClick={download} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <Download className="h-3.5 w-3.5" /> Baixar
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr]">
              <BrandButton
                variant="outline"
                onClick={async () => {
                  try { await navigator.clipboard.writeText(prep.message); toast({ title: 'Mensagem copiada' }); }
                  catch { toast({ title: 'Não foi possível copiar', variant: 'destructive' }); }
                }}
              >
                <Copy className="h-4 w-4" /> Copiar mensagem
              </BrandButton>
              <BrandButton onClick={onSend}>
                <MessageCircle className="h-4 w-4" /> Enviar pelo WhatsApp
              </BrandButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
