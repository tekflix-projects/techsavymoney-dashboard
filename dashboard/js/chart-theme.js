/* ─── Chart theming ──────────────────────────────────────────────
 * Chart.js draws its chrome — grid lines, ticks, legend, the gaps
 * between doughnut slices — with fixed colours that assume a white
 * page. Those assumptions fall apart in dark mode, so the chrome is
 * pulled from the same CSS custom properties the rest of the site uses
 * and refreshed when the system theme flips.
 *
 * Data colours stay hard-coded in each tool: they identify a category,
 * so they should not move when the theme does.
 * ──────────────────────────────────────────────────────────────── */

(() => {
  'use strict';
  if (typeof Chart === 'undefined') return;

  const token = (name, fallback = '') =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme() {
    const dark = darkQuery.matches;

    Chart.defaults.color = token('--muted', '#6E7383');
    Chart.defaults.borderColor = dark ? 'rgba(255,255,255,0.08)' : 'rgba(20,22,28,0.06)';
    Chart.defaults.font.family = token('--font-sans', 'Inter, system-ui, sans-serif');
    Chart.defaults.font.size = 11.5;

    // Slice separators should match the card behind them, not always white.
    if (Chart.defaults.datasets?.doughnut) {
      Chart.defaults.datasets.doughnut.borderColor = token('--surface', '#fff');
      Chart.defaults.datasets.doughnut.borderWidth = 2;
    }

    Chart.defaults.plugins.tooltip.backgroundColor = dark ? '#1A1E27' : '#14161C';
    Chart.defaults.plugins.tooltip.titleColor = '#fff';
    Chart.defaults.plugins.tooltip.bodyColor = dark ? '#C7CCD6' : '#E7E3DB';
    Chart.defaults.plugins.tooltip.borderColor = dark ? 'rgba(255,255,255,0.10)' : 'transparent';
    Chart.defaults.plugins.tooltip.borderWidth = dark ? 1 : 0;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.displayColors = false;
  }

  applyTheme();

  const refresh = () => {
    applyTheme();
    // Each tool rebuilds its chart from scratch inside update().
    window.update?.();
  };

  darkQuery.addEventListener('change', refresh);
  // …and when the reader picks a theme explicitly.
  document.addEventListener('tsm:themechange', refresh);
})();
