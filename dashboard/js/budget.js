/* ─── Budget Breakdown Calculator ────────────────────────────── */

const EXPENSE_CATEGORIES = [
  { id: 'housing',       label: 'Rent / Mortgage',    color: '#0F1F3D', group: 'needs' },
  { id: 'utilities',     label: 'Utilities',           color: '#1A3460', group: 'needs' },
  { id: 'internet',      label: 'Internet & Phone',    color: '#2A4A80', group: 'needs' },
  { id: 'groceries',     label: 'Groceries',           color: '#00B4A2', group: 'needs' },
  { id: 'health',        label: 'Health / Medical',    color: '#009688', group: 'needs' },
  { id: 'carPayment',    label: 'Car Payment',         color: '#33C9B8', group: 'needs' },
  { id: 'gas',           label: 'Gas & Parking',       color: '#66D9CC', group: 'needs' },
  { id: 'debtPayments',  label: 'Debt Payments',       color: '#3A5A9A', group: 'needs' },
  { id: 'dining',        label: 'Dining Out',          color: '#F59E0B', group: 'wants' },
  { id: 'coffee',        label: 'Coffee & Drinks',     color: '#FBBF24', group: 'wants' },
  { id: 'transit',       label: 'Transit / Rideshare', color: '#FCD34D', group: 'wants' },
  { id: 'subscriptions', label: 'Subscriptions',       color: '#FDE68A', group: 'wants' },
  { id: 'entertainment', label: 'Entertainment',       color: '#F97316', group: 'wants' },
  { id: 'shopping',      label: 'Shopping',            color: '#FB923C', group: 'wants' },
  { id: 'gym',           label: 'Gym & Fitness',       color: '#FDBA74', group: 'wants' },
  { id: 'personal',      label: 'Personal Care',       color: '#FED7AA', group: 'wants' },
  { id: 'savingsContrib',label: 'Savings',             color: '#10B981', group: 'savings' },
  { id: 'otherExpenses', label: 'Other',               color: '#6B7280', group: 'other' },
];

let budgetChart = null;

function fmt(n) {
  if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  return '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtSigned(n) {
  const prefix = n >= 0 ? '+$' : '-$';
  return prefix + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function val(id) {
  return parseFloat(document.getElementById(id)?.value) || 0;
}

function update() {
  const income      = val('income') + val('sideIncome') + val('otherIncome');
  const categories  = EXPENSE_CATEGORIES.map(c => ({ ...c, amount: val(c.id) }));
  const expenses    = categories.filter(c => c.amount > 0);
  const totalExp    = expenses.reduce((s, c) => s + c.amount, 0);
  const surplus     = income - totalExp;

  // ── Labels ──
  document.getElementById('incomeLabel').textContent   = fmt(income);
  document.getElementById('expensesLabel').textContent = fmt(totalExp);
  document.getElementById('incomeDisplay').textContent   = fmt(income);
  document.getElementById('expensesDisplay').textContent = fmt(totalExp);

  // ── Surplus ──
  const surplusEl   = document.getElementById('surplusDisplay');
  const surplusMeta = document.getElementById('surplusMeta');
  surplusEl.textContent = fmtSigned(surplus);
  surplusEl.className   = 'stat-value ' + (surplus >= 0 ? 'stat-positive' : 'stat-negative');

  if (income > 0 || totalExp > 0) {
    if (surplus > 0) {
      surplusMeta.textContent = `You have ${fmt(surplus)} left over each month`;
    } else if (surplus < 0) {
      surplusMeta.innerHTML = `<span style="color:var(--red)">You're spending ${fmt(Math.abs(surplus))} more than you earn</span>`;
    } else {
      surplusMeta.textContent = 'Your income and expenses are exactly balanced';
    }
  }

  // ── Savings Rate ──
  if (income > 0) {
    const rateWrap = document.getElementById('savingsRateWrap');
    rateWrap.classList.remove('hidden');
    const rate = Math.max(0, (surplus / income) * 100);
    document.getElementById('savingsRate').textContent = rate.toFixed(1) + '%';
    document.getElementById('savingsRateBar').style.width = Math.min(100, rate) + '%';
    document.getElementById('savingsRateBar').style.background =
      rate >= 20 ? 'var(--green)' : rate >= 10 ? 'var(--teal)' : 'var(--amber)';
  }

  // ── Chart ──
  const hasExp = expenses.length > 0;
  document.getElementById('budgetChartEmpty').classList.toggle('hidden', hasExp);
  document.getElementById('budgetChartArea').classList.toggle('hidden', !hasExp);

  if (hasExp) {
    renderChart(expenses, totalExp);
    renderCategoryAnalysis(expenses, totalExp, income);
    render502030(expenses, income);
  }
}

function renderChart(expenses, totalExp) {
  const ctx = document.getElementById('budgetChart').getContext('2d');
  if (budgetChart) budgetChart.destroy();

  budgetChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: expenses.map(e => e.label),
      datasets: [{
        data: expenses.map(e => e.amount),
        backgroundColor: expenses.map(e => e.color),
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = ((ctx.raw / totalExp) * 100).toFixed(1);
              return ` ${ctx.label}: $${ctx.raw.toLocaleString()} (${pct}%)`;
            }
          }
        }
      }
    }
  });

  // Legend
  const legend = document.getElementById('budgetLegend');
  legend.innerHTML = '';
  expenses.forEach(e => {
    const pct = ((e.amount / totalExp) * 100).toFixed(1);
    const row = document.createElement('div');
    row.className = 'category-row';
    row.innerHTML = `
      <div class="category-dot" style="background:${e.color}"></div>
      <div class="category-name">${e.label}</div>
      <div class="category-amount">$${e.amount.toLocaleString()}</div>
      <div class="category-pct">${pct}%</div>
    `;
    legend.appendChild(row);
  });
}

