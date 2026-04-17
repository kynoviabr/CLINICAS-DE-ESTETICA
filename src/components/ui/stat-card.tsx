import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  variant?: 'default' | 'primary' | 'accent' | 'success';
}

const variantStyles = {
  default: 'bg-card',
  primary: 'gradient-primary text-primary-foreground',
  accent: 'gradient-accent text-accent-foreground',
  success: 'bg-success text-success-foreground',
};

const iconVariantStyles = {
  default: 'bg-secondary text-primary',
  primary: 'bg-primary-foreground/20 text-primary-foreground',
  accent: 'bg-accent-foreground/20 text-accent-foreground',
  success: 'bg-success-foreground/20 text-success-foreground',
};

export function StatCard({ title, value, subtitle, icon: Icon, trend, variant = 'default' }: StatCardProps) {
  return (
    <div className={cn(
      'rounded-xl p-5 shadow-card transition-all hover:shadow-card-hover animate-fade-in',
      variantStyles[variant]
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', iconVariantStyles[variant])}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <span className={cn(
            'text-xs font-semibold px-2 py-0.5 rounded-full',
            trend.value >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
          )}>
            {trend.value >= 0 ? '+' : ''}{trend.value}%
          </span>
        )}
      </div>
      <p className={cn('text-sm font-medium mb-1', variant === 'default' ? 'text-muted-foreground' : 'opacity-80')}>
        {title}
      </p>
      <p className="text-2xl font-bold">{value}</p>
      {subtitle && (
        <p className={cn('text-xs mt-1', variant === 'default' ? 'text-muted-foreground' : 'opacity-70')}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
