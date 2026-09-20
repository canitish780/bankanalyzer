/* Ledgerline — charts.js */

const Charts = (() => {
  const instances = new Map();

  function themeColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
      accent: styles.getPropertyValue("--accent").trim() || "#1f6f54",
      flag: styles.getPropertyValue("--flag").trim() || "#a8431e",
      ink: styles.getPropertyValue("--ink").trim() || "#16222c",
      muted: styles.getPropertyValue("--muted").trim() || "#64707a",
      line: styles.getPropertyValue("--line").trim() || "#dcd6c7",
    };
  }

  function destroy(id) {
    if (instances.has(id)) { instances.get(id).destroy(); instances.delete(id); }
  }

  function balanceTrend(canvas, dailySeries) {
    destroy(canvas.id);
    const c = themeColors();
    const chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: dailySeries.map(d => Utils.fmtDate(d.date)),
        datasets: [{
          data: dailySeries.map(d => d.balance),
          borderColor: c.accent,
          backgroundColor: c.accent + "22",
          fill: true,
          tension: 0.15,
          pointRadius: 0,
          borderWidth: 1.6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => Utils.fmtCurrency(ctx.parsed.y) } } },
        scales: {
          x: { ticks: { maxTicksLimit: 7, color: c.muted, font: { size: 10.5 } }, grid: { display: false } },
          y: { ticks: { color: c.muted, font: { size: 10.5 }, callback: (v) => Utils.fmtCurrency(v, { symbol: false }) }, grid: { color: c.line } }
        }
      }
    });
    instances.set(canvas.id, chart);
  }

  function monthlyCreditDebit(canvas, months) {
    destroy(canvas.id);
    const c = themeColors();
    const chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: months.map(m => m.label),
        datasets: [
          { label: "Credits", data: months.map(m => m.totalCredit), backgroundColor: c.accent, borderRadius: 2, maxBarThickness: 26 },
          { label: "Debits", data: months.map(m => m.totalDebit), backgroundColor: c.flag, borderRadius: 2, maxBarThickness: 26 },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", align: "end", labels: { boxWidth: 10, color: c.ink, font: { size: 11.5 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${Utils.fmtCurrency(ctx.parsed.y)}` } }
        },
        scales: {
          x: { ticks: { color: c.muted, font: { size: 10.5 } }, grid: { display: false } },
          y: { ticks: { color: c.muted, font: { size: 10.5 }, callback: (v) => Utils.fmtCurrency(v, { symbol: false }) }, grid: { color: c.line } }
        }
      }
    });
    instances.set(canvas.id, chart);
  }

  return { balanceTrend, monthlyCreditDebit, destroy };
})();
