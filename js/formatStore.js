/* Ledgerline — formatStore.js
 * Saves confirmed column mappings against their format fingerprint in
 * localStorage, so the same layout is recognised automatically next time.
 * Nothing here ever touches a network request.
 */

const FormatStore = (() => {
  const KEY = "ledgerline.formats.v1";

  function loadAll() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error("FormatStore: corrupt store, resetting.", e);
      return {};
    }
  }

  function saveAll(obj) {
    localStorage.setItem(KEY, JSON.stringify(obj));
  }

  function get(fp) {
    return loadAll()[fp] || null;
  }

  function list() {
    const all = loadAll();
    return Object.values(all).sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
  }

  /** Save/overwrite a confirmed mapping. record: {fp, signature, bankName, label, columns, mapping, dateFormatHint} */
  function save(record) {
    const all = loadAll();
    const existing = all[record.fp];
    all[record.fp] = {
      ...existing,
      ...record,
      createdAt: existing?.createdAt || Date.now(),
      lastUsedAt: Date.now(),
      useCount: (existing?.useCount || 0) + (existing ? 0 : 1),
    };
    saveAll(all);
    return all[record.fp];
  }

  function markUsed(fp) {
    const all = loadAll();
    if (all[fp]) {
      all[fp].lastUsedAt = Date.now();
      all[fp].useCount = (all[fp].useCount || 0) + 1;
      saveAll(all);
    }
  }

  function remove(fp) {
    const all = loadAll();
    delete all[fp];
    saveAll(all);
  }

  return { get, list, save, remove, markUsed };
})();
