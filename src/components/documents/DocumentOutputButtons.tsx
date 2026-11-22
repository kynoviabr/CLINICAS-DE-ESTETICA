import { useState } from 'react';
import { Download, Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { BrandButton } from '@/components/ui/brand-button';
import { downloadDocumentPdf, isNativeApp, printDocument, type DocumentOutput } from '@/lib/documents/output';

type Props = {
  /** Monta o documento na hora do clique (pode buscar dados). */
  getDocument: () => DocumentOutput | Promise<DocumentOutput>;
  size?: 'sm' | 'md';
  variant?: 'outline' | 'ghost';
  className?: string;
  disabled?: boolean;
};

/** "Baixar PDF" e "Imprimir", iguais em todos os documentos. */
export function DocumentOutputButtons({ getDocument, size = 'sm', variant = 'outline', className, disabled }: Props) {
  const [busy, setBusy] = useState<'pdf' | 'print' | null>(null);

  const run = async (kind: 'pdf' | 'print') => {
    setBusy(kind);
    try {
      const doc = await getDocument();
      const result = kind === 'pdf' ? await downloadDocumentPdf(doc) : await printDocument(doc);
      if (result === 'downloaded' && kind === 'print') toast.success('PDF baixado. Abra o arquivo para imprimir.');
    } catch (e) {
      toast.error(kind === 'pdf' ? 'Não foi possível gerar o PDF.' : 'Não foi possível abrir a impressão.', {
        description: e instanceof Error && e.message ? e.message : 'Tente de novo.',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={className ?? 'flex flex-wrap gap-2'}>
      <BrandButton type="button" variant={variant} size={size} onClick={() => run('pdf')} disabled={disabled || !!busy}>
        {busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {busy === 'pdf' ? 'Gerando PDF…' : isNativeApp() ? 'Salvar PDF' : 'Baixar PDF'}
      </BrandButton>
      <BrandButton type="button" variant={variant} size={size} onClick={() => run('print')} disabled={disabled || !!busy}>
        {busy === 'print' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
        {busy === 'print' ? 'Preparando…' : 'Imprimir'}
      </BrandButton>
    </div>
  );
}
