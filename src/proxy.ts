/**
 * Locale routing.
 *
 * Requests without a locale prefix are redirected to one, chosen from the
 * browser's `Accept-Language` header. Locale handling is driven entirely by
 * the registry in `i18n/config`, so adding a language needs no change here.
 *
 * Note: this file is `proxy.ts` rather than `middleware.ts` — the middleware
 * file convention was renamed in this version of Next.js.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { LOCALES, resolveLocaleFromHeader } from '@/i18n/config';

/** Matches a language tag such as `en`, `zh-CN`, or `ja-JP`. */
const LOCALE_SHAPED_SEGMENT = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const hasLocale = LOCALES.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
  if (hasLocale) return NextResponse.next();

  const locale = resolveLocaleFromHeader(request.headers.get('accept-language'));
  const segments = pathname.split('/').filter(Boolean);

  // An unsupported language prefix replaces the locale rather than being kept,
  // so `/fr/trade/BTC-USDT` lands on a real page instead of nesting `fr`
  // inside the localized path.
  const [first, ...rest] = segments;
  const isUnsupportedLocale = first !== undefined && LOCALE_SHAPED_SEGMENT.test(first);
  const remainder = isUnsupportedLocale ? rest : segments;

  const url = request.nextUrl.clone();
  url.pathname = remainder.length === 0 ? `/${locale}` : `/${locale}/${remainder.join('/')}`;
  return NextResponse.redirect(url);
}

export const config = {
  /**
   * Skip API routes (the market data proxy must not be redirected), Next.js
   * internals, and anything that looks like a static file.
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)'],
};
