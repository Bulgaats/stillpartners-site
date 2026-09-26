# Still Partners Office Manager

Open https://www.stillpartners.net/office with the finance admin account. On iPhone use Safari, Share, Add to Home Screen. Operations admins retain the site/day work tools; financial records and Assistant are finance-admin only.

## Current workflows

- Today: choose the site, add contractors, enter actual hours. Finance can separately record contractor payable and client billable hours with an agreement note.
- Company: contractor directory, client/site records, effective-dated agreed rates, work history, incoming invoice metadata and client invoice drafts.
- Assistant: answers from the request-time company snapshot; prepares reviewed client, contractor, site and client invoice proposals. A fresh-invoice request invokes only the fixed read-only Gmail importer. The model has no shell, browser, email-send, file or database tools.
- Check latest invoices: queued Gmail import on the Mac, all result pages, existing 14-day overlap and local originals. Self-addressed invoice mail is included. Review warnings are retained; this is not a guarantee that every unreadable attachment was extracted.
- Invoice reconciliation: exact full-name and supplier-ABN match, valid work period, effective contractor rates, payable hours, explicit GST and overlapping-source checks. A calculation match does not verify completeness of time records or confirm payment.
- Client drafts: recorded client billable hours, client-specific office rates, owner-selected dates/GST; no spreadsheet/legacy tonne rates. Review and approve freezes the source and locks work against duplicate invoicing. Repeated submissions are idempotent. Rates are entered excluding GST.
- PDF invoice and separate production summary: actual and agreed client hours in the summary, no monetary values or rates. No conversion from hours to physical tonnage. The existing PDF font currently supports English/ASCII names; an unsupported name stops export instead of corrupting it.
- Cancellation preserves history. An approved invoice can only be cancelled after the owner confirms it has never been sent. Previously sent invoices need a separate correction/credit workflow.
- Record payment: records an actual transfer already made by the owner, not a bank transfer. Mac synchronization verifies original/checksummed Paid copies; partial payments stay out of Paid.

## Mac runtime

Install source is scripts/office_mac_sync.py and scripts/office_assistant_worker.py. Their per-user launch agents run on one authorised Mac while logged in, awake and online. Requests wait while offline. The assistant uses the Mac's existing Codex login and gpt-6-astra with xhigh reasoning. Invoice checks run locally without a model.

Credentials stay outside the repository in the user's Application Support directory. Never print or commit OAuth tokens, the scoped device token, invoice source files or private snapshots. This repository is public.

## Remaining dependencies

Gmail is currently authorised for read-only access. Sending client invoices or greetings is not enabled. It requires a reviewed outgoing-message workflow and separate Google sending consent. Missing client rates, incomplete time records, unknown GST and unresolved supplier identities must be supplied/reviewed before reliable invoice matching or real invoice issuance. Historical paid totals require actual dated payment evidence.

## Validation

Production builds; unit tests for monetary calculation, reconciliation, PDF output, queue retry and payment sync. Transactional database checks roll back synthetic clients/work: missing rates, separate 8-hour actual versus 10-hour billable calculation, changed-rate refusal, replay, duplicate billing, cancellation and finance permissions. Synthetic PDFs are rendered for visual QA. Authenticated owner-screen visual testing is separate from these checks.

GST rounding reference: https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices
