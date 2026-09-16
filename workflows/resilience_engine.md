# Workflow — The Resilience Engine

**Status:** All three layers shipped · site redesigned 2026-09-16
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

### Layer 2 — The hook: "What breaks first?" ✅ SHIPPED

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

### Layer 3 — Make privacy provable, and turn it into distribution ✅ SHIPPED

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

## 4b. Layer 2 — what was actually built

`dashboard/resilience.html` + `dashboard/js/resilience.js`, linked first in the
nav and featured on the landing page.

### The simulation

`simulate()` is **pure** — same input, same result, and it never touches the DOM.
That is what lets the leverage ranking re-run it a dozen-plus times per edit
without anything flickering.

Each month it: accrues card interest → drains cash buckets **in order**
(checking, then savings, then emergency) → draws on remaining credit headroom →
records a shortfall the moment neither can cover the gap. Event timings are
fractional within the month (`Month 2.4`), computed from how far through that
month's burn the bucket actually emptied.

**Deliberate modelling choices, all surfaced in the UI rather than hidden:**

- **Retirement accounts are excluded from cash.** Early withdrawal costs roughly
  a third in tax and penalty. Treating a 401k as month-three money is how a shock
  becomes a permanent setback.
- **Savings contributions are excluded from burn.** Nobody keeps funding a 401k
  while unemployed, so counting it would understate the runway.
- **Debt minimums come from the payoff tool when it has them, otherwise from the
  budget's debt-payments line — never both**, or the same obligation is counted
  twice.
- **A credit limit below the current balance yields zero headroom.** That is a
  data-entry slip, not available credit.

### The cascade

Consequence timings reflect how lenders generally behave: nothing reaches a
credit bureau before 30 days; repossession and foreclosure processes typically
open up around 90. What breaks *first* is whichever obligation carries the
nearest hard consequence — housing, then the car, then debt minimums. The page
states plainly that these are typical cases, not guarantees.

### Leverage ranking

The part nobody else does. Each candidate change is re-simulated against the
user's real balance sheet and scored in **months of runway bought**, then ranked.
Candidates: cutting each discretionary category, full austerity, a 0% balance
transfer, a 20% housing reduction, and building a $1,000 / $2,500 buffer.

Also reports **months bought per $100/mo given up**, so a small cut that punches
above its weight can outrank a larger one. On the test household this surfaced a
genuinely counterintuitive result: a $2,500 buffer buys more time (+0.5 mo) than
cutting housing by 20% (+0.3 mo).

Anything worth under ~3 days is filtered out; the top 6 are shown.

### Verification

14 assertions against the pure core run outside the browser
(`scratchpad/engine-test.mjs`): burn composition, phase ordering, bucket drain
order, monotonicity in cash, more cash and lower burn both extending runway, 0%
APR beating 22%, a limit below balance yielding no headroom, income cover
deferring the break, zero burn surviving the horizon, and label formatting.

In-browser: baseline 3.4 months → 6.2 with six months of $2,400 benefits → 4.6
with credit headroom removed. Empty, partial, zero-cushion, and wealthy
(6.1 years) states all render correctly.

### Bugs found and fixed during this build

6. **Double render per keystroke** — the page had both inline `oninput="update()"`
   handlers and a store subscription, so every edit rebuilt the chart twice and
   the layout visibly jumped. Inline handlers removed; the store subscription is
   now the single render path, debounced at 80ms.
7. **Phantom credit phase** — the timeline claimed "you start living on the
   credit card" even with no card and no limit. Now requires an actual draw.
8. **Split source of truth** — three of this page's inputs were read from the
   DOM while every other figure came from the store, so the two could drift
   apart. All figures now come from the store.
9. **"1 days"** — a zero runway rendered as `1 days`. Now "No cushion at all",
   with correct day pluralisation below a week.

---

## 4c. Layer 3 — what was actually built

### Scenario links

