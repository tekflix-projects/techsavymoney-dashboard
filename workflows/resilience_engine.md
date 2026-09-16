# Workflow — The Resilience Engine

**Status:** Layer 1 shipped · Layer 2 specified, not built · Layer 3 specified, not built
**Owner:** Mike
**Last updated:** 2026-09-16

---

## 1. Objective

Turn TechSavyMoney from five disconnected calculators into a tool someone has a
reason to open, share, and come back to — without ever storing their financial
data in a database.

The measurable goal: a stranger lands on the site, gets an answer they could not
get anywhere else for free, and sends the link to someone.

---

## 2. Why this exists (the problem with what we had)

The homepage promised *"Five Tools. One Financial Picture."* The product did not
deliver it. Before this work there was **zero** shared state — no `localStorage`,
no `sessionStorage`, nothing. Each tool was a stateless silo. Enter your debts in
Debt Payoff, walk to Credit Card Payoff, enter them again. Navigate away and it
was all gone.

That put us in the worst competitive position available: fighting NerdWallet and
Bankrate on their own turf (free single-purpose calculators) with none of their
SEO. There was no reason for anyone to choose our link.

### The market, honestly

| Category | Who | What they do | The hole they leave |
|---|---|---|---|
| Aggregators | Monarch, Copilot, YNAB, Empower | Auto-sync via bank login | Needs Plaid, ~$95–110/yr, 30-min onboarding, **rearview mirror** — tells you what you *spent* |
| Calculator farms | NerdWallet, Bankrate, Ramsey | Free, instant, strong SEO | **Siloed and optimistic** — five disconnected answers, and every projection assumes nothing goes wrong |

### The two structural gaps

**Gap A — the linking wall.** A large population will not hand bank credentials
to a website: privacy, security anxiety, non-US banks, accounts spread across
many institutions, or they just want a five-minute answer. Mint's shutdown
stranded millions of them. Their only alternative today is the calculator farms.

**Gap B — nobody models the downside.** Every tool on the market is backward
-looking or optimistic. *"You'll be debt-free in 26 months if nothing changes."*
Nothing models what happens when something **does** change. That is the question
people actually lose sleep over, and it is essentially unserved in free,
instant, no-signup tools.

---

## 3. The differentiator

Three layers. Each one is worth building only because the one under it exists.

### Layer 1 — One shared state, client-side only ✅ SHIPPED

Enter your numbers once; every tool reads the same object. The Credit Card tool
already knows your budget surplus. The Debt Payoff tool already knows your
liabilities. This is what turns a calculator directory into a dashboard — and it
is just keeping the promise the homepage already made.

Necessary, but on its own not a reason to evangelize. See §4 for what was built.

### Layer 2 — The hook: "What breaks first?" ⬜ NOT BUILT

> **If your income stopped today, how long until something breaks — and what
> breaks first?**

Not the trivial `savings ÷ expenses` emergency-fund calculator everyone already
has. A **cascading failure timeline** computed from the shared state:

```
Month 0.0  income stops
Month 1.2  checking drained → pulling from savings
Month 3.8  savings gone → revolving the card
Month 5.1  card hits limit, minimum now unpayable
Month 5.9  ⚠ first missed car payment          ← first real break
Month 7.4  30-day delinquency reported, score −80–110
Month 9.0  repossession risk
```

Then the part nobody does — **leverage ranking**, denominated in *months of
runway bought per dollar*:

- Cancel $47 of subscriptions → **+0.3 mo**
- Move $2k from extra debt payment into buffer → **+1.9 mo**
- Refi the 22% card to a 0% balance transfer → **+1.1 mo**

It tells you *your* single highest-leverage move, in a unit everyone
understands: time, not dollars.

**Why this is the right wedge**
- Emotionally urgent in a way "net worth" never is — it is the fear people
  already have.
- Inherently personal, so the output is screenshot-able and shareable.
- It consumes all five existing tools' inputs, which gives Layer 1 a purpose.
- Nobody owns the term. "Emergency fund calculator" is a red ocean.
  "What breaks first" is empty water.

### Layer 3 — Make privacy provable, and turn it into distribution ⬜ NOT BUILT

The no-database constraint is the moat, but only if it is **visible**:

- **Live privacy meter** — partially shipped in Layer 1 (see §4).
- **Provability** — open-source the repo and say *"open DevTools → Network.
  Watch. Nothing leaves."* Empower and Monarch structurally cannot say that.
- **URL-fragment sharing** — compress the scenario into `#s=…`. Fragments are
  never transmitted to a server, so "send this to your spouse" works with zero
  storage. A growth loop that exists *because* we have no database. The
  constraint becomes the distribution mechanism.

---

## 4. Layer 1 — what was actually built

### Files

| File | Role |
|---|---|
| `dashboard/js/store.js` | The state layer. Schema, persistence, derived figures, DOM binding. |
| `dashboard/js/tsm-ui.js` | Hydration, prefill banner, cross-tool summary strip, privacy control. |
| `dashboard/css/styles.css` | Appended `TSM Shared State` block. |

### How binding works

Inputs opt in declaratively. No per-page wiring code:

```html
<input id="checking" data-tsm="assets.checking" />
<input id="exp-food" data-tsm-bucket="food" />
<input id="cc-apr"   data-tsm="card.apr" data-tsm-default="20" />
```

One delegated `input`/`change` listener on `document` in the **capture** phase
handles every field on every page. Capture matters: it guarantees the store is
updated *before* each page's own `oninput="update()"` recalculates.

- `data-tsm` — dotted path into the canonical schema.
- `data-tsm-bucket` — a coarse expense bucket (see below).
- `data-tsm-default` — this input ships with a page default, so hydration may
  replace it. Without this, a field holding a shipped default (`cc-apr="20"`)
  would never accept a real figure from another tool.

