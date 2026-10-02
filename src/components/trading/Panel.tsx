'use client';

import type { ReactNode } from 'react';

import { useTranslation } from '@/i18n/I18nProvider';

interface PanelProps {
  title: string;
  /** Rendered at the right of the title bar, e.g. a selector for the panel. */
  actions?: ReactNode;
  /** Rendered under the title bar; empty panels show the pending notice. */
  children?: ReactNode;
  className?: string;
  /** Overrides the body layout, for modules that fill the frame themselves. */
  bodyClassName?: string;
}

/**
 * Framed section used by every module in the hall.
 *
 * The title bar is part of the shell so that a module can drop its content in
 * later without restyling the frame. The default body centres a placeholder;
 * a module that manages its own layout passes `bodyClassName` instead.
 */
export function Panel({ title, actions, children, className, bodyClassName }: PanelProps) {
  const t = useTranslation();

  return (
    <section
      className={`flex flex-col overflow-hidden rounded-md border border-border-subtle bg-panel ${className ?? ''}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-3 py-1.5">
        <h2 className="shrink-0 text-sm font-medium text-text-secondary">{title}</h2>
        {actions}
      </div>
      <div className={bodyClassName ?? 'flex flex-1 items-center justify-center p-4'}>
        {children ?? <span className="text-sm text-text-muted">{t('trade.comingSoon')}</span>}
      </div>
    </section>
  );
}
