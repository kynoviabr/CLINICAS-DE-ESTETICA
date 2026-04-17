import * as React from 'react';
import { cn } from '@/lib/utils';

type BadgeStatus = 'active' | 'paid' | 'pending' | 'overdue' | 'cancelled' | 'completed' | 'draft' | 'sent' | 'scheduled' | 'confirmed' | 'no_show' | 'in_progress' | 'approved' | 'rejected' | 'expired' | 'signed' | 'default';

interface BrandBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: BadgeStatus;
}

const statusStyles: Record<BadgeStatus, string> = {
  active: 'bg-success/15 text-success border-success/20',
  paid: 'bg-success/15 text-success border-success/20',
  completed: 'bg-success/15 text-success border-success/20',
  confirmed: 'bg-success/15 text-success border-success/20',
  approved: 'bg-success/15 text-success border-success/20',
  signed: 'bg-success/15 text-success border-success/20',
  pending: 'bg-warning/15 text-warning border-warning/20',
  scheduled: 'bg-info/15 text-info border-info/20',
  in_progress: 'bg-info/15 text-info border-info/20',
  sent: 'bg-info/15 text-info border-info/20',
  draft: 'bg-muted text-muted-foreground border-border',
  overdue: 'bg-destructive/15 text-destructive border-destructive/20',
  cancelled: 'bg-destructive/15 text-destructive border-destructive/20',
  no_show: 'bg-destructive/15 text-destructive border-destructive/20',
  rejected: 'bg-destructive/15 text-destructive border-destructive/20',
  expired: 'bg-warning/15 text-warning border-warning/20',
  default: 'bg-primary/10 text-primary border-primary/20',
};

const statusLabels: Record<BadgeStatus, string> = {
  active: 'Ativo',
  paid: 'Pago',
  completed: 'Concluído',
  confirmed: 'Confirmado',
  approved: 'Aprovada',
  signed: 'Assinado',
  pending: 'Pendente',
  scheduled: 'Agendado',
  in_progress: 'Em andamento',
  sent: 'Enviada',
  draft: 'Rascunho',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
  no_show: 'Não compareceu',
  rejected: 'Reprovada',
  expired: 'Expirada',
  default: '',
};

const BrandBadge = React.forwardRef<HTMLSpanElement, BrandBadgeProps>(
  ({ className, status = 'default', children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
          statusStyles[status] || statusStyles.default,
          className
        )}
        {...props}
      >
        {children || statusLabels[status] || status}
      </span>
    );
  }
);
BrandBadge.displayName = 'BrandBadge';

export { BrandBadge };
export type { BadgeStatus };
