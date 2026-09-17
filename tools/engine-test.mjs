// Exercise the runway engine's pure simulation core outside the browser.
// Run from anywhere:  node tools/engine-test.mjs
import fs from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const src = fs.readFileSync(here + '../dashboard/js/runway.js', 'utf8');
// Strip the DOM-bound half; keep the maths.
const core = src.slice(0, src.indexOf('/* ── Rendering'))
  .replace(/document\.addEventListener[\s\S]*$/, '')
  .replace("'use strict';", '');
const mod = new Function(core + `
  return { simulate, survivalMonths, HORIZON, monthsLabel };
`)();
const { simulate, survivalMonths, monthsLabel } = mod;

const base = {
  cashBuckets: [
    { key:'checking', label:'Checking', amount: 3200 },
    { key:'savings', label:'Savings', amount: 8500 },
  ],
  essential: 3140, discretionary: 1020, debtMinimums: 712,
  cardBalance: 6400, cardLimit: 12000, cardApr: 22,
  continuingIncome: 0, continuingMonths: 0,
  categories: { housing:1800, carPayment:410, dining:280 },
};

const t = (name, cond, extra='') =>
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${extra ? '  → ' + extra : ''}`);

// 1. Baseline sanity: burn is the sum of the three streams
const r = simulate(base);
t('burn = essential + discretionary + minimums', r.burn === 3140+1020+712, `${r.burn}`);

// 2. Cash alone covers 11700/4872 = 2.40 months, then credit takes over
t('credit phase starts when cash runs out',
  Math.abs(r.creditStartedAt - 11700/4872) < 0.05, `at ${r.creditStartedAt.toFixed(2)} mo`);

// 3. Shortfall must come after credit starts
t('shortfall strictly after credit phase', r.shortfallAt > r.creditStartedAt,
  `${r.shortfallAt.toFixed(2)} > ${r.creditStartedAt.toFixed(2)}`);

// 4. Buckets drain in order, checking before savings
const [chk, sav] = r.buckets;
t('checking drains before savings', chk.drainedAt < sav.drainedAt,
  `${chk.drainedAt.toFixed(2)} < ${sav.drainedAt.toFixed(2)}`);

// 5. More cash strictly increases runway
const richer = survivalMonths({ ...base, cashBuckets:[...base.cashBuckets,{key:'b',label:'B',amount:5000}] });
t('more cash → longer runway', richer > survivalMonths(base), `${richer.toFixed(2)} mo`);

// 6. Cutting spend strictly increases runway
t('lower burn → longer runway',
  survivalMonths({ ...base, discretionary: 0 }) > survivalMonths(base));

// 7. 0% APR beats 22% APR (interest eats headroom)
const apr0 = survivalMonths({ ...base, cardApr: 0 });
t('0% APR buys time vs 22%', apr0 > survivalMonths(base),
  `${apr0.toFixed(2)} vs ${survivalMonths(base).toFixed(2)}`);

// 8. Limit below balance must not create phantom headroom
const bad = simulate({ ...base, cardLimit: 100 });
t('limit < balance yields no headroom', bad.limit === base.cardBalance);

// 9. Continuing income that fully covers burn defers everything
const covered = survivalMonths({ ...base, continuingIncome: 5000, continuingMonths: 12 });
t('full income cover defers the break', covered > 12, `${covered.toFixed(2)} mo`);

// 10. Zero burn never breaks
t('zero burn survives the horizon',
  survivalMonths({ ...base, essential:0, discretionary:0, debtMinimums:0 }) === mod.HORIZON);

// 11. No cash, no credit → breaks essentially immediately
const broke = simulate({ ...base, cashBuckets: [], cardBalance: 0, cardLimit: 0 });
t('no cash and no credit breaks at month 0', broke.shortfallAt === 0, `${broke.shortfallAt}`);

// 12. Monotonic: runway never decreases as cash rises
let prev = -1, mono = true;
for (let c = 0; c <= 30000; c += 2500) {
  const m = survivalMonths({ ...base, cashBuckets: [{key:'c',label:'C',amount:c}] });
  if (m < prev) mono = false;
  prev = m;
}
t('runway monotonic in cash', mono);

// 13. Label formatting
t('label formats sub-month as weeks', monthsLabel(0.5).includes('weeks'), monthsLabel(0.5));
t('label formats long spans as years', monthsLabel(30).includes('years'), monthsLabel(30));

console.log('\nScenario: ' + monthsLabel(r.shortfallAt) + ' until the first missed payment.');
