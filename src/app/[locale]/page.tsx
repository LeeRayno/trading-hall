import { redirect } from 'next/navigation';

import { DEFAULT_SYMBOL } from '@/config/market';

/**
 * A bare locale URL has no pair to show, so send the visitor to the default
 * market for that locale.
 */
export default async function LocaleIndexPage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  redirect(`/${locale}/trade/${DEFAULT_SYMBOL}`);
}
