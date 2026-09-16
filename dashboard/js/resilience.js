/* ─── The Resilience Engine ──────────────────────────────────────
 *
 * Layer 2. Answers the question no other free tool answers:
 *
 *   If your income stopped today, how long until something breaks —
 *   and what breaks first?
 *
 * Everything else on this site is a rearview mirror or an optimistic
 * projection. This models the downside: cash drains in a real order,
 * credit absorbs the gap at a cost, and then obligations start failing
 * on timelines set by how lenders actually behave.
 *
 * The output that matters is not the runway number. It is the leverage
 * ranking — the single highest-value change *for this person*, priced
 * in months bought rather than dollars saved.
 * ──────────────────────────────────────────────────────────────── */

'use strict';

/* Mirrors the needs/wants split the budget tool already uses, so the
   two pages never disagree about what counts as essential. */
const ESSENTIAL_IDS = ['housing', 'utilities', 'internet', 'groceries',
                       'health', 'carPayment', 'gas', 'debtPayments', 'otherExpenses'];
const DISCRETIONARY_IDS = ['dining', 'coffee', 'transit', 'subscriptions',
                           'entertainment', 'shopping', 'gym', 'personal'];

const LABELS = {
  housing: 'Rent / Mortgage', utilities: 'Utilities', internet: 'Internet & Phone',
  groceries: 'Groceries', health: 'Health / Medical', carPayment: 'Car Payment',
  gas: 'Gas & Parking', debtPayments: 'Debt Payments', otherExpenses: 'Other',
  dining: 'Dining Out', coffee: 'Coffee & Drinks', transit: 'Transit / Rideshare',
  subscriptions: 'Subscriptions', entertainment: 'Entertainment',
  shopping: 'Shopping', gym: 'Gym & Fitness', personal: 'Personal Care',
};

const HORIZON = 120;          // 10 years is past the point of usefulness
const MIN_MEANINGFUL = 0.1;   // ignore leverage moves worth under ~3 days

let runwayChart = null;

/* ── Formatting ──────────────────────────────────────────────────── */

const money = (n) => {
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
};

/** Read a number out of the shared state, treating absent as zero. */
const stateNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Months as something a person can act on: "5.9 months", "3 weeks". */
function monthsLabel(months) {
  if (months === null) return '10+ years';
  if (months <= 0) return 'No cushion at all';
  if (months < 1) {
    const weeks = months * 4.345;
    if (weeks < 1) {
      const days = Math.max(1, Math.round(months * 30.44));
      return `${days} day${days === 1 ? '' : 's'}`;
    }
    return `${weeks.toFixed(1)} weeks`;
  }
  if (months >= 24) return `${(months / 12).toFixed(1)} years`;
  return `${months.toFixed(1)} months`;
}

