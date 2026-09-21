# Ledgerline — Bank Statement PDF Analyzer

A static, client-side web app for CA firms and loan-underwriting teams to
extract transactions from bank statement PDFs and produce a turnover /
average-balance / bounce / EMI analysis — without ever uploading the
statement anywhere. Everything runs in the browser tab.

Just **3 files**:

```
index.html
style.css
app.js
```

`app.js` is every module (PDF text extraction, column/table detection,
format fingerprinting, the saved-mapping store, parsing + running-balance
validation, the financial analysis, chart rendering, the report builder,
and all three screens' UI) concatenated in dependency order, with a
comment header marking where each original section starts — so it's easy
to navigate even as one file.

## Deploying to GitHub Pages

1. Create a GitHub repository and add these three files at the repo root
   (or under `/docs` if you prefer).
2. Commit and push.
3. **Settings → Pages** → set **Source** to the branch/folder you used →
   Save.
4. It publishes at `https://<your-username>.github.io/<repo-name>/`
   within a minute or two.

No build step — plain static files, so any static host works.

## How it works

1. **Upload** — drop one or more statement PDFs in. Ledgerline reads each
   PDF locally with [pdf.js](https://mozilla.github.io/pdf.js/) and looks
   at the *position* of every piece of text to propose a column grid — it
   never assumes which bank produced the file.
2. **Recognise or map** — each distinct column layout gets a fingerprint
   (a hash of its normalised header labels). If that exact fingerprint has
   been mapped before, Ledgerline reapplies the saved mapping automatically
   and double-checks it against the statement's own running balance. If the
   fingerprint is new, or the running-balance check comes back weak, it
   stops and asks you to map Date / Narration / Debit / Credit / Balance
   yourself, once. That mapping is then remembered for next time.
3. **Validate** — every parsed transaction is checked against the
   statement's own printed running balance (`previous balance + credit −
   debit = next balance`), in whichever order the statement actually lists
   transactions. Rows that don't reconcile are surfaced, not silently
   included in the totals.
4. **Analyse** — total credits/debits, monthly turnover, a daily-balance
   average (not just a transaction-day average), cash activity, cheque/ECS/
   EMI bounces, large transactions, and recurring EMI/loan debits.
5. **Report** — download a self-contained HTML report (printable to PDF
   from the browser) or a CSV of the underlying transactions.

All formats you confirm are stored in your browser's `localStorage`
(see the **Format library** tab) — nothing is sent to a server, because
there is no server; this is a static site.

## About the pdf.js version — please don't bump it casually

`index.html` loads pdf.js **3.11.174** from cdnjs. This is deliberate:
pdf.js v4 and later dropped the classic `pdf.min.js` global-script build
in favour of ES modules only, so a plain `<script src="...pdf.min.js">`
tag on v4+ silently fails to define `window.pdfjsLib` — which is exactly
the "Cannot read properties of undefined (reading 'getDocument')" error
you'll see the moment a PDF is uploaded, with no earlier warning. 3.11.174
is the last release that still ships the classic build both the library
and its worker need. If you do want a newer pdf.js, you'd need to switch
the loading `<script>` tags to `type="module"` and `import` it instead.

`app.js` also now checks `window.pdfjsLib` before use and throws a plain
"the PDF engine didn't load — check your connection / ad-blocker and
reload" message instead of a cryptic one, in case cdnjs is ever blocked
on a particular network.

## Extending it

You don't need to touch the code to add a new bank — the mapping UI in
**Format mapping** handles that at runtime and saves it automatically.

If you want to change the *detection heuristics or analysis rules*, open
`app.js` and jump to the relevant `/* ---------- source: ... ---------- */`
marker:

| Section marker | Responsibility |
|---|---|
| `pdfExtract.js` | Pulls positioned text out of a PDF via pdf.js. |
| `tableDetect.js` | Groups text into rows/columns from geometry alone, and tries to recognise a header row (keyword list at the top). |
| `fingerprint.js` | Turns a column layout into a stable fingerprint; also has the list of known bank names used to pre-fill the bank field. |
| `formatStore.js` | `localStorage` persistence for confirmed mappings. |
| `parser.js` | Applies a confirmed mapping to raw rows and validates the running balance. |
| `analyzer.js` | All financial-analysis logic. Bounce/EMI/cash keyword regexes live at the top of this section. |
| `charts.js`, `ui.*.js` | Rendering only. |
| `report.js` | Builds the downloadable HTML report and CSV export. |

## Limitations, by design

- **Scanned/image-only PDFs** (no selectable text) aren't supported —
  there's no OCR step, so figures are never guessed from an image.
- Detection is heuristic. Low-confidence layouts and running-balance
  mismatches are surfaced for manual review rather than silently accepted.
- Bounce/EMI/cash flags are narration-keyword and recurrence based; treat
  them as a reviewer's starting point, not a final classification.
