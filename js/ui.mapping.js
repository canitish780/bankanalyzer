/* Ledgerline — ui.mapping.js */

const UiMapping = (() => {

  const FIELD_DEFS = [
    { key: "date", label: "Date", required: true },
    { key: "narration", label: "Narration", required: true },
    { key: "debit", label: "Debit", required: true },
    { key: "credit", label: "Credit", required: true },
    { key: "balance", label: "Balance", required: true },
  ];

  function guessMapping(table) {
    const guess = {};
    table.columns.forEach((c, i) => {
      const lbl = c.label.toLowerCase();
      if (!guess.date && /date/.test(lbl) && !/value/.test(lbl)) guess.date = i;
      if (!guess.date && /date/.test(lbl)) guess.date = i;
      if (!guess.narration && /(narration|particular|description|remarks|details)/.test(lbl)) guess.narration = i;
      if (!guess.debit && /(debit|withdrawal|\bdr\b)/.test(lbl)) guess.debit = i;
      if (!guess.credit && /(credit|deposit|\bcr\b)/.test(lbl)) guess.credit = i;
      if (!guess.balance && /balance/.test(lbl)) guess.balance = i;
      if (!guess.type && /(dr\s*\/\s*cr|cr\s*\/\s*dr|^type$)/.test(lbl)) guess.type = i;
      if (!guess.debit && !guess.credit && /^amount$/.test(lbl)) { guess.debit = i; guess.credit = i; }
    });
    return guess;
  }

  function columnOptions(table, selected) {
    let html = `<option value="">— none / not present —</option>`;
    table.columns.forEach((c, i) => {
      html += `<option value="${i}" ${selected === i ? "selected" : ""}>${Utils.escapeHtml(c.label || `Column ${i + 1}`)}</option>`;
    });
    return html;
  }

  function sampleForColumn(table, colIdx, n = 3) {
    if (colIdx === "" || colIdx === undefined || colIdx === null) return "";
    return table.rows.slice(0, 8).map(r => r[colIdx]).filter(Boolean).slice(0, n).join(" · ");
  }

  function previewTableHtml(table, mapping) {
    const rows = table.rows.slice(0, 12);
    const colClass = (i) => {
      if (mapping.debit === i) return "col-debit";
      if (mapping.credit === i) return "col-credit";
      if (mapping.balance === i) return "col-balance";
      return "";
    };
    return `<div class="preview-table-wrap"><table class="preview-table">
      <thead><tr>${table.columns.map((c, i) => `<th>${Utils.escapeHtml(c.label || `Col ${i+1}`)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map((cell, i) => `<td class="${colClass(i)}">${Utils.escapeHtml(cell || "")}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>`;
  }

  function validationHtml(preview) {
    if (!preview) return "";
    const { parsedCount, skipped, validation } = preview;
    if (parsedCount === 0) {
      return `<div class="validation-box error">No rows could be read with this mapping yet. Check that Date and Balance are pointing at the right columns.</div>`;
    }
    const pct = Math.round(validation.matchRate * 100);
    if (pct >= 95) {
      return `<div class="validation-box ok"><strong>${pct}%</strong>&nbsp;of running-balance checks match (${validation.checked} checked, order: ${validation.order}). ${parsedCount} rows parsed${skipped ? `, ${skipped} rows skipped as non-transaction lines` : ""}.</div>`;
    }
    if (pct >= 75) {
      return `<div class="validation-box warn"><strong>${pct}%</strong> of running-balance checks match — some rows may be misread. Review the mapping before saving. (${validation.checked} checked, order: ${validation.order})</div>`;
    }
    return `<div class="validation-box error"><strong>${pct}%</strong> of running-balance checks match — this mapping looks wrong for this statement. ${parsedCount} rows parsed, ${skipped} skipped.</div>`;
  }

  /**
   * Renders the mapping UI for a statement into `host`.
   * onSave(mapping, bankName, accountLabel) is called when the user confirms.
   */
  function render(host, statement, onSave, onPreview) {
    const table = statement.table;
    const initialMapping = statement.mapping || guessMapping(table);
    const bankName = statement.bankName || Fingerprint.guessBankName(statement.firstPageText) || "";
    const accountLabel = statement.accountLabel || (bankName ? `${bankName}` : statement.name.replace(/\.pdf$/i, ""));

    host.innerHTML = `
      <div class="card">
        <div class="card-title">${statement.matchedFormat ? "Confirm recognised format" : "New format — map the columns"}</div>
        <div class="card-sub">${statement.matchedFormat
          ? `This layout matches a format you've mapped before (${statement.matchedFormat.label || statement.matchedFormat.bankName || "saved format"}). Review and confirm, or adjust below.`
          : `Ledgerline hasn't seen this exact column layout before. Map each field once and it will be recognised automatically next time.`}</div>

        <div class="map-fingerprint">Fingerprint ${statement.fp} · ${table.columns.length} columns detected · header confidence: ${table.confidence}</div>

        <div class="bank-name-row">
          <div class="field">
            <label for="mapBankName">Bank name</label>
            <input class="text-input" id="mapBankName" type="text" value="${Utils.escapeHtml(bankName)}" placeholder="e.g. HDFC Bank" style="width:220px" />
          </div>
          <div class="field">
            <label for="mapAccountLabel">Account label</label>
            <input class="text-input" id="mapAccountLabel" type="text" value="${Utils.escapeHtml(accountLabel)}" placeholder="e.g. HDFC — a/c 1234" style="width:260px" />
          </div>
          <div class="field">
            <label for="mapFormatLabel">Format name (optional)</label>
            <input class="text-input" id="mapFormatLabel" type="text" value="${Utils.escapeHtml(statement.matchedFormat?.label || "")}" placeholder="e.g. HDFC savings, 2023 layout" style="width:240px" />
          </div>
        </div>

        <div class="map-grid" id="mapGrid">
          ${FIELD_DEFS.map(f => `
            <div class="map-field" data-field="${f.key}">
              <label>${f.label}${f.required ? "" : " (optional)"}</label>
              <select class="select map-select" data-field="${f.key}">${columnOptions(table, initialMapping[f.key])}</select>
              <div class="map-field-sample" data-sample="${f.key}">${Utils.escapeHtml(sampleForColumn(table, initialMapping[f.key]))}</div>
            </div>`).join("")}
        </div>
        <div class="map-field" style="max-width:280px;margin-bottom:20px;">
          <label>Dr / Cr indicator (only if Debit &amp; Credit above point at the same "Amount" column)</label>
          <select class="select map-select" data-field="type">${columnOptions(table, initialMapping.type)}</select>
        </div>

        <div class="card-title" style="font-size:13.5px;margin-bottom:8px;">Preview — first rows as detected</div>
        <div id="mapPreviewTable">${previewTableHtml(table, initialMapping)}</div>

        <div id="mapValidation"></div>

        <div class="map-actions" style="margin-top:18px;">
          <button class="btn btn-primary" id="mapConfirmBtn">Save mapping &amp; analyse</button>
          <button class="btn btn-ghost" id="mapCancelBtn">Cancel</button>
          <span class="map-hint">This mapping is saved locally in your browser and reused automatically for statements with the same layout.</span>
        </div>
      </div>
    `;

    function currentMapping() {
      const m = {};
      host.querySelectorAll(".map-select").forEach(sel => {
        const v = sel.value;
        m[sel.dataset.field] = v === "" ? null : parseInt(v, 10);
      });
      return m;
    }

    function refresh() {
      const mapping = currentMapping();
      host.querySelectorAll(".map-field").forEach(fieldEl => {
        const key = fieldEl.dataset.field;
        if (!key) return;
        const sampleEl = fieldEl.querySelector(".map-field-sample");
        if (sampleEl) sampleEl.textContent = sampleForColumn(table, mapping[key]);
        const def = FIELD_DEFS.find(f => f.key === key);
        if (def) fieldEl.classList.toggle("is-unmapped", mapping[key] == null);
      });
      document.getElementById("mapPreviewTable").innerHTML = previewTableHtml(table, mapping);
      const preview = onPreview(mapping);
      document.getElementById("mapValidation").innerHTML = validationHtml(preview);

      const confirmBtn = document.getElementById("mapConfirmBtn");
      confirmBtn.disabled = !mapping.date || !mapping.narration || !mapping.balance || (mapping.debit == null && mapping.credit == null);
    }

    host.querySelectorAll(".map-select").forEach(sel => sel.addEventListener("change", refresh));
    refresh();

    document.getElementById("mapConfirmBtn").addEventListener("click", () => {
      const mapping = currentMapping();
      const bank = document.getElementById("mapBankName").value.trim();
      const acct = document.getElementById("mapAccountLabel").value.trim() || bank || statement.name;
      const fmtLabel = document.getElementById("mapFormatLabel").value.trim();
      onSave(mapping, bank, acct, fmtLabel);
    });
    document.getElementById("mapCancelBtn").addEventListener("click", () => {
      App.showView("upload");
    });
  }

  return { render, guessMapping };
})();