const monthStamp = (months) => {
  const d = new Date();
  d.setDate(d.getDate() + Math.round(months * 30.44));
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

/* ── The simulation ──────────────────────────────────────────────
 * Pure: same input always yields the same result, and it never touches
 * the DOM. That is what lets the leverage ranking below re-run it a few
 * dozen times per keystroke without anything flickering. */

function simulate(input) {
  const {
    cashBuckets, essential, discretionary, debtMinimums,
    cardBalance, cardLimit, cardApr,
    continuingIncome, continuingMonths,
  } = input;

  const burn = essential + discretionary + debtMinimums;
  const buckets = cashBuckets.map((b) => ({ ...b, remaining: Math.max(0, b.amount), drainedAt: null }));

  let cardUsed = Math.max(0, cardBalance);
  // A limit below the current balance is a data-entry slip, not headroom.
  const limit = Math.max(cardUsed, cardLimit);
  const monthlyRate = Math.max(0, cardApr) / 100 / 12;

  const series = [{ month: 0, cash: buckets.reduce((s, b) => s + b.remaining, 0),
                    headroom: Math.max(0, limit - cardUsed), cardUsed }];
  let shortfallAt = null;
  let creditStartedAt = null;

  for (let m = 1; m <= HORIZON; m++) {
    const income = m <= continuingMonths ? continuingIncome : 0;
    const need = Math.max(0, burn - income);

    if (monthlyRate > 0 && cardUsed > 0) cardUsed += cardUsed * monthlyRate;

    let outstanding = need;
    let consumed = 0;
    // Fraction of the way through this month at which an event lands.
    const at = () => (m - 1) + (need > 0 ? consumed / need : 0);

    for (const b of buckets) {
      if (outstanding <= 0) break;
      if (b.remaining <= 0) continue;
      const take = Math.min(b.remaining, outstanding);
      b.remaining -= take;
      outstanding -= take;
      consumed += take;
      if (b.remaining <= 0.005 && b.drainedAt === null) b.drainedAt = at();
    }

    if (outstanding > 0) {
      const headroom = Math.max(0, limit - cardUsed);
      const draw = Math.min(headroom, outstanding);
      // Only a real draw counts as "living on the card" — with no card, or
      // none left, the timeline should go straight to the missed payment.
      if (draw > 0 && creditStartedAt === null) creditStartedAt = at();
      cardUsed += draw;
      outstanding -= draw;
      consumed += draw;
      if (outstanding > 0 && shortfallAt === null) shortfallAt = at();
    }

    series.push({
      month: m,
      cash: buckets.reduce((s, b) => s + b.remaining, 0),
      headroom: Math.max(0, limit - cardUsed),
      cardUsed,
    });

    if (shortfallAt !== null) break;
  }

  return { buckets, shortfallAt, creditStartedAt, series, burn, limit, cardUsed };
}

/** The single number everything else is measured against. */
const survivalMonths = (input) => {
  const r = simulate(input);
  return r.shortfallAt === null ? HORIZON : r.shortfallAt;
};

/* ── Reading the shared picture ──────────────────────────────────── */

function buildInput() {
  const state = window.TSM ? window.TSM.snapshot() : null;
  const expenses = state?.expenses ?? {};
  const assets = state?.assets ?? {};

  const pick = (ids) => ids.reduce((s, id) => s + (Number(expenses[id]) || 0), 0);

  // Retirement accounts are deliberately excluded from the runway. Early
  // withdrawal costs ~30% in tax and penalty, and treating a 401k as
  // month-three cash is how people turn a shock into a permanent setback.
  const cashBuckets = [
    { key: 'checking',  label: 'Checking',       amount: Number(assets.checking) || 0 },
    { key: 'savings',   label: 'Savings',        amount: Number(assets.savings) || 0 },
    { key: 'emergency', label: 'Emergency fund', amount: Number(assets.emergency) || 0 },
  ].filter((b) => b.amount > 0);

  const debts = Array.isArray(state?.debts) ? state.debts : [];
  // Debt minimums come from the payoff tool when it has them, otherwise
  // from the budget's own debt-payments line — never both.
  const debtMinimums = debts.length > 0
    ? debts.reduce((s, d) => s + (Number(d.minPayment) || 0), 0)
    : (Number(expenses.debtPayments) || 0);

  const essentialRaw = pick(ESSENTIAL_IDS);
  const essential = debts.length > 0
    ? essentialRaw - (Number(expenses.debtPayments) || 0)
    : essentialRaw;

  return {
    cashBuckets,
    essential,
    discretionary: pick(DISCRETIONARY_IDS),
    debtMinimums,
    // Every figure comes from the shared store — including this page's own
    // three inputs, which are bound with data-tsm. Reading some values from
    // the DOM and the rest from the store lets the two drift apart.
    cardBalance: stateNum(state?.card?.balance),
    cardLimit: stateNum(state?.card?.limit),
    cardApr: stateNum(state?.card?.apr),
    continuingIncome: stateNum(state?.shock?.continuingIncome),
    continuingMonths: stateNum(state?.shock?.continuingMonths),
    categories: Object.fromEntries(
      [...ESSENTIAL_IDS, ...DISCRETIONARY_IDS].map((id) => [id, Number(expenses[id]) || 0])),
  };
}

/* ── The breakage timeline ───────────────────────────────────────
 * Consequence timings reflect how lenders generally behave: nothing
 * reaches a credit bureau until 30 days past due, repossession and
 * foreclosure processes typically open up around 90. These are typical
 * cases, not guarantees, and the page says so. */

function buildTimeline(input, result) {
  const events = [];
  const { shortfallAt, creditStartedAt, buckets } = result;

  events.push({ at: 0, tone: 'start', title: 'Income stops',
                detail: input.continuingMonths > 0 && input.continuingIncome > 0
                  ? `${money(input.continuingIncome)}/mo continues for ${input.continuingMonths} month${input.continuingMonths === 1 ? '' : 's'}, then nothing.`
                  : `Nothing comes in. ${money(result.burn)}/mo still goes out.` });

  for (const b of buckets) {
    if (b.drainedAt === null) continue;
    events.push({ at: b.drainedAt, tone: 'drain', title: `${b.label} is empty`,
                  detail: `${money(b.amount)} gone.` });
  }

  if (creditStartedAt !== null) {
    events.push({ at: creditStartedAt, tone: 'credit',
                  title: 'You start living on the credit card',
                  detail: input.cardApr > 0
                    ? `The balance now grows at ${input.cardApr}% APR while you borrow against it.`
                    : 'The balance starts growing.' });
  }

  if (shortfallAt === null) {
    events.push({ at: HORIZON, tone: 'safe', title: 'Still standing at 10 years',
                  detail: 'Your cash outlasts this scenario entirely.' });
    return events;
  }

  const { categories } = input;
  const hasCar = categories.carPayment > 0;
  const hasHousing = categories.housing > 0;

  // What fails first is whatever carries the nearest hard consequence.
  const firstToBreak = hasHousing ? 'Rent / mortgage payment'
    : hasCar ? 'Car payment'
    : input.debtMinimums > 0 ? 'Debt minimum payment'
    : 'Essential bills';

  events.push({ at: shortfallAt, tone: 'break', title: `${firstToBreak} — missed`,
                detail: 'Cash and credit are both exhausted. This is the first bill you cannot cover.',
                isFirstBreak: true });

  events.push({ at: shortfallAt + 1, tone: 'severe',
                title: '30 days past due — reported to the bureaus',
                detail: 'A first delinquency typically takes 80–110 points off a good score, and it stays on the report for seven years.' });

  events.push({ at: shortfallAt + 2, tone: 'severe', title: '60 days past due',
                detail: 'A second delinquency posts. Collections contact usually begins around here.' });

  if (hasCar) {
    events.push({ at: shortfallAt + 3, tone: 'severe', title: '90 days — repossession becomes possible',
                  detail: 'Most auto lenders can start repossession once an account is 90 days delinquent. In many states no court order is required.' });
  } else if (hasHousing) {
    events.push({ at: shortfallAt + 3, tone: 'severe', title: '90 days — eviction or foreclosure can begin',
                  detail: 'Landlords and servicers generally start formal proceedings around the 90-day mark.' });
  } else {
    events.push({ at: shortfallAt + 3, tone: 'severe', title: '90 days — accounts head for charge-off',
                  detail: 'Balances get written off and sold to collections, which is far harder to unwind than a late payment.' });
  }

  return events.sort((a, b) => a.at - b.at);
}

/* ── Leverage ranking ────────────────────────────────────────────
 * The part nobody else does. Every candidate move is re-simulated and
 * scored in months of runway bought, so the ranking reflects this
 * person's actual balance sheet rather than generic advice. */

function buildLeverage(input) {
  const base = survivalMonths(input);
  if (base >= HORIZON) return [];

  const candidates = [];
  const withDiscretionary = (delta) => ({ ...input, discretionary: Math.max(0, input.discretionary + delta) });

  for (const id of DISCRETIONARY_IDS) {
    const amount = input.categories[id];
    if (amount <= 0) continue;
    candidates.push({
      label: `Cut ${LABELS[id].toLowerCase()} entirely`,
      cost: amount,
      kind: 'cut',
      input: withDiscretionary(-amount),
    });
  }

  if (input.discretionary > 0) {
    candidates.push({
      label: 'Cut every discretionary category',
      cost: input.discretionary,
      kind: 'cut',
      note: 'The full austerity scenario.',
      input: withDiscretionary(-input.discretionary),
    });
  }

  if (input.cardApr > 0 && input.cardBalance > 0) {
    candidates.push({
      label: 'Move the card to a 0% balance transfer',
      cost: 0,
      kind: 'restructure',
      note: 'Stops the balance compounding while you draw on it.',
      input: { ...input, cardApr: 0 },
    });
  }

  if (input.categories.housing > 0) {
    const saved = input.categories.housing * 0.2;
    candidates.push({
      label: 'Reduce housing cost by 20%',
      cost: saved,
      kind: 'cut',
      note: 'A roommate, a renegotiation, or a smaller place.',
      input: { ...input, essential: Math.max(0, input.essential - saved) },
    });
  }

  for (const amount of [1000, 2500]) {
    candidates.push({
      label: `Build a ${money(amount)} cash buffer`,
      cost: 0,
      kind: 'build',
      note: `${money(amount)} set aside before anything goes wrong.`,
      input: { ...input, cashBuckets: [...input.cashBuckets, { key: 'buffer', label: 'Buffer', amount }] },
    });
  }

  return candidates
    .map((c) => {
      const after = survivalMonths(c.input);
      const gain = after - base;
      return {
        ...c,
        gain,
        // Months bought per $100/mo given up — lets a small cut that
        // punches above its weight outrank a big one that doesn't.
        efficiency: c.cost > 0 ? (gain / c.cost) * 100 : null,
      };
    })
    .filter((c) => c.gain >= MIN_MEANINGFUL)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 6);
}

