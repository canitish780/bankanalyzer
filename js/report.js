/* Ledgerline — report.js
 * Produces a self-contained, offline-readable HTML report (the user can
 * print it to PDF from their browser) and a CSV of the underlying
 * transactions. No network calls, no external assets.
 */

const Report = (() => {

  function triggerDownload(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function flagRowsHtml(list, tagClass, tagLabel) {
    if (!list.length) return `<p class="r-empty">None detected.</p>`;
    return `<table class="r-table"><thead><tr><th>Date</th><th>Narration</th><th class="r-num">Amount</th></tr></thead><tbody>` +
      list.slice(0, 60).map(t => `<tr><td>${Utils.fmtDate(t.date)}</td><td>${Utils.escapeHtml(t.narration)} <span class="r-tag ${tagClass}">${tagLabel}</span></td><td class="r-num">${Utils.fmtCurrency(t.debit || t.credit)}</td></tr>`).join("") +
      `</tbody></table>` + (list.length > 60 ? `<p class="r-more">+ ${list.length - 60} more not shown</p>` : "");
  }

  function buildHtml(accountLabel, bankName, analysis, meta = {}) {
    const a = analysis;
    const monthsRows = a.months.map(m => `
      <tr>
        <td>${m.label}</td>
        <td class="r-num">${Utils.fmtCurrency(m.totalCredit)}</td>
        <td class="r-num">${Utils.fmtCurrency(m.totalDebit)}</td>
        <td class="r-num">${Utils.fmtCurrency(m.turnover)}</td>
        <td class="r-num">${m.txnCount}</td>
        <td class="r-num">${Utils.fmtCurrency(m.avgBalance)}</td>
        <td class="r-num">${Utils.fmtCurrency(m.closingBalance)}</td>
      </tr>`).join("");

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${Utils.escapeHtml(accountLabel)} — Bank Statement Analysis</title>
<style>
  :root{--ink:#16222c;--muted:#64707a;--line:#dcd6c7;--accent:#1f6f54;--flag:#a8431e;--amber:#92650f;}
  *{box-sizing:border-box;} body{font-family:Georgia,'Times New Roman',serif;color:var(--ink);max-width:900px;margin:40px auto;padding:0 24px;line-height:1.5;}
  h1{font-size:23px;margin:0 0 2px;} h2{font-size:16px;margin:34px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px;}
  .r-meta{color:var(--muted);font-size:12.5px;font-family:Arial,sans-serif;margin-bottom:22px;}
  .r-print{position:fixed;top:16px;right:16px;font-family:Arial,sans-serif;font-size:12px;padding:8px 14px;background:var(--accent);color:#fff;border:none;border-radius:4px;cursor:pointer;}
  .r-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:8px;}
  .r-stat{border:1px solid var(--line);border-radius:5px;padding:12px;font-family:Arial,sans-serif;}
  .r-stat-label{font-size:10.5px;color:var(--muted);margin-bottom:5px;}
  .r-stat-value{font-family:Georgia,serif;font-size:18px;font-weight:600;}
  table.r-table, table.r-month{width:100%;border-collapse:collapse;font-size:12.5px;font-family:Arial,sans-serif;}
  .r-table th,.r-table td,.r-month th,.r-month td{padding:6px 10px;border-bottom:1px solid var(--line);text-align:left;}
  .r-num{text-align:right !important; font-variant-numeric:tabular-nums;}
  .r-table thead th, .r-month thead th{background:#f3f1ea;font-weight:600;}
  .r-tag{font-size:9.5px;padding:1px 6px;border-radius:8px;margin-left:6px;}
  .r-empty{color:var(--muted);font-size:12.5px;font-family:Arial,sans-serif;}
  .r-more{color:var(--muted);font-size:11.5px;font-family:Arial,sans-serif;}
  .r-note{font-size:11px;color:var(--muted);font-family:Arial,sans-serif;margin-top:6px;}
  .r-foot{margin-top:40px;font-size:10.5px;color:var(--muted);font-family:Arial,sans-serif;border-top:1px solid var(--line);padding-top:10px;}
  @media print{.r-print{display:none;}}
</style></head>
<body>
<button class="r-print" onclick="window.print()">Print / Save as PDF</button>
<h1>${Utils.escapeHtml(accountLabel)}</h1>
<div class="r-meta">${bankName ? Utils.escapeHtml(bankName) + " · " : ""}Statement period ${Utils.fmtDate(a.period.from)} – ${Utils.fmtDate(a.period.to)} · Generated ${new Date().toLocaleString("en-IN")} · Ledgerline (processed locally, no data uploaded)</div>

<h2>Summary</h2>
<div class="r-stats">
  <div class="r-stat"><div class="r-stat-label">Total credits</div><div class="r-stat-value">${Utils.fmtCurrency(a.totalCredits)}</div></div>
  <div class="r-stat"><div class="r-stat-label">Total debits</div><div class="r-stat-value">${Utils.fmtCurrency(a.totalDebits)}</div></div>
  <div class="r-stat"><div class="r-stat-label">Net cash flow</div><div class="r-stat-value">${Utils.fmtCurrency(a.netFlow)}</div></div>
  <div class="r-stat"><div class="r-stat-label">Average balance</div><div class="r-stat-value">${Utils.fmtCurrency(a.averageBalance)}</div></div>
  <div class="r-stat"><div class="r-stat-label">Opening balance</div><div class="r-stat-value">${Utils.fmtCurrency(a.openingBalance)}</div></div>
  <div class="r-stat"><div class="r-stat-label">Closing balance</div><div class="r-stat-value">${Utils.fmtCurrency(a.closingBalance)}</div></div>
  <div class="r-stat"><div class="r-stat-label">Avg monthly turnover</div><div class="r-stat-value">${Utils.fmtCurrency(a.avgMonthlyTurnover)}</div></div>
  <div class="r-stat"><div class="r-stat-label">Transactions analysed</div><div class="r-stat-value">${Utils.fmtInt(a.txnCount)}</div></div>
</div>

<h2>Monthly turnover &amp; balance</h2>
<table class="r-month"><thead><tr><th>Month</th><th class="r-num">Credits</th><th class="r-num">Debits</th><th class="r-num">Turnover</th><th class="r-num">Txns</th><th class="r-num">Avg balance</th><th class="r-num">Closing balance</th></tr></thead>
<tbody>${monthsRows}</tbody></table>

<h2>Cheque / ECS / EMI bounces (${a.bounces.length})</h2>
${flagRowsHtml(a.bounces, "", "bounce")}

<h2>Loan / EMI debits (${a.emiPayments.length}) — est. ${Utils.fmtCurrency(a.emiMonthlyTotal)}/month</h2>
${flagRowsHtml(a.emiPayments, "", "emi")}
<p class="r-note">Identified by narration keywords and by recurring same-amount monthly debits. Verify against loan schedule before relying on this for underwriting.</p>

<h2>Cash transactions</h2>
<p class="r-note">Cash deposits: ${a.cashDeposits.length} totalling ${Utils.fmtCurrency(a.cashDeposits.reduce((s,t)=>s+t.credit,0))}. Cash withdrawals: ${a.cashWithdrawals.length} totalling ${Utils.fmtCurrency(a.cashWithdrawals.reduce((s,t)=>s+t.debit,0))}.</p>

<h2>Large transactions (≥ ${Utils.fmtCurrency(a.largeThreshold)}) — ${a.largeTransactions.length}</h2>
${flagRowsHtml(a.largeTransactions, "", "large")}

<div class="r-foot">This report was generated automatically from the bank statement's own printed figures. Every figure traces to a validated running-balance check; rows that failed validation were excluded — see the Analysis screen for the validation summary before relying on this for a credit or audit decision.</div>
</body></html>`;
  }

  function csvOf(transactions) {
    const header = ["Date", "Narration", "Debit", "Credit", "Balance"];
    const lines = [header.join(",")];
    transactions.forEach(t => {
      const row = [
        Utils.fmtDate(t.date),
        `"${(t.narration || "").replace(/"/g, '""')}"`,
        t.debit ? t.debit.toFixed(2) : "",
        t.credit ? t.credit.toFixed(2) : "",
        t.balance.toFixed(2)
      ];
      lines.push(row.join(","));
    });
    return lines.join("\n");
  }

  function downloadReport(accountLabel, bankName, analysis) {
    const html = buildHtml(accountLabel, bankName, analysis);
    triggerDownload(`${accountLabel.replace(/[^\w\-]+/g, "_")}_analysis_report.html`, html, "text/html");
  }

  function downloadCsv(accountLabel, transactions) {
    triggerDownload(`${accountLabel.replace(/[^\w\-]+/g, "_")}_transactions.csv`, csvOf(transactions), "text/csv");
  }

  return { downloadReport, downloadCsv };
})();
