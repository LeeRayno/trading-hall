'use client';

/**
 * Locale context for client components.
 *
 * The dictionary is resolved on the server and handed down as a plain object,
 * so no translation payload is fetched from the browser and `t()` stays
 * synchronous.
 */

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';

import type { Locale } from './config';
import { DEFAULT_LOCALE } from './config';
import type { Dictionary } from './dictionaries';

interface I18nContextValue {
  locale: Locale;
  dictionary: Dictionary;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ locale, dictionary }), [locale, dictionary]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Resolve a dotted key such as `trade.orderBook` against the dictionary. */
function lookup(dictionary: Dictionary, key: string): string | undefined {
  const segments = key.split('.');
  let cursor: unknown = dictionary;

  for (const segment of segments) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }

  return typeof cursor === 'string' ? cursor : undefined;
}

export interface Translator {
  (key: string, vars?: Record<string, string | number>): string;
}

/**
 * Access the translator.
 *
 * A missing key resolves to the key itself: silently rendering an empty label
 * hides translation gaps, and this keeps them visible without throwing.
 */
export function useI18n(): { t: Translator; locale: Locale } {
  const context = useContext(I18nContext);
  const dictionary = context?.dictionary;
  const locale = context?.locale ?? DEFAULT_LOCALE;

  const t = useCallback<Translator>(
    (key, vars) => {
      const template = dictionary ? lookup(dictionary, key) : undefined;
      if (template === undefined) return key;

      if (!vars) return template;

      return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match,
      );
    },
    [dictionary],
  );

  return { t, locale };
}

/** Translator only, for components that do not need the locale itself. */
export function useTranslation(): Translator {
  return useI18n().t;
}
