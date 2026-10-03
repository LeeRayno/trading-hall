/**
 * Theme selection.
 *
 * The theme lives on `<html data-theme="…">` rather than in React state. That
 * is what lets a plain CSS rule — and an inline script that runs before the
 * first paint — decide which palette is in force, so the document is never
 * briefly painted in the wrong one while the bundle loads.
 *
 * Everything that names the attribute or the storage key is here, including
 * the boot script, which is assembled from those same constants. A second
 * spelling of either string would be a copy that drifts silently: the failure
 * mode is a page that looks fine until someone clears their storage.
 *
 * Safe to import from a server component — nothing touches `document` until
 * one of these functions is called.
 */

export type Theme = 'light' | 'dark';

/** Attribute on the document element that every themed rule keys off. */
export const THEME_ATTRIBUTE = 'data-theme';

/** Namespaced so it cannot collide with anything else on the origin. */
export const THEME_STORAGE_KEY = 'trading-hall:theme';

/**
 * What the document wears before anything has been resolved.
 *
 * It is also the no-JavaScript answer: with the boot script blocked, the page
 * keeps the palette this project shipped with, which is the degradation that
 * costs the least.
 */
export const DEFAULT_THEME: Theme = 'dark';

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/** The theme currently applied to the document. */
export function getTheme(): Theme {
  const value = document.documentElement.getAttribute(THEME_ATTRIBUTE);
  return isTheme(value) ? value : DEFAULT_THEME;
}

/** What the operating system is asking for, right now. */
export function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

const listeners = new Set<() => void>();

/**
 * Subscribe to theme changes.
 *
 * The store is deliberately tiny — one string that lives in the DOM. Anything
 * larger would still have to write the attribute, which would make this a
 * second source of truth for the same fact.
 */
export function subscribeToTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Apply a theme to the document.
 *
 * `persist` is what separates "the user chose this" from "the system is asking
 * for this". A pinned choice is written to storage and then outranks the
 * system for good; an unpinned one is only ever the current answer.
 */
export function applyTheme(theme: Theme, { persist = false }: { persist?: boolean } = {}): void {
  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);

  if (persist) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Private mode, or storage disabled. The theme still applies for this
      // page view; it just will not be remembered, which is the honest
      // outcome rather than an error the user cannot act on.
    }
  }

  notify();
}

/** Flip to the other theme and remember it. */
export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next, { persist: true });
  return next;
}

/**
 * The script that runs before the first paint.
 *
 * Inline and synchronous, at the top of `<body>`: it has to have decided
 * before any themed pixel is drawn, and a module would arrive too late. There
 * is no Content-Security-Policy on this project, so an inline script is not
 * blocked; if one is ever added, this needs a nonce rather than deletion.
 *
 * It keeps the system listener attached for as long as nothing has been
 * chosen, so "following the system" means following it — a machine that
 * switches at sunset switches this page too. Reading storage inside `paint`
 * rather than caching it is what makes that safe: the moment a choice is
 * pinned, the listener stops having an opinion on its own.
 */
export const THEME_BOOT_SCRIPT = `(function () {
  var root = document.documentElement;
  var key = ${JSON.stringify(THEME_STORAGE_KEY)};
  var attr = ${JSON.stringify(THEME_ATTRIBUTE)};
  function chosen() {
    try {
      var held = window.localStorage.getItem(key);
      return held === 'light' || held === 'dark' ? held : null;
    } catch (error) {
      return null;
    }
  }
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  function paint() {
    var held = chosen();
    root.setAttribute(attr, held || (media && media.matches ? 'light' : 'dark'));
  }
  paint();
  if (media && media.addEventListener) media.addEventListener('change', paint);
})();`;
