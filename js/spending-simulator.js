/* ─── Spending Simulator ─────────────────────────────────────── */

let simChart = null;

function fmt(n) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return '$' + Math.round(n).toLocaleString('en-US');
  return '$' + Math.round(n).toLocaleString('en-US');
}

function fmtShort(n) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(1) + 'k';
  return '$' + Math.round(n);
}

function val(id) {
  return parseFloat(document.getElementById(id)?.value) || 0;
}

// Future Value of monthly annuity with compound interest
function futureValue(monthlyPMT, annualRate, years) {
  if (monthlyPMT <= 0) return 0;
  const months = years * 12;
  const r = annualRate / 100 / 12;
  if (r === 0) return monthlyPMT * months;
  return monthlyPMT * ((Math.pow(1 + r, months) - 1) / r);
}

// Generate monthly data for chart
function generateMonthlyData(monthlyPMT, annualRate, totalYears) {
  const r = annualRate / 100 / 12;
  const data = [];
  let fv = 0;
  for (let m = 1; m <= totalYears * 12; m++) {
    if (r === 0) {
      fv = monthlyPMT * m;
    } else {
      fv = monthlyPMT * ((Math.pow(1 + r, m) - 1) / r);
    }
    data.push(fv);
  }
  return data;
}

function loadScenario(name, current, newAmt) {
  document.getElementById('categoryName').value = name;
  document.getElementById('currentSpend').value = current;
  document.getElementById('newSpend').value = newAmt;
  update();
}

function update() {
  const currentSpend = val('currentSpend');
  const newSpend     = Math.min(val('newSpend'), currentSpend);
  const monthlySaved = Math.max(0, currentSpend - newSpend);
  const annualReturn = val('returnRate');
  const debtRate     = val('debtRate');
  const category     = document.getElementById('categoryName').value || 'your spending change';

  document.getElementById('returnRateDisplay').textContent = annualReturn + '%';
  document.getElementById('monthlySavingsAmt').textContent = fmt(monthlySaved) + '/mo';
  document.getElementById('categoryLabel').textContent = category;

  // ── Timeline Values ──
  const YEARS = [1, 5, 10, 20];
  const values = YEARS.map(y => futureValue(monthlySaved, annualReturn, y));
  const contribs = YEARS.map(y => monthlySaved * 12 * y);

  document.getElementById('yr1').textContent      = fmtShort(values[0]);
  document.getElementById('yr5').textContent      = fmtShort(values[1]);
  document.getElementById('yr10').textContent     = fmtShort(values[2]);
  document.getElementById('yr20').textContent     = fmtShort(values[3]);
  document.getElementById('yr1contrib').textContent  = fmt(contribs[0]) + ' saved';
  document.getElementById('yr5contrib').textContent  = fmt(contribs[1]) + ' saved';
  document.getElementById('yr10contrib').textContent = fmt(contribs[2]) + ' saved';
  document.getElementById('yr20contrib').textContent = fmt(contribs[3]) + ' saved';

  document.getElementById('bigNumber').textContent = fmt(values[3]);

  // ── Chart ──
  renderChart(monthlySaved, annualReturn, contribs);

  // ── Invest vs. Debt ──
  renderDebtVsInvest(monthlySaved, annualReturn, debtRate, YEARS);

  // ── Real World Context ──
  renderContext(values, contribs, category);
}

