(function () {
  // ---- Helpers ----
  const $ = (id) => document.getElementById(id);

  function money(x) {
    return x.toLocaleString(undefined, { style: "currency", currency: "AUD" });
  }

  function fmtDate(d) {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  // Avoid float issues: use cents internally
  const toCents = (x) => Math.round(Number(x) * 100);
  const fromCents = (c) => c / 100;

  // Add months / weeks based on frequency
  function nextDate(date, paymentsPerYear) {
    const d = new Date(date);
    if (paymentsPerYear === 12) {
      d.setMonth(d.getMonth() + 1);
    } else if (paymentsPerYear === 26) {
      d.setDate(d.getDate() + 14);
    } else if (paymentsPerYear === 52) {
      d.setDate(d.getDate() + 7);
    } else {
      // fallback
      d.setDate(d.getDate() + Math.round(365 / paymentsPerYear));
    }
    return d;
  }

  // ---- Core schedule ----
  function buildSchedule({ principalCents, annualRate, years, paymentsPerYear, extraCents, startDate }) {
    const r = (annualRate / 100) / paymentsPerYear;
    const n = years * paymentsPerYear;

    // payment formula (in cents)
    const P = fromCents(principalCents);
    const payment = r === 0
      ? (P / n)
      : (P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));

    const paymentCents = toCents(payment);

    let balanceCents = principalCents;
    let date = new Date(startDate);

    let totalInterestCents = 0;
    let totalPaidCents = 0;

    const rows = [];
    for (let i = 1; i <= n && balanceCents > 0; i++) {
      const bal = fromCents(balanceCents);
      const interest = bal * r;
      const interestCents = toCents(interest);

      let principalPayCents = (paymentCents - interestCents) + extraCents;
      if (principalPayCents < 0) principalPayCents = 0;

      // Don’t overpay final row
      if (principalPayCents > balanceCents) principalPayCents = balanceCents;

      const actualPaymentCents = interestCents + principalPayCents;

      balanceCents -= principalPayCents;

      totalInterestCents += interestCents;
      totalPaidCents += actualPaymentCents;

      rows.push({
        period: i,
        date: new Date(date),
        paymentCents: actualPaymentCents,
        interestCents,
        principalCents: principalPayCents,
        balanceCents
      });

      date = nextDate(date, paymentsPerYear);
    }

    return {
      rows,
      paymentCents,
      totalInterestCents,
      totalPaidCents,
      payoffDate: rows.length ? rows[rows.length - 1].date : new Date(startDate)
    };
  }

  // ---- Render table ----
  function render(rows) {
    const body = $("amort-body");
    body.innerHTML = "";

    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.period}</td>
        <td>${fmtDate(r.date)}</td>
        <td>${money(fromCents(r.paymentCents))}</td>
        <td>${money(fromCents(r.interestCents))}</td>
        <td>${money(fromCents(r.principalCents))}</td>
        <td>${money(fromCents(r.balanceCents))}</td>
      `;
      frag.appendChild(tr);
    }
    body.appendChild(frag);
  }

  // ---- PDF export (simple + reliable) ----
  async function exportPDF(summary, rows) {
    // Lazy-load jsPDF from CDN (no build step)
    if (!window.jspdf) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    let y = 48;
    doc.setFontSize(14);
    doc.text("Loan Amortisation Schedule", 40, y);
    y += 18;

    doc.setFontSize(10);
    doc.text(summary, 40, y);
    y += 18;

    // table header
    const headers = ["#", "Date", "Payment", "Interest", "Principal", "Balance"];
    doc.setFontSize(9);
    doc.text(headers.join("   "), 40, y);
    y += 12;

    for (const r of rows) {
      const line = [
        String(r.period),
        fmtDate(r.date),
        money(fromCents(r.paymentCents)),
        money(fromCents(r.interestCents)),
        money(fromCents(r.principalCents)),
        money(fromCents(r.balanceCents))
      ].join("   ");

      doc.text(line, 40, y);
      y += 11;

      if (y > 780) {
        doc.addPage();
        y = 48;
      }
    }

    doc.save("amortisation_schedule.pdf");
  }

  // ---- Hook up UI ----
  function boot() {
    // only run if the calculator exists on this page
    if (!$("amort-generate")) return;

    // default start date = today
    const today = new Date();
    $("amort-start").value = today.toISOString().slice(0, 10);
    // ✅ ADD THIS BLOCK (toggle fortnightly mode visibility)
    function updateFnVisibility() {
    const freq = Number($("amort-freq").value); // 12, 26, 52
    const wrapper = $("amort-fn-wrapper");
    if (!wrapper) return;

    wrapper.style.display = (freq === 26) ? "block" : "none";
    }

  updateFnVisibility();
  $("amort-freq").addEventListener("change", updateFnVisibility);
    let lastResult = null;

    $("amort-generate").addEventListener("click", () => {
      const principalCents = toCents($("amort-principal").value);
      const annualRate = Number($("amort-rate").value);
      const years = Number($("amort-years").value);
      const paymentsPerYear = Number($("amort-freq").value);
      const extraCents = toCents($("amort-extra").value || 0);
      const startDate = $("amort-start").value;

      const result = buildSchedule({ principalCents, annualRate, years, paymentsPerYear, extraCents, startDate });
      lastResult = result;

      render(result.rows);

      const summaryText =
        `Payment (base): ${money(fromCents(result.paymentCents))} | ` +
        `Total interest paid: ${money(fromCents(result.totalInterestCents))} | ` +
        `Payoff date: ${fmtDate(result.payoffDate)}`;

      $("amort-summary").textContent = summaryText;
      $("amort-export").disabled = result.rows.length === 0;
    });

    $("amort-export").addEventListener("click", async () => {
      if (!lastResult) return;

      const summaryText = $("amort-summary").textContent || "";
      await exportPDF(summaryText, lastResult.rows);
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();