import { Copy, Download, FileText, Loader2, MessageCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BrandButton } from '@/components/ui/brand-button';
import { useToast } from '@/hooks/use-toast';
import { whatsappLink } from '@/lib/proposals/sale';

export type WhatsAppSend = {
  title: string;
  phone: string | null;
  status: 'preparing' | 'ready' | 'error';
  message: string;
  pdfFile?: File | null;
  error?: string;
};

const download = (file: File) => {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const canShareFile = (file: File | null | undefined) =>
  !!file && typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [file] });

/** Mostra a mensagem pronta (e o PDF, se houver) e envia pelo WhatsApp com um toque. */
export function WhatsAppSendDialog({ send, onClose, onSent }: { send: WhatsAppSend | null; onClose: () => void; onSent?: () => void }) {
  const { toast } = useToast();
  const attach = canShareFile(send?.pdfFile);

  const deliver = async () => {
    if (!send || send.status !== 'ready') return;
    if (!send.phone && !attach) { toast({ title: 'Sem WhatsApp cadastrado', description: 'Copie a mensagem e envie pelo seu WhatsApp.', variant: 'destructive' }); return; }
    let delivered = false;
    if (attach && send.pdfFile) {
      try {
        await navigator.share({ files: [send.pdfFile], text: send.message });
        delivered = true;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    if (!delivered) {
      if (send.pdfFile) download(send.pdfFile);
      window.open(whatsappLink(send.phone, send.message), '_blank', 'noopener,noreferrer');
    }
    onSent?.();
    onClose();
  };

  return (
    <Dialog open={!!send} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{send?.title}</DialogTitle>
          <DialogDescription>
            {send?.pdfFile && !attach
              ? 'Neste computador o WhatsApp não aceita anexo automático: ao enviar, a conversa abre com a mensagem e o PDF é baixado para você arrastar.'
              : 'Confira a mensagem e envie.'}
          </DialogDescription>
        </DialogHeader>
        {!send || send.status === 'preparing' ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Preparando…</p>
        ) : send.status === 'error' ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-destructive">{send.error || 'Não foi possível preparar o envio.'}</p>
            <BrandButton variant="outline" onClick={onClose}>Fechar</BrandButton>
          </div>
        ) : (
          <div className="space-y-3">
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border bg-muted/40 p-3 font-sans text-sm leading-relaxed text-foreground">{send.message}</pre>
            {send.pdfFile && (
              <div className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{send.pdfFile.name}</span></span>
                <button type="button" onClick={() => send.pdfFile && download(send.pdfFile)} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <Download className="h-3.5 w-3.5" /> Baixar
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr]">
              <BrandButton variant="outline" onClick={async () => {
                try { await navigator.clipboard.writeText(send.message); toast({ title: 'Mensagem copiada' }); }
                catch { toast({ title: 'Não foi possível copiar', variant: 'destructive' }); }
              }}>
                <Copy className="h-4 w-4" /> Copiar mensagem
              </BrandButton>
              <BrandButton onClick={deliver}><MessageCircle className="h-4 w-4" /> Enviar pelo WhatsApp</BrandButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
