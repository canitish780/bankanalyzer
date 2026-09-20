/* Ledgerline — analyzer.js
 * All figures here are derived only from validated transactions (see
 * parser.js). Detection of cash / bounce / EMI activity is keyword and
 * pattern based and should be read as flags for a reviewer, not as a
 * final classification.
 */

const Analyzer = (() => {

  const CASH_RE = /\bcash\b|\bcsh\b|\bcdm\b/i;
  const BOUNCE_RE = /\b(return|returned|bounce|bounced|insufficient\s*fund|insufficient\s*balance|chq\s*rtn|cheque\s*return|ecs\s*rej|ach\s*rejec|rtn\s*chrg|return\s*charges|represent(ed|ation)?)\b/i;
  const EMI_RE = /\bemi\b|loan\s*(repay|installment|inst\.?|emi)|installment|\bnach\b.*loan|\bach\b.*loan|loan\s*a\/?c/i;
  const INTEREST_RE = /\binterest\b|\bint\.?\s*credit\b|\bint\s*paid\b/i;
  const CHARGE_RE = /\b(charges?|fee|penalty|gst on|sms alert|amb charge|min bal)\b/i;

  function round2(n) { return Math.round(n * 100) / 100; }
  function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

  function percentile(sortedArr, p) {
    if (!sortedArr.length) return 0;
    const idx = Math.min(sortedArr.length - 1, Math.floor(p * sortedArr.length));
    return sortedArr[idx];
  }

  function buildDailyBalances(txChron) {
    if (!txChron.length) return [];
    const dayMap = new Map();
    txChron.forEach(t => { dayMap.set(dateKey(t.date), t.balance); });
    const opening = round2(txChron[0].balance - txChron[0].credit + txChron[0].debit);
    const start = new Date(txChron[0].date.getFullYear(), txChron[0].date.getMonth(), txChron[0].date.getDate());
    const end = new Date(txChron[txChron.length - 1].date.getFullYear(), txChron[txChron.length - 1].date.getMonth(), txChron[txChron.length - 1].date.getDate());
    const series = [];
    let current = opening;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = dateKey(d);
      if (dayMap.has(key)) current = dayMap.get(key);
      series.push({ date: new Date(d), balance: current });
    }
    return { series, openingBalance: opening };
  }

  function monthLabel(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }

  function detectRecurringDebits(txChron) {
    const groups = new Map();
    txChron.filter(t => t.debit > 0).forEach(t => {
      const key = Math.round(t.debit);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    });
    const recurring = new Set();
    for (const [, list] of groups) {
      if (list.length < 3) continue;
      const sorted = [...list].sort((a, b) => a.date - b.date);
      let monthlyGaps = 0;
      for (let i = 1; i < sorted.length; i++) {
        const days = (sorted[i].date - sorted[i - 1].date) / 86400000;
        if (days >= 24 && days <= 37) monthlyGaps++;
      }
      if (monthlyGaps >= list.length - 2 && monthlyGaps >= 2) {
        sorted.forEach(t => recurring.add(t.rowIndex));
      }
    }
    return recurring;
  }

  /**
   * transactions: chronologically ascending, validated transactions (from Parser).
   * options: { largeThreshold?: number }
   */
  function analyze(transactions, options = {}) {
    if (!transactions.length) return null;

    const totalCredits = round2(transactions.reduce((s, t) => s + t.credit, 0));
    const totalDebits = round2(transactions.reduce((s, t) => s + t.debit, 0));
    const netFlow = round2(totalCredits - totalDebits);

    const { series: dailySeries, openingBalance } = buildDailyBalances(transactions);
    const closingBalance = transactions[transactions.length - 1].balance;
    const averageBalance = dailySeries.length ? round2(dailySeries.reduce((s, d) => s + d.balance, 0) / dailySeries.length) : null;
    const minBalance = dailySeries.length ? round2(Math.min(...dailySeries.map(d => d.balance))) : null;
    const maxBalance = dailySeries.length ? round2(Math.max(...dailySeries.map(d => d.balance))) : null;

    // ---- monthly summary ----
    const monthMap = new Map();
    transactions.forEach(t => {
      const key = monthLabel(t.date);
      if (!monthMap.has(key)) monthMap.set(key, { key, date: new Date(t.date.getFullYear(), t.date.getMonth(), 1), credit: 0, debit: 0, count: 0, balances: [] });
      const m = monthMap.get(key);
      m.credit += t.credit; m.debit += t.debit; m.count++;
      m.balances.push(t.balance);
    });
    dailySeries.forEach(d => {
      const key = monthLabel(d.date);
      const m = monthMap.get(key);
      if (m) { if (!m.dailyBalances) m.dailyBalances = []; m.dailyBalances.push(d.balance); }
    });
    const months = [...monthMap.values()].sort((a, b) => a.date - b.date).map(m => ({
      key: m.key,
      label: Utils.fmtMonth(m.date),
      totalCredit: round2(m.credit),
      totalDebit: round2(m.debit),
      turnover: round2(m.credit + m.debit),
      txnCount: m.count,
      avgBalance: m.dailyBalances && m.dailyBalances.length ? round2(m.dailyBalances.reduce((s, b) => s + b, 0) / m.dailyBalances.length) : round2(m.balances.reduce((s,b)=>s+b,0)/m.balances.length),
      closingBalance: round2(m.balances[m.balances.length - 1]),
    }));

    const avgMonthlyTurnover = months.length ? round2(months.reduce((s, m) => s + m.turnover, 0) / months.length) : 0;
    const avgMonthlyCredit = months.length ? round2(months.reduce((s, m) => s + m.totalCredit, 0) / months.length) : 0;
    const avgMonthlyDebit = months.length ? round2(months.reduce((s, m) => s + m.totalDebit, 0) / months.length) : 0;

    // ---- flags ----
    const cashDeposits = transactions.filter(t => t.credit > 0 && CASH_RE.test(t.narration));
    const cashWithdrawals = transactions.filter(t => t.debit > 0 && CASH_RE.test(t.narration));
    const bounces = transactions.filter(t => BOUNCE_RE.test(t.narration));
    const recurringDebitIdx = detectRecurringDebits(transactions);
    const emiPayments = transactions.filter(t => t.debit > 0 && (EMI_RE.test(t.narration) || recurringDebitIdx.has(t.rowIndex)));
    const interestCredits = transactions.filter(t => t.credit > 0 && INTEREST_RE.test(t.narration));
    const bankCharges = transactions.filter(t => t.debit > 0 && CHARGE_RE.test(t.narration) && !EMI_RE.test(t.narration));

    const amounts = transactions.map(t => Math.max(t.debit, t.credit)).filter(a => a > 0).sort((a, b) => a - b);
    const suggestedThreshold = amounts.length ? Math.max(25000, Math.round(percentile(amounts, 0.95) / 1000) * 1000) : 25000;
    const largeThreshold = options.largeThreshold || suggestedThreshold;
    const largeTransactions = transactions.filter(t => Math.max(t.debit, t.credit) >= largeThreshold);

    const emiMonthlyTotal = emiPayments.length ? round2(emiPayments.reduce((s, t) => s + t.debit, 0) / Math.max(1, months.length)) : 0;

    return {
      period: { from: transactions[0].date, to: transactions[transactions.length - 1].date },
      openingBalance, closingBalance, averageBalance, minBalance, maxBalance,
      totalCredits, totalDebits, netFlow,
      txnCount: transactions.length,
      months,
      avgMonthlyTurnover, avgMonthlyCredit, avgMonthlyDebit,
      cashDeposits, cashWithdrawals,
      bounces,
      emiPayments, emiMonthlyTotal,
      interestCredits, bankCharges,
      largeThreshold, suggestedThreshold, largeTransactions,
      dailySeries,
    };
  }

  return { analyze, buildDailyBalances };
})();
