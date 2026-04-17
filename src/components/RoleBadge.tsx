import { cn } from '@/lib/utils';

const roleConfig: Record<string, { label: string; className: string }> = {
  admin: { label: 'Admin', className: 'bg-purple-100 text-purple-700 border-purple-200' },
  sales: { label: 'Vendas', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  professional: { label: 'Profissional', className: 'bg-green-100 text-green-700 border-green-200' },
  receptionist: { label: 'Recepção', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  owner: { label: 'Proprietário', className: 'bg-amber-100 text-amber-700 border-amber-200' },
};

interface RoleBadgeProps {
  role: string;
  className?: string;
}

export function RoleBadge({ role, className }: RoleBadgeProps) {
  const config = roleConfig[role] || { label: role, className: 'bg-muted text-muted-foreground border-border' };
  return (
    <span className={cn(
      'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold',
      config.className,
      className
    )}>
      {config.label}
    </span>
  );
}
