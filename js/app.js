/* Ledgerline — app.js
 * Orchestrates the whole flow: upload → recognise/map format → validate →
 * combine into accounts → analyse → report. Everything runs in this tab;
 * PDF bytes are never sent anywhere.
 */

const App = (() => {

  const AUTO_ACCEPT_THRESHOLD = 0.9; // running-balance match rate required to skip the mapping screen

  const state = {
    statements: [],       // see shape below
    currentView: "upload",
    currentMappingId: null,
    accounts: new Map(),  // accountLabel -> { bankName, transactions:[], statements:[], largeThreshold }
    selectedAccount: null,
  };

  // ---------------------------------------------------------------- views

  function showView(view) {
    state.currentView = view;
    document.querySelectorAll(".rail-link").forEach(b => b.classList.toggle("is-active", b.dataset.view === view));
    document.querySelectorAll(".view").forEach(v => v.hidden = v.dataset.viewPanel !== view);
    if (view === "mapping") renderMappingView();
    if (view === "dashboard") renderDashboardView();
    if (view === "formats") UiFormats.render(document.getElementById("formatsHost"));
  }

  function initNav() {
    document.querySelectorAll(".rail-link").forEach(btn => {
      btn.addEventListener("click", () => showView(btn.dataset.view));
    });
  }

  // ---------------------------------------------------------------- upload

  function initUpload() {
    const dz = document.getElementById("dropzone");
    const input = document.getElementById("fileInput");
    dz.addEventListener("click", () => input.click());
    dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") input.click(); });
    input.addEventListener("change", () => { handleFiles(input.files); input.value = ""; });

    ["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-drag"); }));
    ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-drag"); }));
    dz.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });
  }

  function handleFiles(fileList) {
    const files = [...fileList].filter(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (!files.length) { Utils.toast("Only PDF files are supported.", "error"); return; }
    files.forEach(addStatement);
  }

  function addStatement(file) {
    const stmt = {
      id: Utils.uid("stmt"),
      file, name: file.name, size: file.size,
      status: "pending", // pending | needs_mapping | mapped | error
      error: null,
      table: null, fp: null, signature: null,
      firstPageText: "",
      bankName: "", accountLabel: "",
      matchedFormat: null,
      mapping: null,
      transactions: [], validation: null,
    };
    state.statements.push(stmt);
    renderStatementList();
    processStatement(stmt.id);
  }

  async function processStatement(id) {
    const stmt = state.statements.find(s => s.id === id);
    if (!stmt) return;
    try {
      const buf = await stmt.file.arrayBuffer();
      const getPassword = async (isRetry) => {
        const msg = isRetry ? `Incorrect password. Enter the password for "${stmt.name}":` : `"${stmt.name}" is password protected. Enter the password:`;
        return window.prompt(msg);
      };
      const { pages } = await PdfExtract.extract(buf, getPassword);
      if (!pages.length) throw new Error("No readable pages found in this PDF.");

      stmt.firstPageText = pages[0].items.map(it => it.str).join(" ").slice(0, 4000);
      const table = TableDetect.buildTable(pages);
      if (!table.rows.length) throw new Error("Could not find any table rows in this PDF — it may be a scanned image without selectable text.");

      stmt.table = table;
      const { fp, signature } = Fingerprint.computeFingerprint(table.columns);
      stmt.fp = fp; stmt.signature = signature;

      const saved = FormatStore.get(fp);
      if (saved) {
        stmt.matchedFormat = saved;
        stmt.mapping = saved.mapping;
        stmt.bankName = saved.bankName || Fingerprint.guessBankName(stmt.firstPageText);
        stmt.accountLabel = saved.label || stmt.bankName || stmt.name.replace(/\.pdf$/i, "");
        const parsed = Parser.applyMapping(table, saved.mapping);
        const validation = Parser.validateRunningBalance(parsed.transactions);
        if (parsed.transactions.length > 0 && validation.matchRate >= AUTO_ACCEPT_THRESHOLD) {
          stmt.transactions = Parser.chronological(parsed.transactions, validation.order);
          stmt.validation = validation;
          stmt.skipped = parsed.skipped;
          stmt.status = "mapped";
          FormatStore.markUsed(fp);
          rebuildAccounts();
          Utils.toast(`${stmt.name}: recognised format, ${stmt.transactions.length} transactions verified.`);
        } else {
          stmt.status = "needs_mapping";
          stmt.pendingValidation = validation;
          Utils.toast(`${stmt.name}: layout matched a saved format but the running balance doesn't confirm it — please review.`, "error");
        }
      } else {
        stmt.bankName = Fingerprint.guessBankName(stmt.firstPageText);
        stmt.accountLabel = stmt.bankName || stmt.name.replace(/\.pdf$/i, "");
        stmt.status = "needs_mapping";
      }
    } catch (err) {
      console.error(err);
      stmt.status = "error";
      stmt.error = err.message || "Could not read this PDF.";
    }
    renderStatementList();
    if (state.currentView === "mapping" && state.currentMappingId === stmt.id) renderMappingView();
  }

  function statusBadge(stmt) {
    switch (stmt.status) {
      case "pending": return `<span class="stmt-status status-pending">Reading…</span>`;
      case "needs_mapping": return `<span class="stmt-status status-review">Needs mapping</span>`;
      case "mapped": {
        const pct = Math.round((stmt.validation?.matchRate || 0) * 100);
        return `<span class="stmt-status status-ok">Verified ${pct}%</span>`;
      }
      case "error": return `<span class="stmt-status status-error">Error</span>`;
      default: return "";
    }
  }

  function renderStatementList() {
    const host = document.getElementById("statementList");
    const emptyNote = document.getElementById("uploadEmptyNote");
    emptyNote.hidden = state.statements.length > 0;

    host.innerHTML = state.statements.map(s => `
      <div class="stmt-row" data-id="${s.id}">
        <div class="stmt-main">
          <div class="stmt-name">${Utils.escapeHtml(s.name)}</div>
          <div class="stmt-meta">${(s.size / 1024).toFixed(0)} KB${s.accountLabel ? " · " + Utils.escapeHtml(s.accountLabel) : ""}${s.error ? " · " + Utils.escapeHtml(s.error) : ""}${s.transactions.length ? ` · ${s.transactions.length} txns` : ""}</div>
        </div>
        <div>${statusBadge(s)}</div>
        <div class="stmt-actions">
          ${s.status === "needs_mapping" ? `<button class="btn btn-sm btn-primary" data-action="map" data-id="${s.id}">Map format</button>` : ""}
          ${s.status === "mapped" ? `<button class="btn btn-sm btn-ghost" data-action="remap" data-id="${s.id}">Re-map</button>` : ""}
          ${s.status === "error" ? `<button class="btn btn-sm btn-ghost" data-action="retry" data-id="${s.id}">Retry</button>` : ""}
        </div>
        <div class="stmt-actions">
          <button class="btn btn-sm btn-ghost btn-danger" data-action="remove" data-id="${s.id}">Remove</button>
        </div>
      </div>
    `).join("");

    host.querySelectorAll("[data-action='map'], [data-action='remap']").forEach(btn => {
      btn.addEventListener("click", () => { state.currentMappingId = btn.dataset.id; showView("mapping"); });
    });
    host.querySelectorAll("[data-action='retry']").forEach(btn => {
      btn.addEventListener("click", () => { const s = state.statements.find(x => x.id === btn.dataset.id); s.status = "pending"; s.error = null; renderStatementList(); processStatement(s.id); });
    });
    host.querySelectorAll("[data-action='remove']").forEach(btn => {
      btn.addEventListener("click", () => {
        state.statements = state.statements.filter(s => s.id !== btn.dataset.id);
        rebuildAccounts();
        renderStatementList();
      });
    });
  }

  // ---------------------------------------------------------------- mapping

  function renderMappingView() {
    const host = document.getElementById("mappingHost");
    let stmt = state.statements.find(s => s.id === state.currentMappingId);
    if (!stmt || stmt.status === "pending") {
      const candidates = state.statements.filter(s => s.status === "needs_mapping");
      if (!candidates.length) {
        host.innerHTML = `<div class="empty-note">No statements are waiting on a format mapping right now. Add a statement, or use "Re-map" on one from the Statements screen.</div>`;
        return;
      }
      host.innerHTML = `<div class="empty-note">Select a statement to map:</div>`;
      const list = document.createElement("div");
      list.className = "statement-list";
      list.innerHTML = candidates.map(c => `<div class="stmt-row"><div class="stmt-main"><div class="stmt-name">${Utils.escapeHtml(c.name)}</div></div><div></div><div class="stmt-actions"><button class="btn btn-sm btn-primary" data-id="${c.id}">Map this statement</button></div><div></div></div>`).join("");
      host.appendChild(list);
      list.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { state.currentMappingId = b.dataset.id; renderMappingView(); }));
      return;
    }

    UiMapping.render(
      host,
      stmt,
      (mapping, bankName, accountLabel, formatLabel) => { confirmMapping(stmt.id, mapping, bankName, accountLabel, formatLabel); },
      (mapping) => {
        const parsed = Parser.applyMapping(stmt.table, mapping);
        const validation = Parser.validateRunningBalance(parsed.transactions);
        return { parsedCount: parsed.transactions.length, skipped: parsed.skipped, validation };
      }
    );
  }

  function confirmMapping(id, mapping, bankName, accountLabel, formatLabel) {
    const stmt = state.statements.find(s => s.id === id);
    if (!stmt) return;
    const parsed = Parser.applyMapping(stmt.table, mapping);
    const validation = Parser.validateRunningBalance(parsed.transactions);

    if (parsed.transactions.length === 0) {
      Utils.toast("This mapping produced zero valid transactions — please check the column selections.", "error");
      return;
    }

    FormatStore.save({
      fp: stmt.fp, signature: stmt.signature, bankName, label: formatLabel || bankName,
      columns: stmt.table.columns, mapping,
    });

    stmt.mapping = mapping;
    stmt.bankName = bankName;
    stmt.accountLabel = accountLabel;
    stmt.transactions = Parser.chronological(parsed.transactions, validation.order);
    stmt.validation = validation;
    stmt.skipped = parsed.skipped;
    stmt.status = "mapped";
    stmt.matchedFormat = FormatStore.get(stmt.fp);

    const pct = Math.round(validation.matchRate * 100);
    if (pct < 75) {
      Utils.toast(`Saved, but only ${pct}% of running-balance checks match — double-check this statement's figures before relying on them.`, "error");
    } else {
      Utils.toast(`Mapping saved. ${stmt.transactions.length} transactions verified at ${pct}%.`);
    }

    rebuildAccounts();
    renderStatementList();
    state.selectedAccount = accountLabel;
    showView("dashboard");
  }

  // ---------------------------------------------------------------- accounts

  function rebuildAccounts() {
    const accounts = new Map();
    state.statements.filter(s => s.status === "mapped").forEach(s => {
      const key = s.accountLabel || s.bankName || s.name;
      if (!accounts.has(key)) accounts.set(key, { bankName: s.bankName, transactions: [], statements: [], largeThreshold: state.accounts.get(key)?.largeThreshold });
      const acc = accounts.get(key);
      acc.transactions.push(...s.transactions);
      acc.statements.push(s);
    });
    accounts.forEach(acc => acc.transactions.sort((a, b) => a.date - b.date));
    state.accounts = accounts;
    if (!state.selectedAccount || !accounts.has(state.selectedAccount)) {
      state.selectedAccount = accounts.size ? [...accounts.keys()][0] : null;
    }
    if (state.currentView === "dashboard") renderDashboardView();
  }

  function setLargeThresholdAndRerender(v) {
    const acc = state.accounts.get(state.selectedAccount);
    if (!acc) return;
    acc.largeThreshold = v;
    renderDashboardView();
  }

  function renderDashboardView() {
    const select = document.getElementById("accountSelect");
    const host = document.getElementById("dashboardHost");
    const downloadBtn = document.getElementById("downloadReportBtn");

    if (!state.accounts.size) {
      select.innerHTML = "";
      downloadBtn.disabled = true;
      host.innerHTML = `<div class="empty-note">No verified statements yet. Add a statement and confirm its format mapping to see analysis here.</div>`;
      return;
    }

    select.innerHTML = [...state.accounts.keys()].map(k => `<option value="${Utils.escapeHtml(k)}" ${k === state.selectedAccount ? "selected" : ""}>${Utils.escapeHtml(k)}</option>`).join("");
    select.onchange = () => { state.selectedAccount = select.value; renderDashboardView(); };
    downloadBtn.disabled = false;
    downloadBtn.onclick = () => {
      const acc = state.accounts.get(state.selectedAccount);
      const analysis = Analyzer.analyze(acc.transactions, { largeThreshold: acc.largeThreshold });
      Report.downloadReport(state.selectedAccount, acc.bankName, analysis);
    };

    const acc = state.accounts.get(state.selectedAccount);
    const analysis = acc ? Analyzer.analyze(acc.transactions, { largeThreshold: acc.largeThreshold }) : null;
    UiDashboard.render(host, state.selectedAccount, acc?.bankName, analysis, acc?.statements || []);
  }

  // ---------------------------------------------------------------- init

  function init() {
    initNav();
    initUpload();
    showView("upload");
  }

  document.addEventListener("DOMContentLoaded", init);

  return { showView, setLargeThresholdAndRerender };
})();
