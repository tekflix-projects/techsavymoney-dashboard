/* ─── TSM · Shared Financial State ───────────────────────────────
 *
 * Layer 1 of the TechSavyMoney architecture: one financial picture,
 * held entirely on the client. Every tool reads and writes the same
 * object, so numbers entered in one tool show up in the next.
 *
 * PRIVACY GUARANTEES — these are load-bearing, not decoration:
 *   • No network I/O. This file contains no fetch / XHR / sendBeacon.
 *   • Default persistence is sessionStorage — it dies with the tab.
 *   • "Remember on this device" is opt-in, uses localStorage, and
 *     carries a hard expiry enforced on every read.
 *   • Cookies are never used, because cookies are transmitted to the
 *     server on every request. localStorage is not.
 *
 * Verify it yourself: open DevTools → Network, use every tool, and
 * watch nothing leave. (The feedback form on index.html is the one
 * deliberate exception, and it only ever sends what you type into it.)
 * ──────────────────────────────────────────────────────────────── */

(() => {
  'use strict';

  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = 'tsm.state.v1';
  const MODE_KEY = 'tsm.mode.v1';
  const DEVICE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  /* ── Canonical schema ──────────────────────────────────────────
   * Every numeric leaf defaults to null, which means "never entered".
   * That is deliberately distinct from 0, which means "entered as
   * zero" — we only ever prefill a field the user has left empty. */
  const createState = () => ({
    version: SCHEMA_VERSION,
    income:      { primary: null, side: null, other: null },
    expenses:    {
      housing: null, utilities: null, internet: null, groceries: null,
      health: null, carPayment: null, gas: null, debtPayments: null,
      dining: null, coffee: null, transit: null, subscriptions: null,
      entertainment: null, shopping: null, gym: null, personal: null,
      savingsContrib: null, otherExpenses: null,
    },
    assets:      {
      checking: null, savings: null, emergency: null, retirement: null,
      ira: null, brokerage: null, crypto: null, realestate: null,
      vehicles: null, otherAssets: null,
    },
    liabilities: {
      mortgage: null, carLoan: null, studentLoan: null,
      creditCards: null, personalLoans: null, otherLiabilities: null,
    },
    debts: [],                                     // [{name, balance, rate, minPayment}]
    card:  { balance: null, apr: null, minPayment: null, limit: null },
    // Inputs specific to the runway engine's income-shock scenario.
    shock: { continuingIncome: null, continuingMonths: null },
    assumptions: { returnRate: null, debtRate: null },
    meta: { updatedAt: null, tools: {} },
  });

  /* ── Coarse↔fine expense buckets ───────────────────────────────
   * The budget tool collects 18 categories; the credit-card tool
   * collects 6 coarse ones. These map between them so the same
   * spending only has to be entered once. */
  const BUCKETS = Object.freeze({
    housing:       ['housing'],
    utilities:     ['utilities', 'internet'],
    food:          ['groceries', 'dining', 'coffee'],
    transport:     ['carPayment', 'gas', 'transit'],
    subscriptions: ['subscriptions', 'entertainment', 'gym'],
    other:         ['health', 'shopping', 'personal', 'debtPayments', 'otherExpenses'],
  });

  /* ── Utilities ─────────────────────────────────────────────────── */

  /** Parse a form value into a finite number, or null for "empty". */
  const toNumber = (raw) => {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (s === '') return null;
    const n = Number.parseFloat(s.replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  const clone = (v) =>
    typeof structuredClone === 'function'
      ? structuredClone(v)
      : JSON.parse(JSON.stringify(v));

  const isPlainObject = (v) =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

  const deepGet = (obj, path) =>
    path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);

  /** Write `value` at a dotted path. Refuses to create new branches,
   *  so a typo'd path fails loudly instead of silently growing state. */
  const deepSet = (obj, path, value) => {
    const keys = path.split('.');
    const last = keys.pop();
    let node = obj;
    for (const k of keys) {
      if (!isPlainObject(node[k]) && !Array.isArray(node[k])) return false;
      node = node[k];
    }
    if (!(last in node)) return false;
    node[last] = value;
    return true;
  };

  /** Merge stored data over a fresh default, keeping only keys the
   *  current schema knows about. This is the migration story: an old
   *  payload loses removed fields and gains new ones as null. */
  const mergeIntoSchema = (target, source) => {
    if (!isPlainObject(source)) return target;
    for (const [key, value] of Object.entries(source)) {
      if (!(key in target)) continue;
      if (isPlainObject(target[key]) && isPlainObject(value)) {
        mergeIntoSchema(target[key], value);
      } else if (Array.isArray(target[key]) && Array.isArray(value)) {
        target[key] = value;
      } else if (!isPlainObject(target[key]) && !Array.isArray(target[key])) {
        target[key] = value;
      }
    }
    return target;
  };

  const sum = (values) => {
    const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
    return nums.reduce((a, b) => a + b, 0);
  };

  /** Sum that preserves "nothing entered" as null rather than 0. */
  const sumOrNull = (values) =>
    values.some((v) => typeof v === 'number' && Number.isFinite(v))
      ? sum(values)
      : null;

  /* ── Storage adapter ───────────────────────────────────────────
   * Safari private mode and some embedded webviews throw on access
   * to Web Storage. Every call is guarded and degrades to an
   * in-memory map, so the tools keep working either way. */
  const memoryStore = new Map();

  const backing = (mode) => {
    try {
      const store = mode === 'device' ? window.localStorage : window.sessionStorage;
      const probe = '__tsm_probe__';
      store.setItem(probe, '1');
      store.removeItem(probe);
      return store;
    } catch {
      return null;
    }
  };

  const storageRead = (mode, key) => {
    const store = backing(mode);
    try {
      return store ? store.getItem(key) : (memoryStore.get(key) ?? null);
    } catch {
      return memoryStore.get(key) ?? null;
    }
  };

  const storageWrite = (mode, key, value) => {
    const store = backing(mode);
    try {
      if (store) store.setItem(key, value);
      else memoryStore.set(key, value);
    } catch {
      memoryStore.set(key, value); // quota exceeded, etc.
    }
  };

  const storageRemove = (key) => {
    for (const mode of ['session', 'device']) {
      const store = backing(mode);
      try {
        if (store) store.removeItem(key);
      } catch { /* ignore */ }
    }
    memoryStore.delete(key);
  };

  /* ── Shareable scenarios (Layer 3) ─────────────────────────────
   * The whole picture is encoded into the URL *fragment*. Fragments are
   * never transmitted to a server — not in the request line, not in a
   * Referer header — so a scenario can be handed to a spouse or an
   * advisor with nothing stored anywhere. The no-database constraint is
   * what makes this possible; the link IS the data.
   *
   * Fixed field order, so a link made today still decodes after the
   * schema gains fields. Append only — never reorder or remove. */
  const SHARE_FIELDS = Object.freeze([
    'income.primary', 'income.side', 'income.other',
    'expenses.housing', 'expenses.utilities', 'expenses.internet', 'expenses.groceries',
    'expenses.health', 'expenses.carPayment', 'expenses.gas', 'expenses.debtPayments',
    'expenses.dining', 'expenses.coffee', 'expenses.transit', 'expenses.subscriptions',
    'expenses.entertainment', 'expenses.shopping', 'expenses.gym', 'expenses.personal',
    'expenses.savingsContrib', 'expenses.otherExpenses',
    'assets.checking', 'assets.savings', 'assets.emergency', 'assets.retirement',
    'assets.ira', 'assets.brokerage', 'assets.crypto', 'assets.realestate',
    'assets.vehicles', 'assets.otherAssets',
    'liabilities.mortgage', 'liabilities.carLoan', 'liabilities.studentLoan',
    'liabilities.creditCards', 'liabilities.personalLoans', 'liabilities.otherLiabilities',
    'card.balance', 'card.apr', 'card.minPayment', 'card.limit',
    'assumptions.returnRate', 'assumptions.debtRate',
    'shock.continuingIncome', 'shock.continuingMonths',
  ]);

  const SHARE_VERSION = 1;

  const bytesToBase64Url = (bytes) => {
    let binary = '';
    // Chunked: a spread over a large array blows the call stack.
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const base64UrlToBytes = (str) => {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(Math.ceil(str.length / 4) * 4, '=');
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };

  const streamThrough = async (bytes, transform) => {
    const stream = new Blob([bytes]).stream().pipeThrough(transform);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };

  /** Round-trip safe, and small: a full picture fits in a normal URL. */
  const packState = (state) => {
    const values = SHARE_FIELDS.map((path) => {
      const v = deepGet(state, path);
      return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
    });
    const debts = (state.debts ?? []).map((d) => [d.name ?? '', d.balance, d.rate, d.minPayment]);
    return [SHARE_VERSION, values, debts];
  };

  const unpackState = (packed) => {
    if (!Array.isArray(packed) || packed[0] !== SHARE_VERSION) return null;
    const [, values, debts] = packed;
    if (!Array.isArray(values)) return null;

    const next = createState();
    values.forEach((v, i) => {
      if (i >= SHARE_FIELDS.length) return;       // link from a newer schema
      if (typeof v !== 'number' || !Number.isFinite(v)) return;
      deepSet(next, SHARE_FIELDS[i], v);
    });
    next.debts = (Array.isArray(debts) ? debts : [])
      .map(([name, balance, rate, minPayment]) => ({
        name: String(name ?? '').slice(0, 60),
        balance: toNumber(balance), rate: toNumber(rate), minPayment: toNumber(minPayment),
      }))
      .filter((d) => d.balance != null && d.balance > 0);
    return next;
  };

  async function encodeScenario(state) {
    const json = JSON.stringify(packState(state));
    const raw = new TextEncoder().encode(json);
    if (typeof CompressionStream === 'function') {
      try {
        return 'z' + bytesToBase64Url(await streamThrough(raw, new CompressionStream('deflate-raw')));
      } catch { /* fall through to uncompressed */ }
    }
    return 'j' + bytesToBase64Url(raw);
  }

  async function decodeScenario(token) {
    if (typeof token !== 'string' || token.length < 2) return null;
    const kind = token[0];
    let bytes;
    try {
      bytes = base64UrlToBytes(token.slice(1));
    } catch { return null; }

    try {
      if (kind === 'z') {
        if (typeof DecompressionStream !== 'function') return null;
        bytes = await streamThrough(bytes, new DecompressionStream('deflate-raw'));
      } else if (kind !== 'j') {
        return null;
      }
      return unpackState(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      return null;   // truncated or tampered link — never throw at the user
    }
  }

  /* ── Store ─────────────────────────────────────────────────────── */

  class Store {
    #state = createState();
    #listeners = new Set();
    #mode = 'session';
    #expiresAt = null;
    #suspended = false;

    constructor() {
      try {
        this.#mode = storageRead('device', MODE_KEY) === 'device' ? 'device' : 'session';
      } catch { this.#mode = 'session'; }
      this.#load();
    }

    /* — persistence — */

    #load() {
      const raw = storageRead(this.#mode, STORAGE_KEY);
      if (!raw) return;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        storageRemove(STORAGE_KEY); // corrupt payload — start clean
        return;
      }
      if (!isPlainObject(parsed) || !isPlainObject(parsed.state)) return;

      // Enforce expiry on read, never trusting that a timer ran.
      if (typeof parsed.expiresAt === 'number' && Date.now() > parsed.expiresAt) {
        storageRemove(STORAGE_KEY);
        return;
      }
      this.#expiresAt = parsed.expiresAt ?? null;
      mergeIntoSchema(this.#state, parsed.state);
      this.#state.version = SCHEMA_VERSION;
      this.#normalize();
    }

    #persist() {
      if (this.#suspended) return;
      this.#state.meta.updatedAt = Date.now();
      this.#expiresAt = this.#mode === 'device' ? Date.now() + DEVICE_TTL_MS : null;
      const payload = JSON.stringify({
        schema: SCHEMA_VERSION,
        expiresAt: this.#expiresAt,
        state: this.#state,
      });
      storageWrite(this.#mode, STORAGE_KEY, payload);
    }

    /** Cross-fill values that describe the same real-world thing.
     *  Only ever fills a null — it never overwrites a real entry, so
     *  this is idempotent and cannot ping-pong between fields. */
    #normalize() {
      const { card, liabilities } = this.#state;
      if (liabilities.creditCards == null && card.balance != null) {
        liabilities.creditCards = card.balance;
      } else if (card.balance == null && liabilities.creditCards != null) {
        card.balance = liabilities.creditCards;
      }
    }

    #emit() {
      const snap = this.snapshot();
      for (const fn of [...this.#listeners]) {
        try { fn(snap); } catch (err) { console.error('[TSM] listener failed', err); }
      }
    }

    #commit() {
      this.#normalize();
      this.#persist();
      this.#emit();
    }

    /* — public API — */

    /** Deep, frozen copy. Callers cannot mutate internal state. */
    snapshot() {
      return Object.freeze(clone(this.#state));
    }

    get(path) {
      return path ? deepGet(this.#state, path) : this.snapshot();
    }

    set(path, value, asText = false) {
      const next = (!asText && typeof value === 'string') ? toNumber(value) : value;
      if (deepGet(this.#state, path) === next) return false;
      if (!deepSet(this.#state, path, next)) {
        console.warn(`[TSM] unknown state path: ${path}`);
        return false;
      }
      this.#commit();
      return true;
    }

    patch(partial) {
      mergeIntoSchema(this.#state, partial);
      this.#commit();
    }

    /** Adopt a decoded scenario wholesale, discarding what was there. */
    replace(next) {
      this.#state = mergeIntoSchema(createState(), next);
      this.#state.version = SCHEMA_VERSION;
      this.#commit();
    }

    /** Batch several writes into a single persist + notify. */
    transact(fn) {
      this.#suspended = true;
      try { fn(this); } finally { this.#suspended = false; }
      this.#commit();
    }

    subscribe(fn) {
      if (typeof fn !== 'function') throw new TypeError('subscribe expects a function');
      this.#listeners.add(fn);
      return () => this.#listeners.delete(fn);
    }

    /* — expense buckets — */

    getBucket(name) {
      const members = BUCKETS[name];
      if (!members) return null;
      return sumOrNull(members.map((k) => this.#state.expenses[k]));
    }

    /** Spread a coarse bucket total across its fine-grained members,
     *  preserving the existing split where one exists so the budget
     *  tool's detail survives a round-trip through the CC tool. */
    setBucket(name, rawValue) {
      const members = BUCKETS[name];
      if (!members) return false;
      const value = toNumber(rawValue);
      const expenses = this.#state.expenses;

      if (value === null) {
        for (const k of members) expenses[k] = null;
      } else {
        const current = members.map((k) => expenses[k]);
        const total = sum(current);
        if (total > 0) {
          const ratio = value / total;
          for (const [i, k] of members.entries()) {
            expenses[k] = current[i] == null ? null : Math.round(current[i] * ratio * 100) / 100;
          }
        } else {
          for (const k of members) expenses[k] = null;
          expenses[members[0]] = value;
        }
      }
      this.#commit();
      return true;
    }

    /* — debts — */

    setDebts(debts) {
      this.#state.debts = (Array.isArray(debts) ? debts : [])
        .map((d) => ({
          name: String(d?.name ?? '').slice(0, 60),
          balance: toNumber(d?.balance),
          rate: toNumber(d?.rate),
          minPayment: toNumber(d?.minPayment),
        }))
        .filter((d) => d.balance != null && d.balance > 0);
      this.#commit();
    }

    /** Debts inferred from the net-worth liabilities, used to seed the
     *  payoff tool when the user has not listed individual debts. */
    debtsFromLiabilities() {
      const L = this.#state.liabilities;
      const seeds = [
        ['Credit Cards',   L.creditCards,      22],
        ['Car Loan',       L.carLoan,           7],
        ['Student Loans',  L.studentLoan,     5.5],
        ['Personal / Medical', L.personalLoans, 12],
        ['Other Debt',     L.otherLiabilities, 10],
      ];
      return seeds
        .filter(([, balance]) => typeof balance === 'number' && balance > 0)
        .map(([name, balance, rate]) => ({
          name,
          balance,
          rate,
          minPayment: Math.max(25, Math.round(balance * 0.02)),
        }));
    }

    /* — derived figures — */

    derived() {
      const s = this.#state;
      const totalIncome = sum(Object.values(s.income));
      const totalExpenses = sum(Object.values(s.expenses));
      const totalAssets = sum(Object.values(s.assets));
      const totalLiabilities = sum(Object.values(s.liabilities));
      const liquid = sum([s.assets.checking, s.assets.savings, s.assets.emergency]);
      const debtMinimums = sum(s.debts.map((d) => d.minPayment));
      return Object.freeze({
        totalIncome,
        totalExpenses,
        surplus: totalIncome - totalExpenses,
        savingsRate: totalIncome > 0 ? (totalIncome - totalExpenses) / totalIncome : null,
        totalAssets,
        totalLiabilities,
        netWorth: totalAssets - totalLiabilities,
        liquid,
        debtMinimums,
        // Months of expenses covered by liquid savings — the input the
        // runway engine (Layer 2) will build its timeline from.
        runwayMonths: totalExpenses > 0 ? liquid / totalExpenses : null,
      });
    }

    /** How many real values the user has entered. Drives the UI copy. */
    filledCount() {
      const s = this.#state;
      const groups = [s.income, s.expenses, s.assets, s.liabilities];
      let fields = groups.flatMap((g) => Object.values(g))
        .filter((v) => typeof v === 'number' && Number.isFinite(v)).length;
      // card.balance is a mirror of liabilities.creditCards (see #normalize),
      // so it only counts when it holds something different.
      for (const [key, value] of Object.entries(s.card)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        if (key === 'balance' && value === s.liabilities.creditCards) continue;
        fields += 1;
      }
      return fields + s.debts.length;
    }

    markTool(name) {
      if (this.#state.meta.tools[name]) return;
      this.#state.meta.tools[name] = Date.now();
      this.#persist();
    }

    get toolsUsed() { return Object.keys(this.#state.meta.tools); }

    /* — lifecycle — */

    get mode() { return this.#mode; }

    set mode(next) {
      const value = next === 'device' ? 'device' : 'session';
      if (value === this.#mode) return;
      storageRemove(STORAGE_KEY);
      this.#mode = value;
      storageWrite('device', MODE_KEY, value);
      this.#persist();
      this.#emit();
    }

    get expiresAt() { return this.#expiresAt; }

    clear() {
      this.#state = createState();
      storageRemove(STORAGE_KEY);
      this.#emit();
    }

    /** Always 0, and structurally so: no code path sends a figure
     *  anywhere. Exposed so the panel reads a real value rather than a
     *  number hard-coded into the markup. */
    get figuresSent() { return 0; }
  }

  /* ── Declarative DOM binding ───────────────────────────────────
   * Inputs opt in with data-tsm="<path>" (or data-tsm-bucket for the
   * coarse expense buckets). One delegated listener in the capture
   * phase handles every field on every page, which means no per-page
   * wiring and nothing to keep in sync when markup changes. */

  const store = new Store();
  let hydrating = false;

  const readField = (el) => (el.type === 'checkbox' ? el.checked : el.value);

  const onInput = (event) => {
    if (hydrating) return;
    const el = event.target;
    if (!(el instanceof HTMLElement)) return;

    const bucket = el.dataset.tsmBucket;
    if (bucket) { store.setBucket(bucket, readField(el)); return; }

    const path = el.dataset.tsm;
    if (!path) return;
    const asText = el.dataset.tsmType === 'text';
    store.set(path, asText ? String(readField(el)) : readField(el), asText);
  };

  /** Fill empty fields from the store. Never overwrites something the
   *  user has already typed on this page. Returns the elements filled. */
  const hydrate = (root = document) => {
    const filled = [];
    hydrating = true;
    try {
      for (const el of root.querySelectorAll('[data-tsm], [data-tsm-bucket]')) {
        // Several inputs ship with a sensible default (an APR of 20%, a 7%
        // return). Those should still yield to a real figure the user gave
        // another tool — but anything they have actually changed must not.
        const shipped = el.dataset.tsmDefault;
        const isUntouched = el.value === '' || el.value == null
          || (shipped !== undefined && el.value === shipped);
        if (!isUntouched) continue;
        const bucket = el.dataset.tsmBucket;
        const value = bucket ? store.getBucket(bucket) : store.get(el.dataset.tsm);
        if (value === null || value === undefined || value === '') continue;
        el.value = typeof value === 'number' ? String(Math.round(value * 100) / 100) : String(value);
        el.classList.add('tsm-prefilled');
        filled.push(el);
      }
    } finally {
      hydrating = false;
    }
    return filled;
  };

  document.addEventListener('input', onInput, true);
  document.addEventListener('change', onInput, true);

  // A prefilled field stops looking prefilled once the user edits it.
  document.addEventListener('input', (e) => {
    if (e.target instanceof HTMLElement) e.target.classList.remove('tsm-prefilled');
  });

  /* ── Public surface ────────────────────────────────────────────── */

  window.TSM = Object.freeze({
    get: (path) => store.get(path),
    set: (path, value) => store.set(path, value),
    patch: (partial) => store.patch(partial),
    replace: (next) => store.replace(next),
    encodeScenario: () => encodeScenario(store.get()),
    decodeScenario,
    transact: (fn) => store.transact(fn),
    subscribe: (fn) => store.subscribe(fn),
    snapshot: () => store.snapshot(),
    derived: () => store.derived(),
    getBucket: (n) => store.getBucket(n),
    setBucket: (n, v) => store.setBucket(n, v),
    setDebts: (d) => store.setDebts(d),
    debtsFromLiabilities: () => store.debtsFromLiabilities(),
    filledCount: () => store.filledCount(),
    markTool: (n) => store.markTool(n),
    get toolsUsed() { return store.toolsUsed; },
    get mode() { return store.mode; },
    set mode(v) { store.mode = v; },
    get expiresAt() { return store.expiresAt; },
    get figuresSent() { return store.figuresSent; },
    clear: () => store.clear(),
    hydrate,
    toNumber,
    BUCKETS,
  });
})();