`encodeScenario()` / `decodeScenario()` in `store.js`. The whole picture is
packed into a fixed-order array (so a link made today still decodes after the
schema gains fields — **append only, never reorder**), JSON-encoded, deflated
via `CompressionStream`, and base64url'd into the URL **fragment**.

Measured: 29 figures plus 3 debts → a 203-character token, 243-character URL.
Comfortably inside any URL limit. Round-trip is lossless. `meta.tools` is
deliberately excluded — it is local usage data, not financial.

**Why the fragment specifically.** Fragments are never transmitted: not in the
request line, not in a `Referer` header. So a scenario can be handed to a spouse
or an advisor with nothing stored anywhere. The no-database constraint is what
makes this possible, and the link *is* the data — which the UI says out loud
rather than burying.

### Receiving a link

- Empty browser → adopted outright, with a banner saying where the figures came
  from.
- Browser with existing figures → **never overwritten**. A banner offers to load
  it instead. Verified: the recipient's own numbers survive intact.
- The fragment is stripped from the address bar either way, so a reload does not
  re-apply it and it does not shoulder-surf.
- Malformed or truncated tokens decode to `null` rather than throwing.

---

## 4d. The 2026-09-16 redesign

The tools were sound but looked like every other calculator farm. The brief was
"suave, modern, not basic" — and competing with NerdWallet on their own visual
terms was never going to work.

**Typography does the heavy lifting.** Fraunces (a variable serif, `WONK 0`
`SOFT 0` so it reads considered rather than quirky) for display and figures;
Inter for everything functional. The serif/sans contrast instantly reads
editorial rather than template — no calculator farm uses it. Figures are set in
tabular numerals throughout so columns line up.

**Warm neutrals, not cold blue-grey.** `#FBFAF7` paper instead of `#F7F8FC`.
This one change does more than anything else to stop it reading as Bootstrap.

**One accent, used sparingly.** A refined teal; the featured tool card is the
only element carrying an accent rule.

**Full dark theme** with a three-state toggle (system / light / dark) applied
before first paint by an inline `<head>` script, so there is no flash. The
choice is a display preference and is kept apart from the financial state — it
survives "erase everything".

**Charts are theme-aware** (`js/chart-theme.js`). Chart.js draws grid lines,
ticks and doughnut separators with fixed colours that assume a white page; those
are now pulled from the same CSS custom properties as the rest of the site and
refreshed when the theme flips. Data colours stay fixed — they identify a
category, so they should not move when the theme does — but the whole
categorical ramp was re-cut to sit with the new palette.

**Legacy CSS variable names were kept as aliases.** Sixteen of them are
referenced from inline styles across the HTML and from chart code; renaming them
would have meant touching every file for no benefit.

### Bugs found and fixed during this work

10. **Fragment-only navigation does not reload the page** — so a share link
    pasted while already on the site never reached the load-time handler and
    silently did nothing. Now also handled on `hashchange`. Found because a test
    appeared to pass while the store stayed empty.
11. **Hydration ignored page defaults** (re-found in the redesign context):
    `data-tsm-default` marks an input whose shipped value may be replaced.

---

## 5. Build sequence from here

1. ~~**Layer 2 — resilience engine.**~~ ✅ Shipped.
2. ~~**Layer 3 — URL-fragment sharing.**~~ ✅ Shipped.
3. **Landing page.** Partly done — the hero now leads with *"If your income
   stopped today, what breaks first?"* and the tool is featured first in the
   grid. Still worth a full pass on the how-it-works section and the email
   capture, which still speak to the old five-calculator framing.
4. **Open-source the repo** so the privacy claim is verifiable rather than
   asserted. This is now the single highest-value remaining move: Layer 3's
   whole pitch is "we cannot see your data", and an auditable repo is what turns
   that from a claim into a fact.
5. **Finish the landing page.** The how-it-works section and email capture still
   speak to the old five-calculator framing.
6. **Resolve monetization** (see §6.4) before investing further.

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