### The canonical schema

`income`, `expenses` (18 categories), `assets`, `liabilities`, `debts[]`,
`card`, `assumptions`, `meta`.

Every numeric leaf defaults to `null`, meaning **"never entered"** — deliberately
distinct from `0`, meaning "entered as zero". We only ever prefill a field the
user left empty, so this distinction is load-bearing.

### Coarse ↔ fine expense buckets

The budget tool collects 18 categories; the credit-card tool collects 6 coarse
ones. `BUCKETS` maps between them, so the same spending is only entered once.

Writing a coarse bucket **spreads proportionally** across its fine members,
preserving an existing split. Verified lossless: enter coarse values on the CC
page, open Budget, and the detailed categories are correct — and back again.

### Mirrored fields

`card.balance` and `liabilities.creditCards` describe the same real-world thing.
`#normalize()` cross-fills them, but **only ever fills a `null`** — it never
overwrites a real entry. That makes it idempotent and unable to ping-pong.
`filledCount()` excludes the mirror so the UI does not double-count.

### Persistence

- **Default: `sessionStorage`** — dies with the tab.
- **Opt-in: `localStorage`** with a hard 7-day expiry, enforced *on read* rather
  than trusting a timer to have run.
- **Never cookies** — cookies are transmitted to the server on every request.
  localStorage is not. This is the whole point.
- Every storage call is guarded and degrades to an in-memory `Map`. Safari
  private mode and some embedded webviews throw on Web Storage access.
- Corrupt JSON is detected and discarded rather than crashing the tools.

### The privacy control (bottom-left pill)

Not garnish. The moment a tool starts remembering financial figures, the user is
owed a visible way to see and revoke that. It shows what is stored, where it
lives, when it expires, a one-click erase, and the DevTools challenge.

### Debt rows

Debts are repeating rows, so they are wired in JS rather than by attribute.
Seeding order:
1. Stored debts, if any.
2. Otherwise, **inferred** from net-worth liabilities — with a banner stating
   plainly that balances are the user's but **rates and minimums are estimates**.
3. Otherwise, the two original sample rows.

Inferred debts are deliberately *not* persisted until the user edits one. Writing
guessed APRs into the store silently would let an estimate masquerade as the
user's own number.

### Bugs found and fixed in the pre-existing code

1. **HTML injection** — `debt-payoff.js` interpolated user-typed debt names
   straight into `innerHTML` (both `value="${name}"` and the summary table). Self
   -inflicted only today, but a live vector the moment Layer 3 ships shareable
   links. Added `esc()`.
2. **Bogus payoff dates** — `simulatePayoff()` hit its 600-month guard with a
   balance still outstanding and reported it as "50 years". If minimums never
   cover accruing interest the debt does not pay off *at all*. Now detected via
   a `stalled` flag and surfaced as a warning.
3. **Crash on missing element** — `credit-card.js` `val()` did
   `document.getElementById(id).value` with no guard. Now null-safe.
4. **rAF in a background tab** *(my own bug, caught in testing)* — the summary
   strip and privacy pill refreshed via `requestAnimationFrame`, which is paused
   in hidden tabs. A user typing in one tab and switching away would return to
   stale figures. Swapped for a `setTimeout` debounce.
5. **Defaults blocking hydration** *(my own bug)* — four bound inputs ship with
   `value=` defaults, so the "only fill empty fields" rule meant a real APR would
   never carry between tools. Fixed with `data-tsm-default`.

### Verified in-browser

Net Worth → Credit Card → Debt Payoff → Budget, with a realistic picture:

- 8 fields carried from Net Worth into the CC tool, with banner and highlight.
- CC tool derived a **$1,205/mo recommended payment from the budget surplus**
  without asking for it again.
- Bucket round-trip lossless in both directions.
- Debt tool inferred 3 debts totalling $35,600 from liabilities, with disclosure.
- Mode switch moved storage session → device; expiry copy correct; no cookies.
- Erase wiped state, inputs, storage, and recomputed every page.
- Zero console errors.

---

## 5. Build sequence from here

1. **Layer 2 — resilience engine.** The headline product. Start with the
   cascading timeline; the leverage ranking is what makes it unique, so do not
   ship without it.
2. **Layer 3 — URL-fragment sharing.** Roughly 50 lines of compress+encode, and
   it is the growth loop.
3. **Landing page rewrite.** The hook is not "net worth calculator". It is
   *"How long could you survive without a paycheck? Four minutes, no signup, no
   bank linking."*
4. **Open-source the repo** so the privacy claim is verifiable rather than
   asserted.

---

## 6. Risks — do not pretend these away

1. **Manual entry is real friction** versus auto-sync. Mitigate by reaching a
   first answer in ~8 fields, then progressively asking for more. Give the payoff
   before demanding completeness.
2. **Projection ≠ advice.** A delinquency timeline needs careful "estimate"
   framing. We are not licensed advisors and must not read as though we are.
3. **No moat in the code.** The math is copyable in a weekend. The moat is trust,
   brand, and owning the new category term.
4. **Monetization is genuinely unsolved** without accounts. Honest options:
   affiliate offers surfaced *only when the engine says they help* (at least
   aligned), or a paid export. **This is the weakest part of the thesis and
   should be resolved before heavy investment.**

---

## 7. Constraints that must not be violated

- **No database. No accounts. No server-side storage of financial figures.**
- **No cookies** for state — they are transmitted on every request.
- No network call ever carries user figures. The `index.html` feedback form is
  the single deliberate exception, and only sends what is typed into it.
- Never overwrite a value the user typed. Prefill empty fields only.
- Never present an inferred or estimated figure as the user's own.
