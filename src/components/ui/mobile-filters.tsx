import { useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * No celular, esconde os filtros atrás de um botão "Filtros" (com quantos estão ativos).
 * No computador mostra tudo na linha, como antes.
 */
export function MobileFilters({ activeCount = 0, children, className }: { activeCount?: number; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={cn(
          'flex h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium sm:hidden',
          open || activeCount > 0 ? 'border-primary/50 bg-primary/5 text-primary' : 'border-input bg-background text-foreground',
        )}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filtros
        {activeCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{activeCount}</span>}
      </button>
      <div className={cn(open ? 'flex' : 'hidden', 'w-full flex-col gap-2 sm:flex sm:w-auto sm:flex-row sm:flex-wrap sm:items-center', className)}>
        {children}
      </div>
    </>
  );
}