function renderChart(monthlySaved, annualReturn, contribs) {
  const ctx = document.getElementById('simChart').getContext('2d');
  if (simChart) simChart.destroy();

  const TOTAL_YEARS = 20;
  const monthlyData = generateMonthlyData(monthlySaved, annualReturn, TOTAL_YEARS);

  // Sample every 3 months for chart
  const labels = [];
  const investedData = [];
  const contributionData = [];

  for (let m = 3; m <= TOTAL_YEARS * 12; m += 3) {
    const yr = m / 12;
    labels.push(yr % 1 === 0 ? `Year ${yr}` : '');
    investedData.push(monthlyData[m - 1]);
    contributionData.push(monthlySaved * m);
  }

  const interestData = investedData.map((v, i) => v - contributionData[i]);

  simChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Your Contributions',
          data: contributionData,
          backgroundColor: 'rgba(0,180,162,0.5)',
          borderColor: 'var(--teal)',
          borderWidth: 1,
          stack: 'stack',
        },
        {
          label: 'Investment Growth',
          data: interestData,
          backgroundColor: 'rgba(15,31,61,0.7)',
          borderColor: 'var(--navy)',
          borderWidth: 1,
          stack: 'stack',
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { maxTicksLimit: 10, font: { size: 11 } }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: {
            font: { size: 11 },
            callback: v => v >= 1000 ? '$' + (v/1000).toFixed(0) + 'k' : '$' + v
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
            label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}`
          }
        }
      }
    }
  });
}

function renderDebtVsInvest(monthly, investRate, debtRate, years) {
  const container = document.getElementById('debtVsInvest');
  if (monthly === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);">Enter a spending change to see the comparison.</p>';
    return;
  }

  container.innerHTML = '';
  years.forEach(y => {
    const investFV    = futureValue(monthly, investRate, y);
    const debtSaved   = monthly * 12 * y * (debtRate / 100); // simplified interest saved
    const contrib     = monthly * 12 * y;
    const interestGain = investFV - contrib;

    const row = document.createElement('div');
    row.style.marginBottom = '1.25rem';
    row.innerHTML = `
      <div class="flex-between" style="margin-bottom:0.5rem;">
        <span style="font-weight:600; font-size:0.9rem;">${y} Year${y > 1 ? 's' : ''}</span>
        <span style="font-size:0.8125rem; color:var(--text-muted);">${fmt(contrib)} contributed</span>
      </div>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem;">
        <div style="background:var(--teal-light); border-radius:var(--radius-sm); padding:0.875rem;">
          <div style="font-size:0.75rem; color:#005A52; font-weight:600; margin-bottom:0.25rem;">📈 If Invested (${investRate}%)</div>
          <div style="font-size:1.125rem; font-weight:800; color:var(--teal);">${fmt(investFV)}</div>
          <div style="font-size:0.75rem; color:#005A52;">${fmt(interestGain)} growth</div>
        </div>
        <div style="background:var(--green-light); border-radius:var(--radius-sm); padding:0.875rem;">
          <div style="font-size:0.75rem; color:#065F46; font-weight:600; margin-bottom:0.25rem;">💳 If Applied to Debt (${debtRate}%)</div>
          <div style="font-size:1.125rem; font-weight:800; color:var(--green);">${fmt(contrib)}</div>
          <div style="font-size:0.75rem; color:#065F46;">${fmt(debtSaved)} interest avoided*</div>
        </div>
      </div>
    `;
    container.appendChild(row);
  });

  const note = document.createElement('p');
  note.style.cssText = 'font-size:0.75rem; color:var(--text-muted); margin-top:0.5rem;';
  note.textContent = '* Debt interest saved is a simplified estimate. Actual savings depend on your debt balance and payoff schedule.';
  container.appendChild(note);
}

function renderContext(values, contribs, category) {
  const container = document.getElementById('realWorldContext');
  const v20 = values[3]; // 20-year value

  if (v20 === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);">Enter a spending change to see what your savings could mean in real-world terms.</p>';
    return;
  }

  const milestones = [];

  if (v20 >= 1_000_000) milestones.push(`🏆 More than <strong>$1 million</strong> — a full investment milestone, from one habit change`);
  if (values[1] >= 10_000) milestones.push(`✈️ <strong>${fmt(values[1])}</strong> in 5 years — enough for a dream vacation, a car down payment, or a full emergency fund`);
  if (values[2] >= 50_000) milestones.push(`🏡 <strong>${fmt(values[2])}</strong> in 10 years — a meaningful chunk toward a home down payment`);
  milestones.push(`📅 <strong>${fmt(contribs[3])}</strong> total contributed over 20 years — the rest is pure compound growth`);

  const grow = v20 - contribs[3];
  if (grow > 0) {
    milestones.push(`📈 Compound growth adds <strong>${fmt(grow)}</strong> on top of what you put in — that's money your money earns`);
  }

  container.innerHTML = '';
  milestones.forEach(m => {
    const p = document.createElement('p');
    p.style.cssText = 'padding: 0.625rem 0; border-bottom: 1px solid var(--border); font-size: 0.9rem; line-height: 1.55;';
    p.innerHTML = m;
    container.appendChild(p);
  });

  const disclaimer = document.createElement('p');
  disclaimer.style.cssText = 'font-size:0.75rem; color:var(--text-muted); margin-top:0.75rem;';
  disclaimer.textContent = 'These are illustrative projections, not guarantees. Investment returns fluctuate. This content is for educational purposes only.';
  container.appendChild(disclaimer);
}

// Initialize
update();