function renderCategoryAnalysis(expenses, totalExp, income) {
  const container = document.getElementById('categoryAnalysis');
  container.innerHTML = '';

  // Sort by amount descending
  const sorted = [...expenses].sort((a, b) => b.amount - a.amount);

  sorted.forEach(e => {
    const pctOfExp = totalExp > 0 ? (e.amount / totalExp) * 100 : 0;
    const pctOfInc = income > 0  ? (e.amount / income)  * 100 : 0;

    let indicatorColor = 'var(--teal)';
    // Flag high-spend categories
    if (e.id === 'housing'   && pctOfInc > 30) indicatorColor = 'var(--amber)';
    if (e.id === 'dining'    && pctOfInc > 10) indicatorColor = 'var(--amber)';
    if (e.id === 'coffee'    && e.amount > 100) indicatorColor = 'var(--amber)';
    if (e.id === 'subscriptions' && e.amount > 100) indicatorColor = 'var(--amber)';

    const row = document.createElement('div');
    row.style.marginBottom = '1rem';
    row.innerHTML = `
      <div class="flex-between mb-1">
        <span style="font-weight:500; font-size:0.9rem;">${e.label}</span>
        <div style="display:flex; gap:0.75rem; align-items:center;">
          <span style="font-size:0.8125rem; color:var(--text-muted);">${pctOfInc.toFixed(0)}% of income</span>
          <span style="font-weight:700; font-size:0.9rem;">$${e.amount.toLocaleString()}</span>
        </div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${Math.min(100, pctOfExp)}%; background:${indicatorColor};"></div>
      </div>
    `;
    container.appendChild(row);
  });
}

function render502030(expenses, income) {
  const container = document.getElementById('rule502030');
  if (income === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:1.5rem;"><p>Enter your income to see the 50/30/20 comparison</p></div>';
    return;
  }

  const needsIds  = ['housing','utilities','internet','groceries','health','carPayment','gas','debtPayments'];
  const wantsIds  = ['dining','coffee','transit','subscriptions','entertainment','shopping','gym','personal'];
  const savingsIds= ['savingsContrib'];

  const needsAmt   = expenses.filter(e => needsIds.includes(e.id)).reduce((s,e) => s + e.amount, 0);
  const wantsAmt   = expenses.filter(e => wantsIds.includes(e.id)).reduce((s,e) => s + e.amount, 0);
  const savingsAmt = expenses.filter(e => savingsIds.includes(e.id)).reduce((s,e) => s + e.amount, 0);

  const needsPct   = (needsAmt / income) * 100;
  const wantsPct   = (wantsAmt / income) * 100;
  const savingsPct = (savingsAmt / income) * 100;

  const rows = [
    { label: 'Needs (essentials)',  actual: needsPct,   target: 50, amount: needsAmt,   color: '#0F1F3D' },
    { label: 'Wants (lifestyle)',   actual: wantsPct,   target: 30, amount: wantsAmt,   color: '#F59E0B' },
    { label: 'Savings / Debt',      actual: savingsPct, target: 20, amount: savingsAmt, color: '#10B981' },
  ];

  container.innerHTML = '';

  rows.forEach(r => {
    const diff  = r.actual - r.target;
    const over  = diff > 0;
    const badge = over
      ? `<span class="badge badge-amber">${diff.toFixed(0)}% over target</span>`
      : `<span class="badge badge-green">${Math.abs(diff).toFixed(0)}% under target</span>`;

    const row = document.createElement('div');
    row.style.marginBottom = '1.25rem';
    row.innerHTML = `
      <div class="flex-between mb-1">
        <span style="font-weight:600; font-size:0.9rem;">${r.label}</span>
        ${badge}
      </div>
      <div class="flex-between" style="font-size:0.8125rem; color:var(--text-muted); margin-bottom:0.375rem;">
        <span>$${r.amount.toLocaleString()} · <strong style="color:var(--text)">${r.actual.toFixed(0)}%</strong> of income</span>
        <span>Target: ${r.target}%</span>
      </div>
      <div class="progress-bar" style="background:#f0f2f8;">
        <div class="progress-fill" style="width:${Math.min(100, r.actual)}%; background:${over ? 'var(--amber)' : r.color};"></div>
      </div>
      <div style="position:relative; margin-top:-8px; height:8px;">
        <div style="position:absolute; left:${r.target}%; width:2px; height:8px; background:rgba(0,0,0,0.25); border-radius:1px;"></div>
      </div>
    `;
    container.appendChild(row);
  });

  const note = document.createElement('p');
  note.style.cssText = 'font-size:0.8rem; color:var(--text-muted); margin-top:0.75rem;';
  note.textContent = 'The 50/30/20 rule is a popular guideline, not a strict rule. Every financial situation is different.';
  container.appendChild(note);
}

update();
