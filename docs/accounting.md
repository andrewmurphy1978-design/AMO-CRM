# Accounting

Admin-only section (`/accounting`) with true double-entry books for several entities: Personal, a sole proprietorship
(T2125 lines), Canadian corporations (GIFI names) and a US LLC (Schedule C lines). Tax-line references are guides to
be confirmed with an accountant.

- **Import**: CSV (columns detected, correctable) or PDF (read by the AI, previewed). Duplicates are skipped.
- **Categorizing**: each transaction is posted to an entity + account (or split by %). A remembered supplier
  (`AccRule`) auto-categorizes future and already-imported transactions. Uncategorized ones are listed first.
- **Cross-entity**: paying for another entity posts to inter-entity / owner-capital / shareholder-loan accounts.
- **Sales taxes**: registered entities split GST/HST and QST into recoverable/payable accounts; the Reports tab shows
  collected, recoverable, remitted and owing, and the Overview shows the $30,000 small-supplier gauge.
- Engine: `src/lib/accounting/*`, actions: `src/actions/accounting.ts`.
