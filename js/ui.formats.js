/* Ledgerline — ui.formats.js */

const UiFormats = (() => {

  const FIELD_ORDER = ["date", "narration", "debit", "credit", "balance", "type"];

  function fieldChips(record) {
    return FIELD_ORDER.filter(f => record.mapping[f] !== null && record.mapping[f] !== undefined)
      .map(f => {
        const col = record.columns[record.mapping[f]];
        return `<span>${f} → ${Utils.escapeHtml(col ? col.label : "?")}</span>`;
      }).join("");
  }

  function render(host) {
    const formats = FormatStore.list();
    if (!formats.length) {
      host.innerHTML = `<div class="empty-note">No formats saved yet. Map a statement and it will appear here, ready to be recognised automatically next time.</div>`;
      return;
    }

    host.innerHTML = formats.map(f => `
      <div class="card format-card" data-fp="${f.fp}">
        <div class="format-card-main">
          <div class="format-card-title">${Utils.escapeHtml(f.label || f.bankName || "Unnamed format")}${f.bankName && f.label ? ` <span style="color:var(--muted);font-weight:400;">— ${Utils.escapeHtml(f.bankName)}</span>` : ""}</div>
          <div class="format-card-fp">fp ${f.fp} · used ${f.useCount || 1} time${(f.useCount||1)===1?"":"s"} · last used ${new Date(f.lastUsedAt).toLocaleDateString("en-IN")}</div>
          <div class="format-card-cols">${fieldChips(f)}</div>
        </div>
        <div class="stmt-actions">
          <button class="btn btn-sm btn-ghost" data-action="rename" data-fp="${f.fp}">Rename</button>
          <button class="btn btn-sm btn-danger btn-ghost" data-action="delete" data-fp="${f.fp}">Delete</button>
        </div>
      </div>
    `).join("");

    host.querySelectorAll("[data-action='rename']").forEach(btn => btn.addEventListener("click", () => {
      const fp = btn.dataset.fp;
      const rec = FormatStore.get(fp);
      const name = prompt("Format name", rec.label || rec.bankName || "");
      if (name !== null) {
        FormatStore.save({ ...rec, label: name.trim() });
        render(host);
        Utils.toast("Format renamed.");
      }
    }));

    host.querySelectorAll("[data-action='delete']").forEach(btn => btn.addEventListener("click", () => {
      const fp = btn.dataset.fp;
      if (confirm("Delete this saved format? Statements with this layout will need to be mapped again.")) {
        FormatStore.remove(fp);
        render(host);
        Utils.toast("Format deleted.");
      }
    }));
  }

  return { render };
})();
