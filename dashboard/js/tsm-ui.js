/* ─── TSM · Shared-State UI ──────────────────────────────────────
 *
 * The visible half of Layer 1:
 *   1. Hydrates each tool's empty fields from the shared store.
 *   2. Tells the user when that happened, with a one-click undo.
 *   3. Gives them a permanent, honest control over the data —
 *      where it lives, when it expires, and how to erase it.
 *
 * (3) is not optional garnish. The moment a tool starts remembering
 * financial figures, the user is owed a visible way to see and revoke
 * that. It is also the product's whole positioning, so it should be
 * on screen rather than buried in a privacy policy nobody opens.
 * ──────────────────────────────────────────────────────────────── */

(() => {
  'use strict';

  if (!window.TSM) {
    console.error('[TSM] store.js must load before tsm-ui.js');
    return;
  }

  const TOOL = document.body?.dataset.tool ?? null;

  /* ── Small DOM helpers (no innerHTML with dynamic values) ─────── */

  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v !== null && v !== undefined) {
        node.setAttribute(k, String(v));
      }
    }
    for (const child of children.flat()) {
      if (child == null) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  };

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const formatRemaining = (ms) => {
    if (ms == null) return null;
    const mins = Math.max(0, Math.round(ms / 60000));
    if (mins < 60) return `${plural(mins, 'minute')}`;
    const hours = Math.round(mins / 60);
    if (hours < 48) return `${plural(hours, 'hour')}`;
    return `${plural(Math.round(hours / 24), 'day')}`;
  };

  /* ── 1. Hydration + prefill banner ─────────────────────────────── */

  const undoPrefill = (fields) => {
    window.TSM.transact((store) => {
      for (const field of fields) {
        field.value = '';
        field.classList.remove('tsm-prefilled');
        if (field.dataset.tsmBucket) store.setBucket(field.dataset.tsmBucket, null);
        else if (field.dataset.tsm) store.set(field.dataset.tsm, null);
      }
    });
    window.update?.();
  };

  const showPrefillBanner = (fields) => {
    const anchor = document.querySelector('[data-tsm-banner]')
      ?? document.querySelector('.tool-header');
    if (!anchor) return;

    const banner = el('div', { class: 'tsm-banner', role: 'status' },
      el('span', { class: 'tsm-banner-icon', 'aria-hidden': 'true' }, '↩'),
      el('span', { class: 'tsm-banner-text' },
        el('strong', { text: `${plural(fields.length, 'field')} filled in` }),
        ' from numbers you entered in your other tools.'),
      el('button', {
        type: 'button',
        class: 'tsm-banner-undo',
        onClick: () => { undoPrefill(fields); banner.remove(); },
      }, 'Clear them'),
      el('button', {
        type: 'button',
        class: 'tsm-banner-close',
        'aria-label': 'Dismiss',
        onClick: () => banner.remove(),
      }, '×'),
    );
    anchor.after(banner);
  };

  /* ── 1b. Cross-tool summary strip ──────────────────────────────
   * The proof that these are one picture rather than five calculators:
   * figures computed from what you entered *elsewhere*, shown here. */

  const money = (n) => {
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(Math.round(n));
    return `${sign}$${abs.toLocaleString('en-US')}`;
  };

  const summaryItems = () => {
    const d = window.TSM.derived();
    const items = [];
    if (d.totalAssets > 0 || d.totalLiabilities > 0) {
      items.push(['Net worth', money(d.netWorth), d.netWorth >= 0 ? 'positive' : 'negative']);
    }
    if (d.totalIncome > 0) {
      items.push(['Monthly surplus', money(d.surplus), d.surplus >= 0 ? 'positive' : 'negative']);
    }
    if (d.runwayMonths != null && d.liquid > 0) {
      // Deliberately not called "runway": the Financial Runway tool reports a
      // different, larger figure because it also counts credit headroom and
      // debt minimums. Two numbers under one name would just confuse.
      items.push(['Savings cover', `${d.runwayMonths.toFixed(1)} mo`, null]);
    }
    if (d.debtMinimums > 0) {
      items.push(['Debt minimums', `${money(d.debtMinimums)}/mo`, null]);
    }
    return items;
  };

  const mountSummary = (anchor) => {
    const strip = el('div', { class: 'tsm-summary', hidden: 'hidden' });
    anchor.after(strip);

    const render = () => {
      const items = summaryItems();
      strip.hidden = items.length < 2;   // one lonely figure isn't a picture
      if (strip.hidden) return;
      strip.replaceChildren(
        ...items.map(([label, value, tone]) =>
          el('div', { class: 'tsm-summary-item' },
            el('span', { class: 'tsm-summary-label', text: label }),
            el('span', { class: `tsm-summary-value${tone ? ' ' + tone : ''}`, text: value }),
          ),
        ),
      );
    };

    render();
    return render;
  };

  /* ── 1c. Shareable scenarios (Layer 3) ─────────────────────────
   * The link carries the figures in its fragment, so nothing is stored
   * and no account is needed. That also means the link *is* the data —
   * which the UI says out loud rather than burying. */

  const buildShareLink = async () => {
    const token = await window.TSM.encodeScenario();
    const base = location.origin + location.pathname;
    return `${base}#s=${token}`;
  };

  const copyToClipboard = async (text, field) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard API needs a secure context and a user gesture; falling
      // back to a selection lets the user hit Cmd-C themselves.
      field?.select?.();
      return false;
    }
  };

  const mountShare = (panel) => {
    const wrap = el('div', { class: 'tsm-share' });
    const button = el('button', { type: 'button', class: 'tsm-share-btn' }, 'Share this scenario');
    const out = el('div', { class: 'tsm-share-out', hidden: 'hidden' });
    wrap.append(button, out);

    button.addEventListener('click', async () => {
      if (window.TSM.filledCount() === 0) {
        out.hidden = false;
        out.replaceChildren(el('p', { class: 'tsm-share-note',
          text: 'Enter some numbers first — there is nothing to share yet.' }));
        return;
      }
      button.disabled = true;
      button.textContent = 'Building link…';
      try {
        const url = await buildShareLink();
        const field = el('input', { class: 'tsm-share-field', readonly: 'readonly', value: url });
        const copied = await copyToClipboard(url, field);
        out.hidden = false;
        out.replaceChildren(
          el('p', { class: 'tsm-share-note' },
            el('strong', { text: copied ? 'Link copied. ' : 'Press Cmd/Ctrl-C to copy. ' }),
            'It carries your figures inside it, so anyone you send it to can see them. ',
            'The part after the # is never sent to a server — not ours, not anyone\u2019s.'),
          field,
        );
        field.focus();
        field.select();
      } catch (err) {
        console.error('[TSM] share failed', err);
        out.hidden = false;
        out.replaceChildren(el('p', { class: 'tsm-share-note',
          text: 'Could not build a link in this browser.' }));
      } finally {
        button.disabled = false;
        button.textContent = 'Share this scenario';
      }
    });

    panel.append(wrap);
  };

  /** Read an incoming #s= scenario, then strip it from the address bar. */
  const readIncomingScenario = async () => {
    const match = /[#&]s=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!match) return null;
    const scenario = await window.TSM.decodeScenario(match[1]);
    // Clear the fragment either way: a stale token in the URL would be
    // re-applied on every reload and shoulder-surfs in the address bar.
    history.replaceState(null, '', location.pathname + location.search);
    return scenario;
  };

  const showScenarioBanner = (scenario, applied) => {
    const anchor = document.querySelector('[data-tsm-banner]')
      ?? document.querySelector('.tool-header')
      ?? document.querySelector('.container');
    if (!anchor) return;

    const banner = el('div', { class: 'tsm-banner tsm-banner-share', role: 'status' },
      el('span', { class: 'tsm-banner-icon', 'aria-hidden': 'true' }, '\u2197'),
      el('span', { class: 'tsm-banner-text' },
        el('strong', { text: applied ? 'Viewing a shared scenario. ' : 'Someone shared a scenario with you. ' }),
        applied
          ? 'These figures came from the link you opened, not from us.'
          : 'Loading it will replace the numbers you already have here.'),
    );

    if (!applied) {
      banner.append(
        el('button', { type: 'button', class: 'tsm-banner-undo',
          onClick: () => { window.TSM.replace(scenario); location.reload(); } }, 'Load it'),
        el('button', { type: 'button', class: 'tsm-banner-close', 'aria-label': 'Dismiss',
          onClick: () => banner.remove() }, '\u00D7'),
      );
    } else {
      banner.append(el('button', { type: 'button', class: 'tsm-banner-close',
        'aria-label': 'Dismiss', onClick: () => banner.remove() }, '\u00D7'));
    }
    anchor.after(banner);
  };

  /** Apply an incoming scenario, or offer it if there is work to protect. */
  const applyIncoming = (scenario) => {
    const hadData = window.TSM.filledCount() > 0;
    if (hadData) {
      showScenarioBanner(scenario, false);
      return false;
    }
    window.TSM.replace(scenario);
    window.TSM.hydrate();
    window.update?.();
    showScenarioBanner(scenario, true);
    return true;
  };

  /* Pasting a share link while already on the site changes only the
     fragment, and a fragment-only navigation does not reload the page —
     so the load-time path would never see it. Catch it here too. */
  window.addEventListener('hashchange', async () => {
    try {
      const scenario = await readIncomingScenario();
      if (scenario) applyIncoming(scenario);
    } catch (err) {
      console.error('[TSM] could not read shared scenario', err);
    }
  });

  /* ── 2. Privacy control ────────────────────────────────────────── */

  let refreshPanel = () => {};

  const buildPrivacyBar = () => {
    const panel = el('div', {
      class: 'tsm-privacy-panel',
      id: 'tsmPrivacyPanel',
      hidden: 'hidden',
    });

    const pill = el('button', {
      type: 'button',
      class: 'tsm-privacy-pill',
      'aria-expanded': 'false',
      'aria-controls': 'tsmPrivacyPanel',
    },
      el('span', { class: 'tsm-privacy-dot', 'aria-hidden': 'true' }),
      el('span', { class: 'tsm-privacy-label' }),
    );

    const wrap = el('div', { class: 'tsm-privacy' }, panel, pill);

    const setOpen = (open) => {
      panel.hidden = !open;
      pill.setAttribute('aria-expanded', String(open));
      wrap.classList.toggle('open', open);
      if (open) refreshPanel();
    };

    pill.addEventListener('click', () => setOpen(panel.hidden));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) { setOpen(false); pill.focus(); }
    });

    document.addEventListener('click', (e) => {
      if (!panel.hidden && !wrap.contains(e.target)) setOpen(false);
    });

    refreshPanel = () => {
      const count = window.TSM.filledCount();
      const tools = window.TSM.toolsUsed.length;
      const mode = window.TSM.mode;
      const remaining = formatRemaining(
        window.TSM.expiresAt ? window.TSM.expiresAt - Date.now() : null,
      );

      pill.querySelector('.tsm-privacy-label').textContent =
        count === 0 ? 'Private by default' : `${plural(count, 'figure')} · on this device only`;
      wrap.classList.toggle('has-data', count > 0);

      panel.replaceChildren(
        el('div', { class: 'tsm-privacy-head' },
          el('strong', { text: 'Your data has never left this device' }),
          el('span', { class: 'tsm-privacy-bytes', text: `${window.TSM.bytesSent} bytes sent` }),
        ),
        el('p', { class: 'tsm-privacy-copy' },
          count === 0
            ? 'Nothing is stored yet. When you enter numbers they stay in this browser — there is no account and no database behind these tools.'
            : `You've entered ${plural(count, 'figure')} across ${plural(tools || 1, 'tool')}. They are kept in your browser so you don't have to retype them, and nowhere else.`,
        ),
        el('div', { class: 'tsm-privacy-modes', role: 'radiogroup', 'aria-label': 'How long to keep your numbers' },
          [
            ['session', 'Until I close this tab', 'Cleared automatically when the tab closes.'],
            ['device', 'Keep for 7 days', 'Stays in this browser so you can come back to it.'],
          ].map(([value, label, hint]) =>
            el('label', { class: 'tsm-privacy-mode' + (mode === value ? ' active' : '') },
              el('input', {
                type: 'radio', name: 'tsm-mode', value,
                ...(mode === value ? { checked: 'checked' } : {}),
                onChange: () => { window.TSM.mode = value; refreshPanel(); },
              }),
              el('span', {},
                el('span', { class: 'tsm-privacy-mode-label', text: label }),
                el('span', { class: 'tsm-privacy-mode-hint', text: hint }),
              ),
            ),
          ),
        ),
        remaining && mode === 'device'
          ? el('p', { class: 'tsm-privacy-expiry', text: `Auto-clears in ${remaining}.` })
          : null,
        el('button', {
          type: 'button',
          class: 'tsm-privacy-clear',
          disabled: count === 0 ? 'disabled' : null,
          onClick: () => {
            window.TSM.clear();
            for (const field of document.querySelectorAll('[data-tsm], [data-tsm-bucket]')) {
              field.value = '';
              field.classList.remove('tsm-prefilled');
            }
            window.update?.();
            refreshPanel();
          },
        }, 'Erase everything now'),
        el('p', { class: 'tsm-privacy-proof' },
          'Not taking our word for it? Open DevTools → Network and use any tool. Nothing leaves.'),
      );
    };

    refreshPanel();
    return wrap;
  };

  /* ── 3. Boot ───────────────────────────────────────────────────── */

  const init = async () => {
    if (TOOL) window.TSM.markTool(TOOL);

    // A shared link is resolved first: if this browser is empty we adopt
    // it outright, otherwise we ask rather than overwriting their work.
    let incoming = null;
    try {
      incoming = await readIncomingScenario();
    } catch (err) {
      console.error('[TSM] could not read shared scenario', err);
    }
    // Adopted before hydration below, so the tool's fields fill from it.
    const adopted = incoming ? window.TSM.filledCount() === 0 : false;
    if (incoming && adopted) window.TSM.replace(incoming);

    // Let each tool adapt before generic hydration (the debt tool seeds
    // its rows here), then fill whatever is still empty.
    document.dispatchEvent(new CustomEvent('tsm:beforehydrate'));

    const filled = window.TSM.hydrate();
    if (filled.length > 0) {
      window.update?.();          // recompute once, not once per field
      if (!incoming) showPrefillBanner(filled);
    }
    if (incoming) showScenarioBanner(incoming, adopted);

    const anchor = document.querySelector('[data-tsm-banner]')
      ?? document.querySelector('.tool-header');
    const renderSummary = anchor ? mountSummary(anchor) : () => {};

    document.body.append(buildPrivacyBar());
    for (const slot of document.querySelectorAll('[data-tsm-share]')) mountShare(slot);

    // Keep the pill and strip honest as the user types, without thrashing.
    // Deliberately a timer rather than requestAnimationFrame: rAF is paused
    // in a background tab, so a user typing in one tab and switching to
    // another would come back to stale figures.
    let queued = 0;
    window.TSM.subscribe(() => {
      if (queued) return;
      queued = setTimeout(() => { queued = 0; refreshPanel(); renderSummary(); }, 60);
    });

    document.dispatchEvent(new CustomEvent('tsm:ready'));
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
