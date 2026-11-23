import { AlertTriangle } from 'lucide-react';

/** Tela mostrada quando uma página quebra, no lugar da tela branca. */
export default function ErrorFallback({ resetError }: { resetError?: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="text-lg font-semibold">Algo deu errado nesta tela</h1>
        <p className="text-sm text-muted-foreground">O erro já foi avisado à equipe Kynovia Estética. Tente de novo; se continuar, fale com o suporte.</p>
        <div className="flex gap-2">
          <button type="button" className="flex-1 rounded-md border px-3 py-2 text-sm" onClick={() => { window.location.href = '/'; }}>Ir para o início</button>
          <button type="button" className="flex-1 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => { resetError?.(); window.location.reload(); }}>Tentar de novo</button>
        </div>
      </div>
    </div>
  );
}