/* ── Rendering ───────────────────────────────────────────────────── */

const TONE_STYLE = {
  start:  { dot: 'var(--navy)',  icon: '●' },
  drain:  { dot: 'var(--amber)', icon: '○' },
  credit: { dot: 'var(--amber)', icon: '◐' },
  break:  { dot: 'var(--red)',   icon: '✕' },
  severe: { dot: 'var(--red)',   icon: '!' },
  safe:   { dot: 'var(--green)', icon: '✓' },
};

function renderHeadline(input, result) {
  const months = result.shortfallAt;
  const bigEl = document.getElementById('runwayBig');
  const subEl = document.getElementById('runwaySub');
  const badge = document.getElementById('runwayBadge');

  bigEl.textContent = monthsLabel(months);

  if (months === null) {
    bigEl.className = 'resilience-big positive';
    badge.className = 'badge badge-green';
    badge.textContent = 'Very resilient';
    subEl.textContent = 'Your cash outlasts a 10-year income stop at your current spending.';
    return;
  }

  bigEl.className = 'resilience-big ' + (months >= 6 ? 'positive' : months >= 3 ? 'caution' : 'negative');
  if (months >= 6) { badge.className = 'badge badge-green'; badge.textContent = 'Solid cushion'; }
  else if (months >= 3) { badge.className = 'badge badge-amber'; badge.textContent = 'Thin cushion'; }
  else { badge.className = 'badge badge-red'; badge.textContent = 'Fragile'; }

  subEl.innerHTML = `That's around <strong>${monthStamp(months)}</strong> before the first bill goes unpaid — `
    + `burning <strong>${money(result.burn)}/mo</strong> with `
    + `<strong>${money(input.cashBuckets.reduce((s, b) => s + b.amount, 0))}</strong> of reachable cash.`;
}

