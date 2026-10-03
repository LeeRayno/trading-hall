/**
 * Dictionary loading.
 *
 * `en.json` is typed against `zh-CN.json`, so a key added to one language and
 * forgotten in the other is a build error rather than a blank label.
 *
 * The two files live under `locales/` to keep them apart from the code that
 * reads them: this directory is four source files that change when the
 * behaviour changes, and a growing pile of translations that changes whenever
 * a word does.
 */

import { DEFAULT_LOCALE, type Locale } from './config';
import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';

/** Shape of the reference dictionary. */
export type Dictionary = typeof zhCN;

const DICTIONARIES: Readonly<Record<Locale, Dictionary>> = {
  'zh-CN': zhCN,
  en,
};

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}
