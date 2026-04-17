import { BrandBadge, type BadgeStatus } from '@/components/ui/brand-badge';

export const processStatusMap: Record<string, { label: string; badge: BadgeStatus }> = {
  pending_upload: { label: 'Aguardando Upload', badge: 'pending' },
  pending_confirmation: { label: 'Confirmar Upload', badge: 'pending' },
  overdue: { label: 'Atrasado', badge: 'cancelled' },
  confirmed: { label: 'Confirmado', badge: 'approved' },
  cancelled: { label: 'Cancelado', badge: 'cancelled' },
};

export function ContractStatusBadge({ status }: { status: string }) {
  const sm = processStatusMap[status] || { label: status, badge: 'default' as BadgeStatus };
  return <BrandBadge status={sm.badge}>{sm.label}</BrandBadge>;
}
