import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui';

/** A card with an icon tile and title in its header (detail pages). */
export function SectionCard({
  icon: Icon,
  title,
  titleId,
  actions,
  children,
  className = '',
  dense = false,
}: {
  icon: LucideIcon;
  title: string;
  /** Lets a surrounding region be labelled by the heading. */
  titleId?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Smaller icon and title on phones (dashboard cards). */
  dense?: boolean;
}) {
  return (
    <Card className={`p-3.5 sm:p-5 ${className}`}>
      <div
        className={`flex flex-wrap items-center ${dense ? 'mb-2.5 gap-x-2' : 'mb-3 gap-x-2.5'} gap-y-2 sm:mb-3 sm:gap-x-3`}
      >
        <span
          className={`flex shrink-0 ${dense ? 'h-8 w-8 sm:h-9 sm:w-9' : 'h-9 w-9'} items-center justify-center rounded-lg bg-blue-50 text-brand-navy ring-1 ring-blue-100`}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        {/* Title takes the free space; the actions move to the next line only if they can't fit. */}
        <h2
          id={titleId}
          className={`min-w-0 font-bold text-brand-navy sm:text-base ${dense ? 'flex-[1_1_4rem] text-sm leading-tight' : 'flex-auto text-[15px]'}`}
        >
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
