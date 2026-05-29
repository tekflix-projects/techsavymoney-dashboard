/* ─── Debt Payoff Calculator ──────────────────────────────────── */

let debtCount = 0;
let debtChart = null;

const DEBT_COLORS = ['#0F1F3D','#00B4A2','#F59E0B','#10B981','#EF4444','#8B5CF6','#EC4899','#06B6D4'];

function fmt(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function addDebt(name = '', balance = '', rate = '', minPayment = '') {
  debtCount++;
  const id = debtCount;
  const color = DEBT_COLORS[(id - 1) % DEBT_COLORS.length];

  const container = document.getElementById('debtList');
  const item = document.createElement('div');
  item.className = 'debt-item';
  item.id = `debt-${id}`;
  item.innerHTML = `
    <div class="debt-item-header">
      <div style="display:flex; align-items:center; gap:0.625rem;">
        <div style="width:12px; height:12px; border-radius:50%; background:${color}; flex-shrink:0;"></div>
        <span style="font-weight:600; font-size:0.9rem;">Debt ${id}</span>
      </div>
      <button class="btn btn-danger btn-sm" onclick="removeDebt(${id})">Remove</button>
    </div>
    <div class="debt-item-grid">
      <div class="form-group" style="grid-column: 1 / -1;">
        <label>Debt Name</label>
        <input type="text" id="name-${id}" placeholder="e.g. Chase Credit Card" value="${name}" oninput="update()" />
      </div>
      <div class="form-group">
        <label>Balance</label>
        <div class="input-prefix"><span>$</span><input type="number" id="balance-${id}" placeholder="0" min="0" value="${balance}" oninput="update()" /></div>
      </div>
      <div class="form-group">
        <label>Interest Rate</label>
        <div class="input-suffix"><input type="number" id="rate-${id}" placeholder="0.0" min="0" max="100" step="0.1" value="${rate}" oninput="update()" /><span>%</span></div>
      </div>
      <div class="form-group" style="grid-column: 1 / -1;">
        <label>Minimum Monthly Payment</label>
        <div class="input-prefix"><span>$</span><input type="number" id="min-${id}" placeholder="0" min="0" value="${minPayment}" oninput="update()" /></div>
      </div>
    </div>
  `;
  container.appendChild(item);
  update();
}

function removeDebt(id) {
  const el = document.getElementById(`debt-${id}`);
  if (el) el.remove();
  update();
}

function getDebts() {
  const debts = [];
  for (let i = 1; i <= debtCount; i++) {
    const el = document.getElementById(`debt-${i}`);
    if (!el) continue;
    const balance = parseFloat(document.getElementById(`balance-${i}`)?.value) || 0;
    const rate    = parseFloat(document.getElementById(`rate-${i}`)?.value)    || 0;
    const min     = parseFloat(document.getElementById(`min-${i}`)?.value)     || 0;
    const name    = document.getElementById(`name-${i}`)?.value || `Debt ${i}`;
    if (balance > 0) {
      debts.push({ id: i, name, balance, rate, minPayment: Math.max(min, 1), color: DEBT_COLORS[(i-1) % DEBT_COLORS.length] });
    }
  }
  return debts;
}

function simulatePayoff(debts, extraPayment, method) {
  if (debts.length === 0) return null;

  // Clone debts and sort
  let sortedDebts = debts.map(d => ({ ...d, remaining: d.balance }));
  if (method === 'avalanche') {
    sortedDebts.sort((a, b) => b.rate - a.rate);
  } else {
    sortedDebts.sort((a, b) => a.balance - b.balance);
  }

  let totalInterest = 0;
  let month = 0;
  const history = [];

  while (sortedDebts.some(d => d.remaining > 0.01) && month < 600) {
    month++;
    let availableExtra = extraPayment;

    // Apply interest and minimum payments
    sortedDebts.forEach(d => {
      if (d.remaining <= 0) return;
      const monthlyRate = d.rate / 100 / 12;
      const interest = d.remaining * monthlyRate;
      totalInterest += interest;
      d.remaining += interest;

      const payment = Math.min(d.minPayment, d.remaining);
      d.remaining -= payment;
      d.remaining = Math.max(0, d.remaining);
    });

    // Apply extra payment to priority debt (first non-zero in sorted order)
    for (let i = 0; i < sortedDebts.length; i++) {
      if (sortedDebts[i].remaining > 0 && availableExtra > 0) {
        const extra = Math.min(availableExtra, sortedDebts[i].remaining);
        sortedDebts[i].remaining -= extra;
        sortedDebts[i].remaining = Math.max(0, sortedDebts[i].remaining);
        availableExtra -= extra;
        if (availableExtra <= 0) break;
      }
    }

    history.push({
      month,
      totalRemaining: sortedDebts.reduce((s, d) => s + d.remaining, 0),
    });
  }

  return { months: month, totalInterest, history };
}

function monthsToDate(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function monthsToStr(months) {
  const yrs = Math.floor(months / 12);
  const mos = months % 12;
  if (yrs === 0) return `${mos} month${mos !== 1 ? 's' : ''}`;
  if (mos === 0) return `${yrs} year${yrs !== 1 ? 's' : ''}`;
  return `${yrs} yr${yrs !== 1 ? 's' : ''} ${mos} mo`;
}

function update() {
  const debts = getDebts();
  const extra = parseFloat(document.getElementById('extraPayment')?.value) || 0;

  const hasDebts = debts.length > 0;
  document.getElementById('resultsEmpty').classList.toggle('hidden', hasDebts);
  document.getElementById('resultsArea').classList.toggle('hidden', !hasDebts);

  if (!hasDebts) return;

  const totalBalance = debts.reduce((s, d) => s + d.balance, 0);
  const totalMin     = debts.reduce((s, d) => s + d.minPayment, 0);

  document.getElementById('totalDebtDisplay').textContent = fmt(totalBalance);
  document.getElementById('totalMinDisplay').textContent  = fmt(totalMin);

  const avalanche = simulatePayoff(debts, extra, 'avalanche');
  const snowball  = simulatePayoff(debts, extra, 'snowball');

  if (!avalanche || !snowball) return;

  // ── Method Cards ──
  document.getElementById('avalancheMonths').textContent   = monthsToStr(avalanche.months);
  document.getElementById('avalancheInterest').textContent = fmt(avalanche.totalInterest);
  document.getElementById('avalancheDate').textContent     = monthsToDate(avalanche.months);

  document.getElementById('snowballMonths').textContent   = monthsToStr(snowball.months);
  document.getElementById('snowballInterest').textContent = fmt(snowball.totalInterest);
  document.getElementById('snowballDate').textContent     = monthsToDate(snowball.months);

  const avalancheSaves = snowball.totalInterest - avalanche.totalInterest;
  const snowballFaster = avalanche.months - snowball.months;

  // Mark winner
  document.getElementById('avalancheCard').classList.toggle('winner', avalancheSaves >= 0);
  document.getElementById('snowballCard').classList.toggle('winner', snowballFaster > 0 && avalancheSaves < 0);
  document.getElementById('avalancheWinner').classList.toggle('hidden', avalancheSaves < 0);
  document.getElementById('snowballWinner').classList.toggle('hidden', snowballFaster <= 0 || avalancheSaves >= 0);

  const savingsEl = document.getElementById('interestSavings');
  if (Math.abs(avalancheSaves) < 10) {
    savingsEl.textContent = 'Both methods produce nearly the same result with your current debts.';
  } else if (avalancheSaves > 0) {
    savingsEl.innerHTML = `<strong>Avalanche saves you ${fmt(avalancheSaves)} in interest</strong> compared to Snowball. That's real money back in your pocket.`;
  } else {
    savingsEl.innerHTML = `With your specific debts, both methods are very close. Choose whichever keeps you motivated — consistency matters most.`;
  }

  // ── Chart ──
  renderChart(avalanche.history, snowball.history);

  // ── Debt Table ──
  renderDebtTable(debts);
}

function renderChart(avalancheHistory, snowballHistory) {
  const ctx = document.getElementById('debtChart').getContext('2d');
  if (debtChart) debtChart.destroy();

  const maxMonths = Math.max(avalancheHistory.length, snowballHistory.length);

  // Sample data points (max 60 for readability)
  const step = Math.max(1, Math.floor(maxMonths / 60));
  const labels = [];
  const aData  = [];
  const sData  = [];

  for (let i = 0; i < maxMonths; i += step) {
    const mo = i + 1;
    labels.push(mo % 12 === 0 ? `Yr ${mo/12}` : (i === 0 ? 'Now' : ''));
    aData.push(avalancheHistory[i]?.totalRemaining ?? 0);
    sData.push(snowballHistory[i]?.totalRemaining ?? 0);
  }
  // Always include final
  labels.push(monthsToDate(maxMonths));
  aData.push(0);
  sData.push(0);

  debtChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Avalanche',
          data: aData,
          borderColor: '#00B4A2',
          backgroundColor: 'rgba(0,180,162,0.08)',
          borderWidth: 2.5,
          tension: 0.3,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 5,
        },
        {
          label: 'Snowball',
          data: sData,
          borderColor: '#F59E0B',
          backgroundColor: 'rgba(245,158,11,0.06)',
          borderWidth: 2.5,
          tension: 0.3,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 5,
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { maxTicksLimit: 10, font: { size: 11 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: {
            font: { size: 11 },
            callback: v => '$' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v)
          }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { size: 12, weight: '600' }, usePointStyle: true, pointStyleWidth: 10 }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)} remaining`
          }
        }
      }
    }
  });
}

function renderDebtTable(debts) {
  const container = document.getElementById('debtSummaryTable');
  const sorted = [...debts].sort((a, b) => b.rate - a.rate);

  container.innerHTML = '';
  sorted.forEach(d => {
    const monthlyInterest = (d.balance * (d.rate / 100 / 12)).toFixed(2);
    const row = document.createElement('div');
    row.className = 'category-row';
    row.innerHTML = `
      <div class="category-dot" style="background:${d.color}"></div>
      <div class="category-name">
        <div style="font-weight:600;">${d.name}</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">$${d.minPayment}/mo min · $${monthlyInterest}/mo interest</div>
      </div>
      <div style="text-align:right;">
        <div class="category-amount">${fmt(d.balance)}</div>
        <div class="category-pct">${d.rate}% APR</div>
      </div>
    `;
    container.appendChild(row);
  });
}

// Start with 2 sample debts pre-filled
addDebt('Credit Card', '5000', '19.99', '100');
addDebt('Car Loan', '12000', '6.5', '250');
