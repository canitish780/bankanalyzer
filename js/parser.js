/* Ledgerline — parser.js
 * Turns (raw table + confirmed mapping) into clean transaction objects, and
 * validates them against the statement's own running balance so silent
 * misreads don't reach the analysis stage.
 */

const Parser = (() => {

  /**
   * mapping: { date, narration, balance, debit, credit, type }
   * - date, narration, balance: required column indices
   * - debit, credit: column indices; may be the SAME index if the statement
   *   uses one "Amount" column, in which case `type` (Dr/Cr indicator column)
   *   determines the sign.
   */
  function applyMapping(table, mapping) {
    const { rows } = table;
    const combinedAmount = mapping.debit !== null && mapping.debit === mapping.credit;

    const transactions = [];
    let skipped = 0;

    rows.forEach((row, rowIndex) => {
      const dateRaw = mapping.date != null ? row[mapping.date] : "";
      const narrationRaw = mapping.narration != null ? row[mapping.narration] : "";
      const balanceRaw = mapping.balance != null ? row[mapping.balance] : "";

      const date = Utils.parseDate(dateRaw);
      const balance = Utils.parseAmount(balanceRaw);

      let debit = null, credit = null;
      if (combinedAmount) {
        const amt = Utils.parseAmount(row[mapping.debit]);
        const typeRaw = mapping.type != null ? (row[mapping.type] || "") : "";
        if (amt !== null) {
          const isDebit = /\bdr\b/i.test(typeRaw) || amt < 0;
          const isCredit = /\bcr\b/i.test(typeRaw);
          if (isDebit && !isCredit) debit = Math.abs(amt);
          else if (isCredit) credit = Math.abs(amt);
          else if (amt < 0) debit = Math.abs(amt);
          else credit = amt; // ambiguous sign, default to credit; validation will flag if wrong
        }
      } else {
        debit = mapping.debit != null ? Utils.parseAmount(row[mapping.debit]) : null;
        credit = mapping.credit != null ? Utils.parseAmount(row[mapping.credit]) : null;
      }

      const hasAnyAmount = (debit !== null && debit !== 0) || (credit !== null && credit !== 0);

      if (!date || balance === null || !hasAnyAmount) {
        skipped++;
        return;
      }

      transactions.push({
        rowIndex,
        date,
        narration: (narrationRaw || "").trim() || "(no narration captured)",
        debit: debit || 0,
        credit: credit || 0,
        balance,
        raw: row
      });
    });

    return { transactions, skipped, totalRows: rows.length };
  }

  /** Try both statement orders (oldest-first / newest-first) and keep whichever the running
   *  balance actually confirms. Returns validation stats + per-row match flags. */
  function validateRunningBalance(transactions, tolerance = 0.02) {
    if (transactions.length < 2) {
      return { order: "unknown", matchRate: transactions.length ? 1 : 0, mismatches: [], checked: 0 };
    }

    function scoreForward(list) {
      let matches = 0, checked = 0;
      const mismatches = [];
      for (let i = 1; i < list.length; i++) {
        const expected = round2(list[i - 1].balance + list[i].credit - list[i].debit);
        const actual = round2(list[i].balance);
        checked++;
        if (Math.abs(expected - actual) <= tolerance) matches++;
        else mismatches.push({ index: i, expected, actual, date: list[i].date, narration: list[i].narration });
      }
      return { matches, checked, mismatches };
    }

    const asIs = scoreForward(transactions);
    const reversed = scoreForward([...transactions].slice().reverse());

    const asIsRate = asIs.checked ? asIs.matches / asIs.checked : 0;
    const revRate = reversed.checked ? reversed.matches / reversed.checked : 0;

    if (revRate > asIsRate) {
      return { order: "newest-first", matchRate: revRate, mismatches: reversed.mismatches, checked: reversed.checked };
    }
    return { order: "oldest-first", matchRate: asIsRate, mismatches: asIs.mismatches, checked: asIs.checked };
  }

  /** Return transactions sorted chronologically ascending, using the detected order. */
  function chronological(transactions, order) {
    const list = order === "newest-first" ? [...transactions].reverse() : [...transactions];
    return list;
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  return { applyMapping, validateRunningBalance, chronological };
})();
