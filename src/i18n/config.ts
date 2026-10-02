/**
 * Locale registry.
 *
 * Adding a language means adding it here and dropping a matching JSON file
 * next to the others. No component ever branches on a locale string, so
 * nothing else has to change.
 */

export const LOCALES = ['zh-CN', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'zh-CN';

/** Language names in their own script, for the language switcher. */
export const LOCALE_LABELS: Readonly<Record<Locale, string>> = {
  'zh-CN': '简体中文',
  en: 'English',
};

/** Narrow an arbitrary route segment to a supported locale. */
export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Pick the best supported locale from a raw `Accept-Language` header.
 *
 * Matching degrades from exact tag, to primary subtag, to the default, so
 * `en-GB` still resolves to `en`.
 */
export function resolveLocaleFromHeader(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;

  const entries = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((param) => param.trim().startsWith('q='));
      const quality = qParam ? Number(qParam.split('=')[1]) : 1;
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((entry) => entry.tag.length > 0 && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of entries) {
    const exact = LOCALES.find((locale) => locale.toLowerCase() === tag);
    if (exact) return exact;
  }

  for (const { tag } of entries) {
    const primary = tag.split('-')[0];
    const partial = LOCALES.find((locale) => locale.toLowerCase().split('-')[0] === primary);
    if (partial) return partial;
  }

  return DEFAULT_LOCALE;
}
