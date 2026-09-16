/* ─── Net Worth Calculator ─────────────────────────────────────── */

const ASSET_FIELDS = [
  { id: 'checking',    label: 'Checking',      group: 'Cash & Savings',  color: '#00B4A2' },
  { id: 'savings',     label: 'Savings',        group: 'Cash & Savings',  color: '#00CDB8' },
  { id: 'emergency',   label: 'Emergency Fund', group: 'Cash & Savings',  color: '#33C9B8' },
  { id: 'retirement',  label: '401k / 403b',    group: 'Investments',     color: '#0F1F3D' },
  { id: 'ira',         label: 'IRA / Roth',     group: 'Investments',     color: '#1A3460' },
  { id: 'brokerage',   label: 'Brokerage',      group: 'Investments',     color: '#2A4A80' },
  { id: 'crypto',      label: 'Crypto',         group: 'Investments',     color: '#3A5A9A' },
  { id: 'realestate',  label: 'Real Estate',    group: 'Property',        color: '#10B981' },
  { id: 'vehicles',    label: 'Vehicles',       group: 'Property',        color: '#34D399' },
  { id: 'otherAssets', label: 'Other Assets',   group: 'Other',           color: '#6EE7B7' },
];

const LIABILITY_FIELDS = [
  { id: 'mortgage',         label: 'Mortgage' },
  { id: 'carLoan',          label: 'Car Loans' },
  { id: 'studentLoan',      label: 'Student Loans' },
  { id: 'creditCards',      label: 'Credit Cards' },
  { id: 'personalLoans',    label: 'Medical / Personal Loans' },
  { id: 'otherLiabilities', label: 'Other Debt' },
];

let chart = null;

function fmt(n) {
  if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1_000)    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function val(id) {
  return parseFloat(document.getElementById(id)?.value) || 0;
}

function update() {
  const assets = ASSET_FIELDS.map(f => ({ ...f, amount: val(f.id) })).filter(f => f.amount > 0);
  const totalAssets = assets.reduce((s, f) => s + f.amount, 0);

  const liabilities = LIABILITY_FIELDS.map(f => ({ ...f, amount: val(f.id) })).filter(f => f.amount > 0);
  const totalLiabilities = liabilities.reduce((s, f) => s + f.amount, 0);

  const netWorth = totalAssets - totalLiabilities;

  // ── Labels ──
  document.getElementById('totalAssetsLabel').textContent      = fmt(totalAssets);
  document.getElementById('totalLiabilitiesLabel').textContent = fmt(totalLiabilities);
  document.getElementById('assetsDisplay').textContent         = fmt(totalAssets);
  document.getElementById('liabilitiesDisplay').textContent    = fmt(totalLiabilities);

  // ── Net Worth Display ──
  const nwEl    = document.getElementById('netWorthDisplay');
  const nwBadge = document.getElementById('netWorthBadge');

  nwEl.textContent = fmt(netWorth);

  if (totalAssets === 0 && totalLiabilities === 0) {
    nwEl.className = 'stat-value';
    nwBadge.className = 'badge badge-navy';
    nwBadge.textContent = 'Enter your numbers above';
  } else if (netWorth > 0) {
    nwEl.className = 'stat-value stat-positive';
    nwBadge.className = 'badge badge-green';
    nwBadge.textContent = 'Positive Net Worth ✓';
  } else if (netWorth === 0) {
    nwEl.className = 'stat-value stat-neutral';
    nwBadge.className = 'badge badge-amber';
    nwBadge.textContent = 'Breaking Even';
  } else {
    nwEl.className = 'stat-value stat-negative';
    nwBadge.className = 'badge badge-red';
    nwBadge.textContent = 'Negative Net Worth';
  }

  // ── Chart ──
  const hasData = totalAssets > 0 || totalLiabilities > 0;
  document.getElementById('chartEmpty').classList.toggle('hidden', hasData);
  document.getElementById('chartArea').classList.toggle('hidden', !hasData);

  if (hasData) {
    renderChart(assets, totalAssets, totalLiabilities);
    renderBreakdown(assets, totalAssets);
  }

  // ── Insight ──
  renderInsight(netWorth, totalAssets, totalLiabilities);
}

