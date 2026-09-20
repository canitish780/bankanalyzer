/* Ledgerline — utils.js
 * Small, dependency-free helpers used across the app.
 */

const Utils = (() => {

  /** Parse an amount string like "1,23,456.00", "(2,500.00)", "1234.5 Dr" into a signed float, or null if not numeric. */
  function parseAmount(raw) {
    if (raw === null || raw === undefined) return null;
    let s = String(raw).trim();
    if (s === "" || s === "-" || /^n\.?a\.?$/i.test(s)) return null;

    let negative = false;
    if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
    if (/\bdr\b\.?$/i.test(s)) { negative = true; s = s.replace(/\bdr\b\.?$/i, ""); }
    if (/\bcr\b\.?$/i.test(s)) { s = s.replace(/\bcr\b\.?$/i, ""); }
    s = s.replace(/[^\d.\-]/g, "");
    if (s === "" || s === "-" || s === ".") return null;
    const n = parseFloat(s);
    if (Number.isNaN(n)) return null;
    return negative ? -Math.abs(n) : n;
  }

  /** Try a wide range of date formats used across Indian & international bank statements. Returns a Date or null. */
  function parseDate(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;

    const months = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11
    };

    // DD-MMM-YYYY / DD MMM YYYY / DD-MMM-YY
    let m = s.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3,9})[\s\-\/](\d{2,4})$/);
    if (m) {
      const mon = months[m[2].slice(0, 3).toLowerCase()];
      if (mon !== undefined) {
        let yr = parseInt(m[3], 10);
        if (yr < 100) yr += yr < 70 ? 2000 : 1900;
        const d = new Date(yr, mon, parseInt(m[1], 10));
        if (!isNaN(d)) return d;
      }
    }

    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (day-first, standard for Indian statements)
    m = s.match(/^(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{2,4})$/);
    if (m) {
      let yr = parseInt(m[3], 10);
      if (yr < 100) yr += yr < 70 ? 2000 : 1900;
      let day = parseInt(m[1], 10), mon = parseInt(m[2], 10) - 1;
      if (mon > 11) { [day, mon] = [mon + 1, day - 1]; } // swap if looks like MM/DD
      const d = new Date(yr, mon, day);
      if (!isNaN(d)) return d;
    }

    // YYYY-MM-DD
    m = s.match(/^(\d{4})[\.\-\/](\d{1,2})[\.\-\/](\d{1,2})$/);
    if (m) {
      const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
      if (!isNaN(d)) return d;
    }

    // DDMMYYYY compact
    m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (m) {
      const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
      if (!isNaN(d)) return d;
    }

    return null;
  }

  function fmtDate(d) {
    if (!d) return "—";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function fmtMonth(d) {
    return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  }

  function fmtCurrency(n, opts = {}) {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    const str = abs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${sign}${opts.symbol !== false ? "₹" : ""}${str}`;
  }

  function fmtInt(n) {
    if (n === null || n === undefined) return "—";
    return n.toLocaleString("en-IN");
  }

  function monthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function uid(prefix = "id") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /** Simple, stable string hash (FNV-1a) → hex. Used for format fingerprints, not for security. */
  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function toast(msg, type = "info") {
    const host = document.getElementById("toastHost");
    if (!host) return;
    const el = document.createElement("div");
    el.className = "toast" + (type === "error" ? " toast-error" : "");
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  return { parseAmount, parseDate, fmtDate, fmtMonth, fmtCurrency, fmtInt, monthKey, uid, hashString, escapeHtml, toast };
})();
