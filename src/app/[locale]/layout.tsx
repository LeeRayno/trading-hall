import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { notFound } from 'next/navigation';

import '@/app/globals.css';
import { I18nProvider } from '@/i18n/I18nProvider';
import { LOCALES, isLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { THEME_BOOT_SCRIPT } from '@/lib/theme/theme';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

/**
 * Every route lives under `[locale]`, which makes this the root layout, so it
 * owns the document shell and sets `lang` for the active locale.
 */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const dictionary = getDictionary(locale);
  return {
    title: dictionary.meta.title,
    description: dictionary.meta.description,
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  // An unknown locale is a 404 rather than a silent fallback, so a bad link is
  // visible instead of quietly rendering the wrong language.
  if (!isLocale(locale)) notFound();

  const dictionary = getDictionary(locale);

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The theme attribute is written to this element by the script below,
      // before React hydrates — that is the whole point of the script. React
      // sees an attribute the server did not render and, without this, reports
      // a mismatch and re-renders the entire tree on the client, which costs
      // the page a full second pass and buries the real errors under a
      // hydration failure that is not one.
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* The theme, decided before anything has been painted. It cannot wait
            for hydration: the server has no idea what the user's system is set
            to, so a page that waited would show the dark palette for as long
            as the bundle takes to arrive, then switch — the flash is the one
            thing a theme script exists to prevent. First in the body means it
            runs before any themed element is even parsed. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <I18nProvider locale={locale} dictionary={dictionary}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
