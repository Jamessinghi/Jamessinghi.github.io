/**
 * stockviz.js
 * - Requires Chart.js to be loaded BEFORE this file (global Chart)
 * - Expects these IDs to exist on the page:
 *   stockSymbol, confidence, runStock, stockError, stockStats,
 *   statLast, statChg, statPE, stat1Y, stat5Y, stockChart
 *
 * Works with MkDocs Material:
 * - binds on DOMContentLoaded
 * - re-binds on SPA navigation via window.document$.subscribe (Material)
 */

// ---- CONFIG ----
// Set this to your actual Worker base URL (NO trailing slash)
const WORKER_BASE = "https://stock-proxy.jamessinghi.workers.dev";

// ---- STATE ----
let chartInstance = null;
let lastHistoryWeekly = null; // store last fetched history so confidence changes can re-render without refetch


// -------------------- formatting --------------------
function sizeCanvasToParent(canvasEl, fallbackHeight = 360) {
  const parent = canvasEl.parentElement;
  const w = parent?.clientWidth || canvasEl.clientWidth || 900;
  const h = parent?.clientHeight || fallbackHeight;

  // Set intrinsic canvas size (this is what Chart.js uses when responsive:false)
  canvasEl.width = Math.max(10, Math.floor(w));
  canvasEl.height = Math.max(10, Math.floor(h));
}

function fmtMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const x = Number(n);
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const x = Number(n);
  const sign = x > 0 ? "+" : "";
  return sign + x.toFixed(2) + "%";
}

function requireExchangeTicker(s) {
  return /^[A-Z]+:[A-Z0-9.\-]+$/.test((s || "").trim().toUpperCase());
}

function setError(errEl, msg) {
  if (!errEl) return;
  errEl.textContent = msg || "";
}

// -------------------- projection helpers --------------------
function addDaysISO(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// CAGR from first->last (over years)
function calcCAGR(first, last, years) {
  if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0 || years <= 0) return null;
  return Math.pow(last / first, 1 / years) - 1;
}

function projectionMultiplier(conf) {
  if (conf === "conservative") return 0.55; // dampen
  if (conf === "high") return 1.35;         // amplify
  return 1.0; // moderate
}

function buildProjection(historyWeekly, confidence) {
  // historyWeekly is last ~5y weekly points (oldest->newest)
  if (!Array.isArray(historyWeekly) || historyWeekly.length < 30) return [];

  const first = Number(historyWeekly[0].close);
  const last = Number(historyWeekly[historyWeekly.length - 1].close);
  const years = 5;

  const cagr = calcCAGR(first, last, years);
  if (cagr == null) return [];

  // confidence-adjusted annual growth
  let adj = cagr * projectionMultiplier(confidence);

  // guardrails
  adj = Math.max(-0.15, Math.min(0.35, adj));

  const weeklyGrowth = Math.pow(1 + adj, 1 / 52) - 1;

  const lastDate = historyWeekly[historyWeekly.length - 1].date;
  let price = last;

  const out = [];
  for (let i = 1; i <= 260; i++) { // 5y weekly
    price = price * (1 + weeklyGrowth);
    const date = addDaysISO(lastDate, i * 7);
    out.push({ date, close: Number(price.toFixed(4)) });
  }
  return out;
}

// -------------------- chart --------------------
function renderChart(canvasEl, historyWeekly, projectionWeekly) {
  if (!canvasEl) throw new Error("Missing canvas #stockChart");
  if (typeof Chart === "undefined") throw new Error("Chart.js not loaded (Chart is undefined).");

  const histLabels = historyWeekly.map((p) => p.date);
  const histData = historyWeekly.map((p) => Number(p.close));

  const projLabels = projectionWeekly.map((p) => p.date);
  const projData = projectionWeekly.map((p) => Number(p.close));

  let labels = histLabels.concat(projLabels);
  let data = histData.concat(projData);

  // ✅ Add one extra x-step so the last real point isn’t on the border.
  if (labels.length) {
    const last = labels[labels.length - 1];
    labels.push(addDaysISO(last, 14));
    data.push(null);
  }

  const histLen = histData.length;

  if (chartInstance) chartInstance.destroy();

  // ✅ IMPORTANT: match canvas pixels to the container
  sizeCanvasToParent(canvasEl, 360);

  chartInstance = new Chart(canvasEl, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Price (history + projection)",
          data,
          spanGaps: false,
          pointRadius: 0,
          tension: 0.25,
          borderWidth: 3,
          segment: {
            borderDash: (ctx) => (ctx.p0DataIndex >= histLen - 1 ? [8, 6] : undefined),
          },
        },
      ],
    },
    options: {
      responsive: false,
      maintainAspectRatio: true,
      layout: {
      padding: {
      right: 25
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => " " + fmtMoney(c.parsed.y),
          },
        },
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 10, color: "rgba(255,255,255,0.75)" },
          grid: { color: "rgba(255,255,255,0.10)" },
        },
        y: {
          beginAtZero: false,
          grace: "10%",
          ticks: { color: "rgba(255,255,255,0.75)" },
          grid: { color: "rgba(255,255,255,0.10)" },
        },
      },
    },
  });
}

