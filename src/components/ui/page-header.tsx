import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

/**
 * Stripe-style page header.
 * Heading family + negative letter-spacing baked in via global h1 styles.
 */
export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-8 sm:gap-4">
      <div className="min-w-0 flex-1 basis-48 sm:basis-72">
        <h1 className="font-heading text-[1.6rem] leading-tight sm:text-[2rem] font-bold text-foreground">{title}</h1>
        {description && (
          <p className="mt-1.5 hidden max-w-2xl text-[15px] leading-relaxed text-[hsl(var(--text-secondary))] sm:block">
            {description}
          </p>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 [&>button]:h-10">{children}</div>}
    </div>
  );
}
