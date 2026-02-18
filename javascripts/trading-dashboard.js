async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return await res.json();
}

function uniq(arr) { return [...new Set(arr)]; }

function pctLabel(v) {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${Number(v).toFixed(2)}%`;
}

// Equity curve (normalised) with X-axis labels = % gain per trade (as requested)
function makeEquitySeries(trades) {
  let equity = 100;
  const y = [];
  const xLabels = [];
  trades.forEach((t) => {
    equity *= (1 + (t.pct_gain / 100));
    y.push(Number(equity.toFixed(2)));
    xLabels.push(pctLabel(t.pct_gain)); // <-- x axis becomes % gains labels
  });
  return { xLabels, y };
}

let equityChart, barChart;

function renderEquityChart(trades) {
  const { xLabels, y } = makeEquitySeries(trades);
  const ctx = document.getElementById("equityChart");

  if (equityChart) equityChart.destroy();

  equityChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: xLabels,
      datasets: [{
        label: "Normalised Equity",
        data: y,
        tension: 0.35,
        pointRadius: 3,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => `Trade % Gain: ${items[0].label}`,
            label: (ctx) => `Normalised Equity: ${ctx.parsed.y}`
          }
        }
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: false }
      }
    }
  });
}

function renderBarChart(trades) {
  const ctx = document.getElementById("barChart");
  if (barChart) barChart.destroy();

  barChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: trades.map(t => `${t.ticker} #${t.trade_id}`),
      datasets: [{
        label: "% Gain",
        data: trades.map(t => t.pct_gain),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const t = trades[ctx.dataIndex];
              return `${t.ticker}: ${pctLabel(t.pct_gain)} | ${t.days_held}d | ${t.strategy}`;
            }
          }
        }
      },
      scales: {
        y: { ticks: { callback: v => `${v}%` } }
      }
    }
  });
}

function renderTable(trades) {
  const tb = document.querySelector("#tradeTable tbody");
  tb.innerHTML = trades.map(t => `
    <tr>
      <td>${t.trade_id}</td>
      <td>${t.ticker}</td>
      <td>${t.entry_date}</td>
      <td>${t.exit_date}</td>
      <td>${pctLabel(t.pct_gain)}</td>
      <td>${t.days_held}</td>
      <td>${t.strategy}</td>
    </tr>
  `).join("");
}

function fillSelect(id, values, includeAll=true) {
  const el = document.getElementById(id);
  const opts = (includeAll ? ["ALL", ...values] : values);
  el.innerHTML = opts.map(v => `<option value="${v}">${v}</option>`).join("");
}

async function initDashboard() {
  const mount = document.getElementById("tradeDash");
  if (!mount) return;

  const [tradesAll, summary] = await Promise.all([
    loadJSON("/assets/trades_2025.json"),
    loadJSON("/assets/summary_2025.json")
  ]);

  // populate header metrics
  document.getElementById("dashTradeCount").textContent = summary.trade_count;
  document.getElementById("dashWinRate").textContent = `${summary.win_rate_pct}%`;
  document.getElementById("dashAvgGain").textContent = `${summary.avg_pct_gain}%`;
  document.getElementById("dashAvgDays").textContent = `${summary.avg_days_held} days`;

  // dropdowns
  fillSelect("tickerSelect", summary.tickers_traded);
  fillSelect("strategySelect", summary.strategies);

  const tickerSel = document.getElementById("tickerSelect");
  const stratSel = document.getElementById("strategySelect");

  function filtered() {
    return tradesAll.filter(t => {
      const okTicker = tickerSel.value === "ALL" || t.ticker === tickerSel.value;
      const okStrat  = stratSel.value === "ALL" || t.strategy === stratSel.value;
      return okTicker && okStrat;
    });
  }

  function update() {
    const trades = filtered();
    renderEquityChart(trades);
    renderBarChart(trades);
    renderTable(trades);
  }

  tickerSel.addEventListener("change", update);
  stratSel.addEventListener("change", update);

  update();
}

document.addEventListener("DOMContentLoaded", initDashboard);