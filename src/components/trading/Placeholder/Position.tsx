'use client';

import { useTranslation } from '@/i18n/I18nProvider';

/**
 * Account position module.
 *
 * Out of scope for this stage: it needs private account data, which the
 * project deliberately does not touch yet.
 */
export function Position() {
  const t = useTranslation();

  return (
    <section className="flex h-40 flex-col overflow-hidden rounded-md border border-border-subtle bg-panel">
      <h2 className="border-b border-border-subtle px-3 py-2 text-sm font-medium text-text-secondary">
        {t('trade.position')}
      </h2>
      <div className="flex flex-1 items-center justify-center">
        <span className="text-sm text-text-muted">{t('trade.comingSoon')}</span>
      </div>
    </section>
  );
}
