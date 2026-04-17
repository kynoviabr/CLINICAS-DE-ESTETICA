import { Badge } from '@/components/ui/badge';

export type AnamneseStatusType = 'valid' | 'expired' | 'pending' | 'none' | 'in_progress' | 'filled' | 'validated' | 'cancelled' | 'archived';

const statusConfig: Record<string, { label: string; className: string }> = {
  valid: { label: 'Válida', className: 'bg-green-100 text-green-700 border-green-200' },
  validated: { label: 'Validada', className: 'bg-green-100 text-green-700 border-green-200' },
  filled: { label: 'Preenchida', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  expired: { label: 'Vencida', className: 'bg-red-100 text-red-700 border-red-200' },
  pending: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  in_progress: { label: 'Em andamento', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  cancelled: { label: 'Cancelada', className: 'bg-muted text-muted-foreground' },
  archived: { label: 'Arquivada', className: 'bg-muted text-muted-foreground' },
  none: { label: 'Sem anamnese', className: 'bg-red-50 text-red-500 border-red-200' },
};

export function AnamneseStatusBadge({ status }: { status: string | null | undefined }) {
  const key = status || 'none';
  const config = statusConfig[key] || statusConfig.none;
  return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
}