function renderTimeline(events, shortfallAt) {
  const container = document.getElementById('timeline');
  container.replaceChildren();

  for (const e of events) {
    const style = TONE_STYLE[e.tone] ?? TONE_STYLE.drain;
    const row = document.createElement('div');
    row.className = 'timeline-row' + (e.isFirstBreak ? ' timeline-first-break' : '');

    const marker = document.createElement('div');
    marker.className = 'timeline-marker';
    marker.style.setProperty('--dot', style.dot);
    marker.textContent = style.icon;

    const when = document.createElement('div');
    when.className = 'timeline-when';
    when.textContent = e.at === 0 ? 'Today' : `Month ${e.at.toFixed(1)}`;

    const body = document.createElement('div');
    body.className = 'timeline-body';
    const title = document.createElement('div');
    title.className = 'timeline-title';
    title.textContent = e.title;
    const detail = document.createElement('div');
    detail.className = 'timeline-detail';
    detail.textContent = e.detail;
    body.append(title, detail);

    if (e.isFirstBreak) {
      const flag = document.createElement('span');
      flag.className = 'timeline-flag';
      flag.textContent = 'This breaks first';
      title.append(flag);
    }

    row.append(when, marker, body);
    container.append(row);
  }

  document.getElementById('firstBreakNote').classList.toggle('hidden', shortfallAt === null);
}

function renderLeverage(options) {
  const container = document.getElementById('leverage');
  container.replaceChildren();

  if (options.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'resilience-muted';
    empty.textContent = 'Add your spending in the Budget tool to see which single change buys you the most time.';
    container.append(empty);
    return;
  }

  const best = options[0];
  options.forEach((o, i) => {
    const row = document.createElement('div');
    row.className = 'leverage-row' + (i === 0 ? ' leverage-best' : '');

    const rank = document.createElement('div');
    rank.className = 'leverage-rank';
    rank.textContent = String(i + 1);

    const body = document.createElement('div');
    body.className = 'leverage-body';
    const label = document.createElement('div');
    label.className = 'leverage-label';
    label.textContent = o.label;
    body.append(label);

    const meta = document.createElement('div');
    meta.className = 'leverage-meta';
    const bits = [];
    if (o.cost > 0) bits.push(`${money(o.cost)}/mo`);
    if (o.efficiency !== null && o.efficiency > 0) bits.push(`${o.efficiency.toFixed(2)} mo per $100/mo`);
    if (o.note) bits.push(o.note);
    meta.textContent = bits.join(' · ');
    body.append(meta);

    const gain = document.createElement('div');
    gain.className = 'leverage-gain';
    gain.textContent = `+${o.gain.toFixed(1)} mo`;

    const bar = document.createElement('div');
    bar.className = 'leverage-bar';
    const fill = document.createElement('div');
    fill.className = 'leverage-fill';
    fill.style.width = `${Math.max(4, (o.gain / best.gain) * 100)}%`;
    bar.append(fill);
    body.append(bar);

    row.append(rank, body, gain);
    container.append(row);
  });
}

