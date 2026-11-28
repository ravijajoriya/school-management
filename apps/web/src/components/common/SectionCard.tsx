import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui';

/** A card with an icon tile and title in its header (detail pages). */
export function SectionCard({
  icon: Icon,
  title,
  actions,
  children,
  className = '',
}: {
  icon: LucideIcon;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`p-3.5 sm:p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-2 sm:gap-x-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-brand-navy ring-1 ring-blue-100">
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        {/* Title takes the free space; the actions move to the next line only if they can't fit. */}
        <h2 className="min-w-0 flex-auto text-[15px] font-bold text-brand-navy sm:text-base">
          {title}
        </h2>
        {actions && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">{actions}</div>
        )}
      </div>
      {children}
    </Card>
  );
}
