/* ─── Anonymous usage counting ───────────────────────────────────
 *
 * Cloudflare Web Analytics. Cookieless, no fingerprinting, no
 * cross-site tracking, and it never sees anything the user types —
 * only that a page was opened.
 *
 * This exists to answer one question: which tools do people actually
 * use? Without that, every decision about what to build next is a
 * guess. It is the smallest possible amount of data that answers it.
 *
 * ── The honesty rule ──────────────────────────────────────────────
 * The site dares people to open DevTools and watch nothing leave.
 * That dare must stay winnable, so:
 *   • the beacon is the ONLY outbound request the tools make,
 *   • no financial figure is ever part of it,
 *   • the privacy panel names it out loud rather than burying it.
 * If this file ever grows to send anything the user entered, the
 * product's central claim breaks. Don't.
 *
 * ── Setup ─────────────────────────────────────────────────────────
 * dash.cloudflare.com → Web Analytics → Add a site → copy the token
 * out of the snippet it shows, and paste it below. Empty means no
 * beacon loads at all, which is the safe default.
 * ──────────────────────────────────────────────────────────────── */

(() => {
  'use strict';

  const BEACON_TOKEN = '';   // ← paste the Cloudflare token here

  // Expose it so the privacy panel can describe reality rather than a
  // hard-coded assumption about whether counting is switched on.
  window.TSMAnalytics = { enabled: Boolean(BEACON_TOKEN), vendor: 'Cloudflare' };

  if (!BEACON_TOKEN) return;

  // Respect an explicit "do not track" rather than counting anyway.
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') {
    window.TSMAnalytics.enabled = false;
    return;
  }

  const beacon = document.createElement('script');
  beacon.defer = true;
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.setAttribute('data-cf-beacon', JSON.stringify({ token: BEACON_TOKEN }));
  document.head.append(beacon);
})();