function renderChart(assets, totalAssets, totalLiabilities) {
  const ctx = document.getElementById('netWorthChart').getContext('2d');

  const labels  = [...assets.map(a => a.label), 'Total Debt'];
  const data    = [...assets.map(a => a.amount), totalLiabilities];
  const colors  = [...assets.map(a => a.color), '#EF4444'];

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}`
          }
        }
      }
    }
  });

  // Breakdown legend
  const breakdown = document.getElementById('chartBreakdown');
  breakdown.innerHTML = '';
  const allItems = [...assets.map(a => ({ label: a.label, amount: a.amount, color: a.color })),
                    ...(totalLiabilities > 0 ? [{ label: 'Total Debt', amount: totalLiabilities, color: '#EF4444' }] : [])];
  const total = totalAssets + totalLiabilities;

  allItems.forEach(item => {
    if (item.amount === 0) return;
    const pct = total > 0 ? ((item.amount / total) * 100).toFixed(1) : 0;
    const row = document.createElement('div');
    row.className = 'category-row';
    row.innerHTML = `
      <div class="category-dot" style="background:${item.color}"></div>
      <div class="category-name">${item.label}</div>
      <div class="category-amount">${fmt(item.amount)}</div>
      <div class="category-pct">${pct}%</div>
    `;
    breakdown.appendChild(row);
  });
}

function renderBreakdown(assets, totalAssets) {
  const container = document.getElementById('assetBreakdown');
  if (assets.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:1.5rem;"><p>Add assets to see breakdown</p></div>';
    return;
  }

  // Group by category
  const groups = {};
  assets.forEach(a => {
    if (!groups[a.group]) groups[a.group] = { total: 0, items: [] };
    groups[a.group].total += a.amount;
    groups[a.group].items.push(a);
  });

  container.innerHTML = '';
  Object.entries(groups).forEach(([groupName, group]) => {
    const pct = totalAssets > 0 ? ((group.total / totalAssets) * 100).toFixed(0) : 0;
    const section = document.createElement('div');
    section.style.marginBottom = '1rem';
    section.innerHTML = `
      <div class="flex-between mb-1">
        <span style="font-size:0.8125rem; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em;">${groupName}</span>
        <span style="font-weight:700; color:var(--navy);">${fmt(group.total)}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%; background:${group.items[0].color};"></div>
      </div>
    `;
    container.appendChild(section);
  });
}

function renderInsight(netWorth, totalAssets, totalLiabilities) {
  const el = document.getElementById('insightText');

  if (totalAssets === 0 && totalLiabilities === 0) {
    el.innerHTML = '<p>Enter your numbers to get a plain-language interpretation of your financial position.</p>';
    return;
  }

  const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 100;
  let insight = '';

  if (netWorth > 0) {
    insight += `<p style="margin-bottom:0.75rem;">Your net worth is <strong style="color:var(--green)">${fmt(netWorth)}</strong> — that's the gap between what you own and what you owe. This is a solid starting point.</p>`;
  } else if (netWorth < 0) {
    insight += `<p style="margin-bottom:0.75rem;">Your net worth is <strong style="color:var(--red)">${fmt(netWorth)}</strong>. This means your debts currently outweigh your assets — which is common, especially with mortgages or student loans early in life. The goal is to close this gap over time.</p>`;
  } else {
    insight += `<p style="margin-bottom:0.75rem;">Your assets and liabilities are perfectly balanced at $0. Every dollar you add to savings or pay down in debt moves this in your favor.</p>`;
  }

  if (debtRatio < 30) {
    insight += `<p style="margin-bottom:0.75rem;">Your <strong>debt-to-asset ratio is ${debtRatio.toFixed(0)}%</strong> — that's healthy. Less than 30% is generally considered strong financial footing.</p>`;
  } else if (debtRatio < 60) {
    insight += `<p style="margin-bottom:0.75rem;">Your <strong>debt-to-asset ratio is ${debtRatio.toFixed(0)}%</strong>. There's room for improvement. Paying down high-interest debt is often the fastest path to improving this number.</p>`;
  } else {
    insight += `<p style="margin-bottom:0.75rem;">Your <strong>debt-to-asset ratio is ${debtRatio.toFixed(0)}%</strong>. A high debt load relative to your assets suggests focusing on debt reduction before aggressive investing may help stabilize your position.</p>`;
  }

  insight += `<p style="font-size:0.8125rem; color:var(--text-muted); margin-top:1rem;">Net worth is a snapshot, not a verdict. It changes every time you save, invest, pay down debt, or your assets appreciate.</p>`;

  el.innerHTML = insight;
}

// Init on load
update();
