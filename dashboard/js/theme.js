/* ─── Theme toggle ───────────────────────────────────────────────
 * Three states: follow the system (the default), forced light, forced
 * dark. The choice is a display preference, so it is kept apart from
 * the financial state and survives an "erase everything".
 *
 * The no-flash application happens in an inline <head> script on each
 * page; this file only wires up the control and notifies listeners.
 * ──────────────────────────────────────────────────────────────── */

(() => {
  'use strict';

  const KEY = 'tsm.theme';
  const root = document.documentElement;
  const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

  const current = () => root.dataset.theme || (systemDark() ? 'dark' : 'light');

  function setTheme(next) {
    if (next === 'system') {
      delete root.dataset.theme;
      try { localStorage.removeItem(KEY); } catch { /* private mode */ }
    } else {
      root.dataset.theme = next;
      try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
    }
    document.dispatchEvent(new CustomEvent('tsm:themechange', { detail: { theme: current() } }));
  }

  const wire = () => {
    for (const button of document.querySelectorAll('.theme-toggle')) {
      button.addEventListener('click', () => {
        setTheme(current() === 'dark' ? 'light' : 'dark');
        button.setAttribute('aria-label',
          current() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once: true });
  } else {
    wire();
  }

  window.TSMTheme = { set: setTheme, current };
})();