// -------------------- network --------------------
async function fetchStock(symbol) {
  const url = `${WORKER_BASE}/api/stock?symbol=${encodeURIComponent(symbol)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });

  // Try parse JSON; if it fails, keep raw text for debugging
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // non-json response
  }

  if (!res.ok || !data || data.ok !== true) {
    const msg =
      (data && (data.message || data.error)) ||
      (text ? `Request failed (${res.status}): ${text.slice(0, 200)}` : `Request failed (${res.status})`);
    throw new Error(msg);
  }

  return data;
}

// -------------------- binding / main --------------------
function initStockViz() {
  // Find elements (must exist on the page that contains the stock component)
  const symbolEl = document.getElementById("stockSymbol");
  const confEl = document.getElementById("confidence");
  const btnEl = document.getElementById("runStock");
  const errEl = document.getElementById("stockError");
  const statsEl = document.getElementById("stockStats");

  const statLast = document.getElementById("statLast");
  const statChg = document.getElementById("statChg");
  const statPE = document.getElementById("statPE");
  const stat1Y = document.getElementById("stat1Y");
  const stat5Y = document.getElementById("stat5Y");

  const canvasEl = document.getElementById("stockChart");

  // Not on the page / component not present
  if (!btnEl || !symbolEl || !confEl || !errEl || !statsEl || !canvasEl) return;

  // Prevent double-binding (MkDocs Material SPA nav)
  if (btnEl.dataset.bound === "1") return;
  btnEl.dataset.bound = "1";

  async function run() {
    try {
      setError(errEl, "");
      statsEl.style.display = "none";

      const symbol = (symbolEl.value || "").trim().toUpperCase();
      const confidence = confEl.value;

      if (!requireExchangeTicker(symbol)) {
        setError(errEl, "Please enter symbol as EXCHANGE:TICKER (e.g. NASDAQ:AAPL, ASX:TPW).");
        return;
      }

      btnEl.disabled = true;
      btnEl.textContent = "Loading…";

      const data = await fetchStock(symbol);

      // Stats
      if (statLast) statLast.textContent = fmtMoney(data.last_price);
      if (statChg) statChg.textContent = fmtPct(data.change_percent);
      if (statPE) statPE.textContent = data.pe_ratio == null ? "—" : Number(data.pe_ratio).toFixed(2);
      if (stat1Y) stat1Y.textContent = fmtPct(data.perf_1y_percent);
      if (stat5Y) stat5Y.textContent = fmtPct(data.perf_5y_percent);

      statsEl.style.display = "grid";

      const historyWeekly = Array.isArray(data.history_weekly) ? data.history_weekly : [];
      if (historyWeekly.length < 20) throw new Error("Not enough history returned to draw chart.");

      // Store for confidence re-render
      lastHistoryWeekly = historyWeekly;

      const projectionWeekly = buildProjection(historyWeekly, confidence);
      renderChart(canvasEl, historyWeekly, projectionWeekly);
    } catch (e) {
      setError(errEl, e?.message || String(e));
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
      }
    } finally {
      btnEl.disabled = false;
      btnEl.textContent = "Run Projection";
    }
  }

  // Re-render projection when confidence changes (no refetch)
  function rerenderProjectionOnly() {
    try {
      if (!lastHistoryWeekly || lastHistoryWeekly.length < 20) return;
      const projectionWeekly = buildProjection(lastHistoryWeekly, confEl.value);
      renderChart(canvasEl, lastHistoryWeekly, projectionWeekly);
    } catch (e) {
      setError(errEl, e?.message || String(e));
    }
  }

  btnEl.addEventListener("click", run);
  symbolEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") run();
  });
  confEl.addEventListener("change", rerenderProjectionOnly);

  // Optional: tiny sanity log (remove later)
  // console.log("StockViz bound");
}

if (window.document$ && typeof window.document$.subscribe === "function") {
  window.document$.subscribe(initStockViz);
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initStockViz, { once: true });
} else {
  initStockViz();
}
window.addEventListener("app-shell:navigate", initStockViz);
