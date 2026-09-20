# Ledgerline — Bank Statement PDF Analyzer

A static, client-side web app for CA firms and loan-underwriting teams to
extract transactions from bank statement PDFs and produce a turnover /
average-balance / bounce / EMI analysis — without ever uploading the
statement anywhere. Everything runs in the browser tab, in plain HTML,
CSS and JavaScript.

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

## Deploying to GitHub Pages

1. Create a new GitHub repository (or use an existing one) and add these
   files at the repository root (or under `/docs` if you prefer):
   ```
   index.html
   css/styles.css
   js/*.js
   ```
2. Commit and push.
3. In the repo, go to **Settings → Pages**, set **Source** to the branch
   and folder you used (e.g. `main` / `/root` or `main` / `/docs`), and
   save.
4. GitHub will publish the site at
   `https://<your-username>.github.io/<repo-name>/` within a minute or two.

No build step, no `npm install`, no server-side code — it's plain static
files, so any static host works if you'd rather not use GitHub Pages.

## Adding support for a new bank / format

You don't need to touch the code to add a new bank — the mapping UI in
**Format mapping** handles that at runtime, and it's saved automatically.

If you do want to extend the *detection heuristics or the analysis rules*
in code, the relevant files are:

| File | Responsibility |
|---|---|
| `js/pdfExtract.js` | Pulls positioned text out of a PDF via pdf.js. |
| `js/tableDetect.js` | Groups that text into rows/columns from geometry alone, and tries to recognise a header row (keyword list at the top of the file). |
| `js/fingerprint.js` | Turns a column layout into a stable fingerprint; also has the list of known bank names used to pre-fill the bank field. |
| `js/formatStore.js` | `localStorage` persistence for confirmed mappings. |
| `js/parser.js` | Applies a confirmed mapping to raw rows and validates the running balance. |
| `js/analyzer.js` | All the financial-analysis logic (turnover, average balance, cash/bounce/EMI/large-transaction detection). Keyword regexes for bounce/EMI/cash detection live at the top of this file. |
| `js/charts.js`, `js/ui.*.js` | Rendering only — no parsing or analysis logic lives here. |
| `js/report.js` | Builds the downloadable HTML report and CSV export. |

Because detection, parsing, analysis and rendering are separated like
this, you can improve one (say, add a new bounce-narration keyword to
`analyzer.js`) without touching the PDF-reading or mapping code at all.

## Limitations, by design

- **Scanned/image-only PDFs** (no selectable text) aren't supported —
  there's no OCR step, so figures are never guessed from an image.
- Detection is heuristic. Low-confidence layouts and running-balance
  mismatches are surfaced for manual review rather than silently accepted.
- Bounce/EMI/cash flags are narration-keyword and recurrence based; treat
  them as a reviewer's starting point, not a final classification.
