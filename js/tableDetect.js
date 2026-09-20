/* Ledgerline — tableDetect.js
 * Turns positioned PDF text items into rows of aligned cells, purely from
 * geometry (x/y positions) — no knowledge of any specific bank's layout.
 * This is the "do not guess" boundary: it proposes a grid, the human
 * confirms what each column means in the mapping step.
 */

const TableDetect = (() => {

  const HEADER_PATTERNS = [
    { field: "date", re: /\b(txn|transaction|value|posting|entry)?\s*date\b/i },
    { field: "narration", re: /\b(narration|particulars|description|transaction\s*details|remarks|details|transaction\s*remarks)\b/i },
    { field: "debit", re: /\b(debit|withdrawal|withdrawals?( amt)?|dr\.?)\b/i },
    { field: "credit", re: /\b(credit|deposit|deposits?( amt)?|cr\.?)\b/i },
    { field: "balance", re: /\b(balance|closing\s*bal|running\s*bal|available\s*bal)\b/i },
    { field: "refno", re: /\b(chq\.?\s*\/?\s*ref\.?\s*no\.?|cheque\s*no\.?|ref(erence)?\.?\s*no\.?|instrument\s*no\.?)\b/i },
    { field: "amount", re: /^\s*amount\s*$/i },
    { field: "type", re: /\b(dr\s*\/\s*cr|cr\s*\/\s*dr|type)\b/i },
  ];

  function keywordScore(text) {
    const hits = new Set();
    for (const p of HEADER_PATTERNS) if (p.re.test(text)) hits.add(p.field);
    return hits;
  }

  /** Group text items into rows by y-proximity. */
  function groupRows(items, yTolerance = 3) {
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    const rows = [];
    for (const it of sorted) {
      let row = rows.find(r => Math.abs(r.y - it.y) <= yTolerance);
      if (!row) { row = { y: it.y, tokens: [] }; rows.push(row); }
      row.tokens.push(it);
      row.y = (row.y * (row.tokens.length - 1) + it.y) / row.tokens.length;
    }
    rows.forEach(r => r.tokens.sort((a, b) => a.x - b.x));
    rows.sort((a, b) => a.y - b.y);
    return rows;
  }

  /** Merge adjacent tokens on a row into "words" when the gap between them is small (same word split by kerning). */
  function mergeClose(tokens, gapPx = 2.5) {
    const out = [];
    for (const t of tokens) {
      const prev = out[out.length - 1];
      if (prev && (t.x - (prev.x + prev.w)) < gapPx) {
        prev.str += t.str;
        prev.w = (t.x + t.w) - prev.x;
      } else {
        out.push({ ...t });
      }
    }
    return out;
  }

  function rowText(row) {
    return mergeClose(row.tokens).map(t => t.str).join(" ").replace(/\s+/g, " ").trim();
  }

  /** Cluster header-row tokens into column groups. A gap is treated as "still the same column label"
   *  (e.g. the space inside "Value Date") only if it's close to a single word-space for this font size;
   *  anything wider is a real column boundary. This is deliberately based on font metrics rather than
   *  the row's own gap distribution, which is easily skewed by one unusually wide column. */
  function clusterHeaderColumns(tokens) {
    const merged = mergeClose(tokens, 3);
    if (merged.length === 0) return [];
    const avgFontSize = merged.reduce((s, t) => s + (t.fontSize || 10), 0) / merged.length;
    const threshold = Math.max(12, avgFontSize * 2.2);

    const groups = [{ tokens: [merged[0]] }];
    for (let i = 1; i < merged.length; i++) {
      const gap = merged[i].x - (merged[i - 1].x + merged[i - 1].w);
      if (gap > threshold) groups.push({ tokens: [merged[i]] });
      else groups[groups.length - 1].tokens.push(merged[i]);
    }
    return groups.map(g => {
      const xStart = g.tokens[0].x;
      const xEnd = g.tokens[g.tokens.length - 1].x + g.tokens[g.tokens.length - 1].w;
      return { label: g.tokens.map(t => t.str).join(" ").replace(/\s+/g, " ").trim(), xStart, xEnd, xCenter: (xStart + xEnd) / 2 };
    });
  }

  /** Score how strongly a row looks like a transaction-table header. */
  function scoreHeaderRow(row) {
    const text = rowText(row);
    const hits = keywordScore(text);
    return { hits, count: hits.size, text };
  }

  /**
   * Build a raw table from all pages of a document.
   * Returns { columns: [{label,xStart,xEnd,xCenter}], rows: [ [cellText,...] ], headerText, confidence }
   */
  function buildTable(pages) {
    const allRows = [];
    pages.forEach((page, pageIndex) => {
      const rows = groupRows(page.items);
      rows.forEach(r => allRows.push({ ...r, pageIndex }));
    });

    // Find the best header candidate: highest keyword score, must include date-ish + balance-ish or debit/credit
    let best = null, bestIdx = -1;
    allRows.forEach((row, idx) => {
      const s = scoreHeaderRow(row);
      const promising = s.hits.has("date") && (s.hits.has("balance") || s.hits.has("debit") || s.hits.has("credit") || s.hits.has("amount"));
      if (promising && (!best || s.count > best.count)) { best = s; bestIdx = idx; }
    });

    let confidence = "low";
    let columns, headerText, bodyStartIdx, headerRowIndices = [];

    if (best && bestIdx >= 0) {
      confidence = best.count >= 4 ? "high" : "medium";
      const headerRow = allRows[bestIdx];
      columns = clusterHeaderColumns(headerRow.tokens);
      headerText = best.text;
      bodyStartIdx = bestIdx + 1;

      // find repeated header rows (e.g. printed again on every page) so we can skip them as data
      const headerLabelsKey = columns.map(c => c.label.toLowerCase()).join("|");
      allRows.forEach((row, idx) => {
        if (idx <= bestIdx) return;
        const s2 = scoreHeaderRow(row);
        if (s2.count >= Math.max(2, best.count - 1)) headerRowIndices.push(idx);
      });
    } else {
      // Fallback: no confident header found. Use the row with the most tokens in the densest y-band
      // as an implied grid, purely from geometry, and flag low confidence for mandatory manual mapping.
      const rowsWithCount = allRows.map((r, idx) => ({ idx, n: mergeClose(r.tokens).length }));
      rowsWithCount.sort((a, b) => b.n - a.n);
      const refIdx = rowsWithCount.length ? rowsWithCount[0].idx : 0;
      const refRow = allRows[refIdx] || { tokens: [] };
      columns = clusterHeaderColumns(refRow.tokens).map((c, i) => ({ ...c, label: `Column ${i + 1}` }));
      headerText = "(no header row recognised)";
      bodyStartIdx = 0;
    }

    // widen first/last column bounds to catch stray tokens, and set boundaries as midpoints between neighbours
    if (columns.length > 1) {
      for (let i = 0; i < columns.length; i++) {
        const prevEnd = i === 0 ? -Infinity : (columns[i - 1].xEnd + columns[i].xStart) / 2;
        const nextStart = i === columns.length - 1 ? Infinity : (columns[i].xEnd + columns[i + 1].xStart) / 2;
        columns[i].assignStart = prevEnd;
        columns[i].assignEnd = nextStart;
      }
    } else if (columns.length === 1) {
      columns[0].assignStart = -Infinity; columns[0].assignEnd = Infinity;
    }

    const dataRows = [];
    for (let idx = bodyStartIdx; idx < allRows.length; idx++) {
      if (headerRowIndices.includes(idx)) continue;
      const row = allRows[idx];
      const merged = mergeClose(row.tokens);
      if (merged.length === 0) continue;
      const cells = columns.map(() => []);
      merged.forEach(tok => {
        let colIdx = columns.findIndex(c => tok.x >= c.assignStart && tok.x < c.assignEnd);
        if (colIdx === -1) {
          // nearest column center as last resort
          let bestI = 0, bestD = Infinity;
          columns.forEach((c, i) => { const d = Math.abs(tok.x - c.xCenter); if (d < bestD) { bestD = d; bestI = i; } });
          colIdx = bestI;
        }
        cells[colIdx].push(tok.str);
      });
      dataRows.push(cells.map(c => c.join(" ").replace(/\s+/g, " ").trim()));
    }

    return {
      columns: columns.map(c => ({ label: c.label, xCenter: c.xCenter })),
      rows: dataRows,
      headerText,
      confidence
    };
  }

  return { buildTable, groupRows, rowText, mergeClose };
})();
