'use client';

/**
 * The active theme, as a value React can depend on.
 *
 * The chart needs it: it draws to a canvas, which cannot read CSS custom
 * properties, so a theme change has to reach it as data rather than as style.
 * Everything else on the page is repainted by CSS alone and does not need the
 * hook — including the toggle itself, whose two icons are shown and hidden by
 * selectors, so the markup the server sends is already correct.
 *
 * `useSyncExternalStore` rather than reading in an effect and calling
 * `setState`: the value lives outside React and changes without React being
 * told, which is exactly the case this hook exists for. The effect-and-setState
 * version is also an error under this project's lint rules, and would paint one
 * frame with the wrong palette on every load.
 */

import { useSyncExternalStore } from 'react';

import { DEFAULT_THEME, getTheme, subscribeToTheme } from '@/lib/theme/theme';

/**
 * The server has no document to read, so it renders the default and React
 * swaps in the real value after hydration.
 *
 * This function must keep its identity across renders — a new one on every
 * render makes the subscription re-establish itself in a loop — so it is
 * declared once, at module scope, like `getTheme` it is passed alongside.
 */
function getServerTheme() {
  return DEFAULT_THEME;
}

export function useTheme() {
  return useSyncExternalStore(subscribeToTheme, getTheme, getServerTheme);
}
