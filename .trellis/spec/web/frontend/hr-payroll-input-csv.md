# Payroll input local CSV preparation

The new-input and whole-draft edit workspaces may export and read a local UTF-8 CSV for the complete selected roster. This is a client-only drafting aid: it never uploads a file, writes an input revision, calculates a payroll run, or confirms/payments a batch. Existing save and independent-confirm actions remain the only mutations.

The exported v1 sheet carries its format/version, period, rule/input revision context, ordered roster identity/version/name/code and direct-input column set in a SHA-256 drift marker. The marker is a stale-preview check, never an authorization or approval token. A preview must reject a changed period, rule, head/input version, frozen source, correction window, roster, employee identity/version, row set, header, or project set before producing any update.

Read at most 32 MiB of strict UTF-8 `.csv` input with a bounded RFC4180 parser. Keep employee codes and direct-input amounts as strings; do not use `Number`, evaluate spreadsheet formulas, or accept exponent/grouped/currency values. A leading apostrophe may be removed only when the remaining direct-input text is a valid bounded decimal. Blank amount cells preserve the current draft value and an explicit `0` remains a change.

The preview covers every changed cell with paging, requires an explicit local confirmation, and becomes unusable after a draft, context, permission, busy-state, or unmount change. Abort an in-flight local reader on those changes. Parents must retain their existing write lock, employee versions, settlement dates/reasons and save retry semantics; applying a preview replaces only `directItems` and resets its local page. Use the shared local file-picker surface so the native input remains visually hidden, and use DS panels, buttons and mobile records with desktop and 390px verification.

Tests cover complete rosters beyond a visible page, exact large decimals/zero/negative/blank handling, source/correction/version drift, malformed and non-UTF-8 files, all-or-nothing failure, preview invalidation, no API call before the normal save, and preservation of settlement metadata.
