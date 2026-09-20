/* Ledgerline — pdfExtract.js
 * Extracts positioned text items from a PDF entirely client-side using pdf.js.
 * Nothing here ever leaves the browser tab.
 */

const PdfExtract = (() => {

  /**
   * Load a PDF (ArrayBuffer) and return { pages: [ { items: [{str,x,y,w,fontSize}], width, height } ], numPages }.
   * If the document is password protected, `getPassword` is called (may be called more than once on wrong password)
   * and must return a Promise<string|null>. Returning null aborts.
   */
  async function extract(arrayBuffer, getPassword) {
    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });

    loadingTask.onPassword = async (callback, reason) => {
      // reason: 1 = need password, 2 = incorrect password
      const pw = await getPassword(reason === 2);
      if (pw === null || pw === undefined) {
        try { loadingTask.destroy(); } catch (e) {}
        return;
      }
      callback(pw);
    };

    const pdf = await loadingTask.promise;
    const pages = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();

      const items = content.items
        .filter(it => it.str && it.str.trim() !== "")
        .map(it => {
          // transform: [scaleX, skewX, skewY, scaleY, x, y] in PDF space (origin bottom-left)
          const t = it.transform;
          const x = t[4];
          const yTop = viewport.height - t[5]; // convert to top-left origin for readability
          const fontSize = Math.hypot(t[0], t[1]) || 10;
          return { str: it.str, x, y: yTop, w: it.width || 0, fontSize };
        });

      pages.push({ items, width: viewport.width, height: viewport.height });
    }

    return { pages, numPages: pdf.numPages };
  }

  return { extract };
})();
