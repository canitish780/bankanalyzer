/* Ledgerline — fingerprint.js
 * A format fingerprint identifies "this exact column layout" so that once a
 * human has confirmed a mapping for it, future statements with the same
 * layout are recognised automatically. It is deliberately based only on
 * structure (column count + normalised header labels), never on amounts.
 */

const Fingerprint = (() => {

  const KNOWN_BANKS = [
    "HDFC BANK", "ICICI BANK", "STATE BANK OF INDIA", "SBI", "AXIS BANK", "KOTAK MAHINDRA BANK",
    "PUNJAB NATIONAL BANK", "BANK OF BARODA", "CANARA BANK", "UNION BANK OF INDIA", "IDFC FIRST BANK",
    "YES BANK", "INDUSIND BANK", "INDIAN BANK", "INDIAN OVERSEAS BANK", "CENTRAL BANK OF INDIA",
    "BANK OF INDIA", "UCO BANK", "BANK OF MAHARASHTRA", "FEDERAL BANK", "SOUTH INDIAN BANK",
    "RBL BANK", "AU SMALL FINANCE BANK", "KARNATAKA BANK", "CITY UNION BANK", "DCB BANK",
    "STANDARD CHARTERED", "CITIBANK", "HSBC", "DEUTSCHE BANK", "BANDHAN BANK", "IDBI BANK",
    "PAYTM PAYMENTS BANK", "JANA SMALL FINANCE BANK"
  ];

  function normalizeLabel(label) {
    return String(label || "").toLowerCase().replace(/[^a-z]/g, "");
  }

  /** Structural signature: ordered, normalised column labels. Two statements with the same
   *  columns in the same order share a fingerprint even if amounts/dates differ entirely. */
  function computeFingerprint(columns) {
    const sig = columns.map(c => normalizeLabel(c.label) || "col").join("|");
    const fp = Utils.hashString(sig + "::" + columns.length);
    return { fp, signature: sig };
  }

  function guessBankName(firstPageText) {
    const upper = (firstPageText || "").toUpperCase();
    for (const name of KNOWN_BANKS) {
      if (upper.includes(name)) return name.replace(/\bSBI\b/, "State Bank of India")
        .split(" ").map(w => w[0] + w.slice(1).toLowerCase()).join(" ");
    }
    return "";
  }

  return { computeFingerprint, normalizeLabel, guessBankName };
})();
