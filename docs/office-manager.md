# Still Partners Office Manager

Product direction and delivery priorities: [Office Manager direction](OFFICE_MANAGER_DIRECTION.md). Planned monitoring and cross-chat memory are distinguished there from implemented behaviour.

Open https://www.stillpartners.net/office with the finance admin account. On iPhone use Safari, Share, Add to Home Screen. Operations admins retain the site/day work tools; financial records and Assistant are finance-admin only.

## Current workflows

- Today: choose the site, add contractors, enter actual hours. Finance can separately record contractor payable and client billable hours with an agreement note.
- Company: contractor directory, client/site records, effective-dated agreed rates, work history, incoming invoice metadata and client invoice drafts.
- Assistant: separate persisted conversations and a fixed composer; company-record retrieval, selected verified source text, invoice reconciliation and ABN lookup. It prepares client/site/invoice proposals and single or batch contractor registrations. A fresh-invoice request invokes the fixed Gmail importer. The model has bounded read-only company tools, not arbitrary shell, file, email-send or database access. Durable cross-chat decision memory and proactive case detection remain planned.
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

The reviewed client-invoice email workflow and authorised Mac sender are installed. Each outgoing message requires explicit approval. General correspondence ingestion, greetings and standing sending rules are not implemented. Missing client rates, incomplete time records, unknown GST and unresolved supplier identities must be supplied/reviewed before reliable invoice matching or real invoice issuance. Historical paid totals require actual dated payment evidence.

## Validation

Production builds; unit tests for monetary calculation, reconciliation, PDF output, queue retry and payment sync. Transactional database checks roll back synthetic clients/work: missing rates, separate 8-hour actual versus 10-hour billable calculation, changed-rate refusal, replay, duplicate billing, cancellation and finance permissions. Synthetic PDFs are rendered for visual QA. Authenticated owner-screen visual testing is separate from these checks.

GST rounding reference: https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices


## Reviewed client invoice email

After approving a client invoice, open **Email invoice · review & send**. Prepare a preview, inspect its saved recipient, subject, message and both exact PDFs, then use **Approve & send**. Changing a client billing email before sending starts blocks the queued message for a fresh review. Each outgoing message is approved individually. The assistant cannot approve or send an email by itself.

The scoped Mac mail worker runs each minute while awake and online. Run `scripts/install_office_mail_schedule.py <invoice-assistant-folder>` to install. The owner then runs `ENABLE_GMAIL_SEND.command` in the assistant folder and grants Gmail read/send access to the correct work account. Existing login is preserved until verification succeeds; tokens stay in macOS Application Support, outside Git. Read-only Gmail imports preserve granted scopes.

Generated client invoice PDFs are stored privately with the frozen preview. Original subcontractor files stay on Mac. Approved outgoing files and MIME messages are saved under `Client_Invoices/<client>/<invoice>/Prepared`, with confirmed deliveries copied to `Sent`. Phone approvals wait for the Mac if offline.

A durable local journal is written before the sole Gmail send attempt. Gmail confirmation is recorded separately from queuing. An ambiguous timeout or crash becomes **unknown**, never an automatic resend; inspect Gmail Sent and resolve delivery before a replacement. Queued messages can be cancelled before sending starts. Queued, sent or uncertain mail blocks invoice cancellation. Sent invoice credits/correction handling needs owner review; it is not automated.

Validation uses synthetic PDF/message fixtures and a mocked Gmail sender; no customer email is sent by tests. Live sending requires the owner consent step and a real reviewed invoice.

## Company memory and work registry — 27 September 2026

Stage 1 is implemented: Company → Company memory and Work inbox persist confirmed decisions and unfinished work independently of chat conversations. Finance admins can create/review records and inspect their version history. Every nonterminal work record requires a next action or waiting reason; closing requires an outcome/evidence note. Closure is owner-recorded, not independent proof of an external action.

New assistant requests include a task-time snapshot of company memory and work items. Read-only retrieval tools can search and read them, and the assistant can prepare one memory/work proposal for owner confirmation. A new chat preserves access to these records. Superseded/future agreements must not be applied; agreed rates remain in Agreed rates. Saving a standing rule does not activate execution authority.

Stable action IDs, transactional change events and optimistic versions prevent duplicate saves and stale overwrites. Completed assistant proposals remain proposals until applied_id is recorded. No email, bank transfer or invoice payment state is changed by saving these records. Hosted records remain accessible with the Mac off; model reasoning and local-source access still wait for the Mac. General issue detection, automatic follow-up and a standing-rule executor are not yet enabled.

Verification: rollback database checks for replay, history, stale edits and closure evidence; anonymous/direct-write denial; six worker tests; phone/desktop synthetic UI checks; actual local Codex retrieval of memory and unfinished work from a new conversation; production build. No synthetic business records retained.

## Mobile navigation — 27 September 2026

Owner-approved layout: Today is the default landing screen. Finance users have Today, Sites, Assistant, Money and Company in the bottom navigation; operational users retain only their permitted operational sections. Today links directly to contact reviews, contractor payments, client invoice review and Work inbox, and lists active sites (not a claimed schedule). Sites holds daily entry, work history and site management. Money holds contractor invoice/payment records, client invoices and agreed rates. Company holds contacts, clients/access, work and memory. Assistant links route to these destinations.

Daily-entry state remains mounted across tab changes, preserving unsaved hours. Existing invoice/history entry links still select their corresponding screen. No payment, approval, database, source-file or email policy changes are included. Documents/global search/contextual AI are not added by this navigation release.

Verified with phone and desktop synthetic browser flows: five tabs, source-to-destination links, contact reviews, client/contractor invoice separation and unsaved work retention. Production build required before release.

## Cloud transition — 27 September 2026

See CLOUD_EXECUTION.md. Read-only hosted AI/Gmail execution is implemented behind explicit environment activation and separate Google web OAuth consent. Local API credentials were not present during preparation, and live providers have not been validated. The default remains Mac execution. Cloud register ingestion, local catch-up for newly discovered cloud invoices, unattended monitoring and cloud sending remain next stages. Do not report them as completed.
