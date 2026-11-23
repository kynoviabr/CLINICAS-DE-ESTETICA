import { cn } from '@/lib/utils';

/** Ícone da Kynovia Estética (o "K" do logo). O nome fica ao lado, em texto. */
export function BrandIcon({ className }: { className?: string }) {
  return <img src="/brand/icon-192.png" alt="" aria-hidden="true" className={cn('h-9 w-9 shrink-0 rounded-btn object-cover shadow-glow', className)} />;
}
