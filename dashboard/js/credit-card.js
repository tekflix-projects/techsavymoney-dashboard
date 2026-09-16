/* ─── Credit Card Payoff Calculator ───────────────────────────── */

var ccChart = null;

var EXPENSE_IDS = ['exp-housing','exp-utilities','exp-food','exp-transport','exp-subscriptions','exp-other'];

function fmt(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function val(id, fallback) {
  fallback = fallback === undefined ? 0 : fallback;
  var el = document.getElementById(id);
  return el ? (parseFloat(el.value) || fallback) : fallback;
}

function totalExpenses() {
  return EXPENSE_IDS.reduce(function (sum, id) { return sum + val(id); }, 0);
}

function simulatePayoff(balance, apr, payment) {
  if (balance <= 0 || payment <= 0) return null;
  var monthlyRate = apr / 100 / 12;
  var remaining   = balance;
  var totalInt    = 0;
  var months      = 0;
  var history     = [{ month: 0, remaining: balance }];

  /* If payment doesn't cover the first month's interest, debt grows forever */
  if (apr > 0 && payment <= balance * monthlyRate) {
    return { neverPaysOff: true };
  }

  while (remaining > 0.005 && months < 600) {
    months++;
    var interest = remaining * monthlyRate;
    totalInt  += interest;
    remaining += interest;
    var pay   = Math.min(payment, remaining);
    remaining = Math.max(0, remaining - pay);
    history.push({ month: months, remaining: remaining });
  }

  return { months: months, totalInterest: totalInt, history: history, neverPaysOff: false };
}

function monthsToStr(months) {
  var yrs = Math.floor(months / 12);
  var mos = months % 12;
  if (yrs === 0) return mos + ' month' + (mos !== 1 ? 's' : '');
  if (mos === 0) return yrs + ' year' + (yrs !== 1 ? 's' : '');
  return yrs + ' yr' + (yrs !== 1 ? 's' : '') + ' ' + mos + ' mo';
}

function monthsToDate(months) {
  var d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function update() {
  var income     = val('income');
  var expenses   = totalExpenses();
  var balance    = val('cc-balance');
  var apr        = val('cc-apr', 20);
  var minPay     = val('cc-min', 25);
  var surplus    = income - expenses;
  var available  = Math.max(0, surplus);

  /* ── Live expense total ── */
  document.getElementById('expenses-total').textContent = fmt(expenses);

  /* ── Budget summary row ── */
  if (income > 0) {
    document.getElementById('stat-income').textContent   = fmt(income);
    document.getElementById('stat-expenses').textContent = fmt(expenses);
    var surplusEl = document.getElementById('stat-surplus');
    surplusEl.textContent  = fmt(surplus);
    surplusEl.className    = 'stat-value ' + (surplus >= 0 ? 'stat-positive' : 'stat-negative');
    document.getElementById('budget-summary').classList.remove('hidden');
  } else {
    document.getElementById('budget-summary').classList.add('hidden');
  }

  /* ── Guard: need balance to show results ── */
  var hasData = balance > 0;
  document.getElementById('results-empty').classList.toggle('hidden', hasData);
  document.getElementById('results-area').classList.toggle('hidden', !hasData);
  if (!hasData) return;

  /* ── Recommended payment ── */
  var recPayment = Math.max(minPay, available);
  var samePayment = Math.abs(recPayment - minPay) < 0.01;

  /* ── Simulations ── */
  var minSim = simulatePayoff(balance, apr, minPay);
  var recSim = simulatePayoff(balance, apr, recPayment);

  /* ── Min payment card ── */
  document.getElementById('min-pay-display').textContent = fmt(minPay) + '/mo';
  if (!minSim || minSim.neverPaysOff) {
    document.getElementById('min-months').textContent   = 'Never (growing)';
    document.getElementById('min-interest').textContent = '—';
    document.getElementById('min-date').textContent     = '—';
  } else {
    document.getElementById('min-months').textContent   = monthsToStr(minSim.months);
    document.getElementById('min-interest').textContent = fmt(minSim.totalInterest);
    document.getElementById('min-date').textContent     = monthsToDate(minSim.months);
  }

  /* ── Recommended payment card ── */
  document.getElementById('rec-pay-display').textContent = fmt(recPayment) + '/mo';
  document.getElementById('rec-card').classList.toggle('winner', !samePayment);
  document.getElementById('rec-winner-badge').classList.toggle('hidden', samePayment);

  if (!recSim || recSim.neverPaysOff) {
    document.getElementById('rec-months').textContent   = 'Never (growing)';
    document.getElementById('rec-interest').textContent = '—';
    document.getElementById('rec-date').textContent     = '—';
  } else {
    document.getElementById('rec-months').textContent   = monthsToStr(recSim.months);
    document.getElementById('rec-interest').textContent = fmt(recSim.totalInterest);
    document.getElementById('rec-date').textContent     = monthsToDate(recSim.months);
  }

  /* ── Insight callout ── */
  var insightEl = document.getElementById('payoff-insight');
  if (surplus < 0) {
    insightEl.innerHTML = '<strong>Heads up:</strong> Your expenses exceed your income by ' + fmt(Math.abs(surplus)) + '/mo. Reducing expenses will free up money to tackle this debt faster.';
    insightEl.style.background = 'var(--red-light)';
    insightEl.style.color = '#991B1B';
  } else if (samePayment) {
    insightEl.innerHTML = 'Your available budget matches your minimum payment. Even an extra <strong>$25–$50/mo</strong> can cut months off your payoff timeline and save real money in interest.';
    insightEl.style.background = 'var(--amber-light)';
    insightEl.style.color = '#92400E';
  } else if (minSim && !minSim.neverPaysOff && recSim && !recSim.neverPaysOff) {
    var saved   = minSim.totalInterest - recSim.totalInterest;
    var faster  = minSim.months - recSim.months;
    insightEl.innerHTML = '<strong>Paying ' + fmt(recPayment) + '/mo instead of the minimum saves you ' + fmt(saved) + ' in interest</strong> and gets you debt-free ' + monthsToStr(faster) + ' sooner.';
    insightEl.style.background = 'var(--teal-light)';
    insightEl.style.color = '#005A52';
  } else if (minSim && minSim.neverPaysOff) {
    insightEl.innerHTML = '<strong>Warning:</strong> Your minimum payment doesn\'t cover the monthly interest. Your balance is growing. Increase your payment to start making progress.';
    insightEl.style.background = 'var(--red-light)';
    insightEl.style.color = '#991B1B';
  } else {
    insightEl.innerHTML = '';
  }

  /* ── Chart ── */
  if (minSim && recSim && !minSim.neverPaysOff && !recSim.neverPaysOff) {
    renderChart(minSim.history, recSim.history);
    document.getElementById('chart-card').classList.remove('hidden');
  } else {
    document.getElementById('chart-card').classList.add('hidden');
  }
}

function renderChart(minHistory, recHistory) {
  var ctx = document.getElementById('cc-chart').getContext('2d');
  if (ccChart) ccChart.destroy();

  var maxLen = Math.max(minHistory.length, recHistory.length);
  var step   = Math.max(1, Math.floor(maxLen / 60));
  var labels = [], minData = [], recData = [];

  for (var i = 0; i < maxLen; i += step) {
    var mo = minHistory[i] ? minHistory[i].month : maxLen;
    labels.push(mo === 0 ? 'Now' : (mo % 12 === 0 ? 'Yr ' + (mo / 12) : ''));
    minData.push(minHistory[i] ? minHistory[i].remaining : 0);
    recData.push(recHistory[i] ? recHistory[i].remaining : 0);
  }
  /* Always cap at 0 */
  labels.push('Paid off');
  minData.push(0);
  recData.push(0);

  ccChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Minimum Payment',
          data: minData,
          borderColor: '#D14436',
          backgroundColor: 'rgba(209,68,54,0.06)',
          borderWidth: 2.5,
          tension: 0.3,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 5
        },
        {
          label: 'Max Payoff',
          data: recData,
          borderColor: '#0E9C84',
          backgroundColor: 'rgba(14,156,132,0.08)',
          borderWidth: 2.5,
          tension: 0.3,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          ticks: { maxTicksLimit: 10, font: { size: 11 } }
        },
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 11 },
            callback: function (v) {
              return '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v);
            }
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
            label: function (ctx) {
              return ' ' + ctx.dataset.label + ': ' + fmt(ctx.raw) + ' remaining';
            }
          }
        }
      }
    }
  });
}
