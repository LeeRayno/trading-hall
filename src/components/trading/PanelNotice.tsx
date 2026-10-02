'use client';

import type { ReactNode } from 'react';

interface PanelNoticeProps {
  children: ReactNode;
  tone?: 'down';
  /** Pinned to the bottom for panels whose content reads upward. */
  position?: 'top' | 'bottom';
}

/**
 * Non-blocking overlay for transient module state.
 *
 * It does not capture pointer events, so a notice never costs the user the
 * ability to keep working with whatever is underneath it.
 */
export function PanelNotice({ children, tone, position = 'top' }: PanelNoticeProps) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 flex justify-center p-2 ${
        position === 'bottom' ? 'bottom-0' : 'top-0'
      }`}
    >
      <span
        className={`rounded bg-panel/90 px-2 py-1 text-xs ${
          tone === 'down' ? 'text-down' : 'text-text-secondary'
        }`}
      >
        {children}
      </span>
    </div>
  );
}
