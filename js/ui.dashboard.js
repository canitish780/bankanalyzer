/* Ledgerline — ui.dashboard.js */

const UiDashboard = (() => {

  function statCard(label, value, sub, flagClass) {
    return `<div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value${flagClass ? " " + flagClass : ""}">${value}</div>
      ${sub ? `<div class="stat-sub">${sub}</div>` : ""}
    </div>`;
  }

  function flagRow(t, tagClass, tagLabel) {
    return `<div class="flag-row">
      <div class="flag-date">${Utils.fmtDate(t.date)}</div>
      <div class="flag-desc" title="${Utils.escapeHtml(t.narration)}"><span class="flag-tag ${tagClass}">${tagLabel}</span>${Utils.escapeHtml(t.narration)}</div>
      <div class="flag-amt">${Utils.fmtCurrency(t.debit || t.credit)}</div>
    </div>`;
  }

  function monthTableRows(months) {
    return months.map(m => `<tr>
      <td>${m.label}</td>
      <td>${Utils.fmtCurrency(m.totalCredit)}</td>
      <td>${Utils.fmtCurrency(m.totalDebit)}</td>
      <td>${Utils.fmtCurrency(m.turnover)}</td>
      <td>${m.txnCount}</td>
      <td>${Utils.fmtCurrency(m.avgBalance)}</td>
      <td>${Utils.fmtCurrency(m.closingBalance)}</td>
    </tr>`).join("");
  }

  function render(host, accountLabel, bankName, analysis, statementsForAccount) {
    if (!analysis) {
      host.innerHTML = `<div class="empty-note">No validated transactions yet for this account. Add and map a statement first.</div>`;
      return;
    }
    const a = analysis;

    host.innerHTML = `
      <div class="stat-grid">
        ${statCard("Total credits", Utils.fmtCurrency(a.totalCredits), `${a.txnCount} txns · ${Utils.fmtDate(a.period.from)} – ${Utils.fmtDate(a.period.to)}`)}
        ${statCard("Total debits", Utils.fmtCurrency(a.totalDebits))}
        ${statCard("Net cash flow", Utils.fmtCurrency(a.netFlow), null, a.netFlow < 0 ? "flag" : "")}
        ${statCard("Average balance", Utils.fmtCurrency(a.averageBalance), `Min ${Utils.fmtCurrency(a.minBalance)} · Max ${Utils.fmtCurrency(a.maxBalance)}`)}
        ${statCard("Avg monthly turnover", Utils.fmtCurrency(a.avgMonthlyTurnover), `Credit ${Utils.fmtCurrency(a.avgMonthlyCredit)} / Debit ${Utils.fmtCurrency(a.avgMonthlyDebit)}`)}
        ${statCard("Cheque / EMI bounces", Utils.fmtInt(a.bounces.length), null, a.bounces.length ? "flag" : "")}
        ${statCard("EMI / loan debits", Utils.fmtCurrency(a.emiMonthlyTotal) + "/mo", `${a.emiPayments.length} debits identified`)}
        ${statCard("Large transactions", Utils.fmtInt(a.largeTransactions.length), `≥ ${Utils.fmtCurrency(a.largeThreshold)}`)}
      </div>

      <div class="two-col">
        <div class="card chart-card">
          <div class="card-title">Balance over statement period</div>
          <div class="card-sub">Daily closing balance, carried forward between transactions</div>
          <canvas id="chartBalance"></canvas>
        </div>
        <div class="card chart-card">
          <div class="card-title">Monthly credits vs. debits</div>
          <div class="card-sub">${a.months.length} month${a.months.length===1?"":"s"} covered</div>
          <canvas id="chartMonthly"></canvas>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Monthly turnover &amp; balance</div>
        <div class="card-sub">Average balance uses daily closing balances, not just transaction-day snapshots</div>
        <div class="txn-table-wrap" style="max-height:280px;">
          <table class="month-table">
            <thead><tr><th>Month</th><th>Credits</th><th>Debits</th><th>Turnover</th><th>Txns</th><th>Avg balance</th><th>Closing balance</th></tr></thead>
            <tbody>${monthTableRows(a.months)}</tbody>
          </table>
        </div>
      </div>

      <div class="two-col">
        <div class="card">
          <div class="card-title">Cheque / ECS / EMI bounces (${a.bounces.length})</div>
          <div class="card-sub">Flagged from return/insufficient-funds narration</div>
          <div class="flag-list">${a.bounces.length ? a.bounces.map(t => flagRow(t, "tag-bounce", "bounce")).join("") : `<p class="stat-sub">None detected.</p>`}</div>
        </div>
        <div class="card">
          <div class="card-title">Large transactions (${a.largeTransactions.length})</div>
          <div class="card-sub">Threshold
            <input type="number" id="largeThresholdInput" value="${a.largeThreshold}" step="1000" class="text-input" style="width:110px;margin-left:6px;padding:4px 8px;font-size:12px;" />
          </div>
          <div class="flag-list">${a.largeTransactions.length ? a.largeTransactions.slice(0, 30).map(t => flagRow(t, "tag-large", t.debit ? "debit" : "credit")).join("") : `<p class="stat-sub">None above threshold.</p>`}</div>
        </div>
      </div>

      <div class="two-col">
        <div class="card">
          <div class="card-title">Loan / EMI debits (${a.emiPayments.length})</div>
          <div class="card-sub">Est. ${Utils.fmtCurrency(a.emiMonthlyTotal)} per month — keyword + recurrence based, verify before underwriting</div>
          <div class="flag-list">${a.emiPayments.length ? a.emiPayments.slice(0, 30).map(t => flagRow(t, "tag-emi", "EMI")).join("") : `<p class="stat-sub">None detected.</p>`}</div>
        </div>
        <div class="card">
          <div class="card-title">Cash activity</div>
          <div class="card-sub">Cash deposits and withdrawals identified by narration</div>
          <div class="flag-list">
            ${a.cashDeposits.slice(0, 15).map(t => flagRow(t, "tag-cash", "cash in")).join("")}
            ${a.cashWithdrawals.slice(0, 15).map(t => flagRow(t, "tag-cash", "cash out")).join("")}
            ${(a.cashDeposits.length + a.cashWithdrawals.length) === 0 ? `<p class="stat-sub">None detected.</p>` : ""}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Statements included</div>
        <div class="card-sub">${statementsForAccount.length} statement${statementsForAccount.length===1?"":"s"} combined for this account</div>
        <div class="flag-list">
          ${statementsForAccount.map(s => `<div class="flag-row"><div class="flag-date">${Utils.escapeHtml(s.name)}</div><div class="flag-desc">${s.transactions ? s.transactions.length : 0} validated transactions</div><div class="flag-amt">${s.validation ? Math.round(s.validation.matchRate*100)+"% verified" : ""}</div></div>`).join("")}
        </div>
      </div>
    `;

    Charts.balanceTrend(document.getElementById("chartBalance"), a.dailySeries);
    Charts.monthlyCreditDebit(document.getElementById("chartMonthly"), a.months);

    document.getElementById("largeThresholdInput").addEventListener("change", (e) => {
      const v = parseFloat(e.target.value);
      if (!Number.isNaN(v) && v > 0) App.setLargeThresholdAndRerender(v);
    });
  }

  return { render };
})();