function renderChart(result) {
  const canvas = document.getElementById('runwayChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const series = result.series;
  const labels = series.map((p) => (p.month === 0 ? 'Now' : `Mo ${p.month}`));

  if (runwayChart) runwayChart.destroy();
  runwayChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Cash on hand', data: series.map((p) => p.cash),
          borderColor: '#00B4A2', backgroundColor: 'rgba(0,180,162,0.12)',
          borderWidth: 2.5, tension: 0.25, fill: true, pointRadius: 0, pointHoverRadius: 5 },
        { label: 'Credit still available', data: series.map((p) => p.headroom),
          borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.10)',
          borderWidth: 2.5, tension: 0.25, fill: true, pointRadius: 0, pointHoverRadius: 5,
          borderDash: [5, 4] },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { maxTicksLimit: 10, font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' },
             ticks: { font: { size: 11 },
                      callback: (v) => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v) } },
      },
      plugins: {
        legend: { position: 'top', labels: { font: { size: 12, weight: '600' }, usePointStyle: true, pointStyleWidth: 10 } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(c.raw)}` } },
      },
    },
  });
}

function renderBreakdown(input, result) {
  const container = document.getElementById('burnBreakdown');
  container.replaceChildren();

  const rows = [
    ['Essential spending', input.essential, 'var(--navy)'],
    ['Discretionary spending', input.discretionary, 'var(--amber)'],
    ['Debt minimums', input.debtMinimums, 'var(--red)'],
  ].filter(([, amount]) => amount > 0);

  const total = rows.reduce((s, [, amount]) => s + amount, 0);
  if (total === 0) return;

  for (const [label, amount, color] of rows) {
    const pct = (amount / total) * 100;
    const row = document.createElement('div');
    row.style.marginBottom = '0.875rem';

    const head = document.createElement('div');
    head.className = 'flex-between mb-1';
    const name = document.createElement('span');
    name.style.cssText = 'font-size:0.875rem; font-weight:500;';
    name.textContent = label;
    const value = document.createElement('span');
    value.style.cssText = 'font-size:0.875rem; font-weight:700;';
    value.textContent = `${money(amount)}/mo`;
    head.append(name, value);

    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.cssText = `width:${pct}%; background:${color};`;
    bar.append(fill);

    row.append(head, bar);
    container.append(row);
  }
}

/* ── Orchestration ───────────────────────────────────────────────── */

function update() {
  const input = buildInput();
  const hasCash = input.cashBuckets.length > 0;
  const hasBurn = (input.essential + input.discretionary + input.debtMinimums) > 0;
  const ready = hasCash || hasBurn;

  document.getElementById('resilienceEmpty').classList.toggle('hidden', ready);
  document.getElementById('resilienceResults').classList.toggle('hidden', !ready);
  if (!ready) return;

  if (!hasBurn) {
    document.getElementById('runwayBig').textContent = '—';
    document.getElementById('runwaySub').textContent =
      'Add your monthly spending in the Budget tool and this fills in automatically.';
    document.getElementById('runwayBadge').className = 'badge badge-navy';
    document.getElementById('runwayBadge').textContent = 'Needs your spending';
    renderTimeline([], null);
    renderLeverage([]);
    return;
  }

  const result = simulate(input);
  renderHeadline(input, result);
  renderTimeline(buildTimeline(input, result), result.shortfallAt);
  renderLeverage(buildLeverage(input));
  renderBreakdown(input, result);
  renderChart(result);
}

/* ── Render triggers ─────────────────────────────────────────────
 * The store subscription is the *only* path that re-renders. The page's
 * own inputs are bound with data-tsm, so editing one writes to the store
 * and comes back here — no inline oninput handlers, and therefore no
 * double render per keystroke.
 *
 * Debounced because a single leverage pass re-simulates a dozen-plus
 * scenarios and rebuilds a chart; doing that per keystroke made the
 * layout visibly jump. */

let renderTimer = 0;
const scheduleUpdate = () => {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(update, 80);
};

if (window.TSM) window.TSM.subscribe(scheduleUpdate);
document.addEventListener('tsm:ready', update);

update();
