# Still Partners Office Manager

Product direction and delivery priorities: [Office Manager direction](OFFICE_MANAGER_DIRECTION.md). Planned monitoring and cross-chat memory are distinguished there from implemented behaviour.

Open https://www.stillpartners.net/office with the finance admin account. On iPhone use Safari, Share, Add to Home Screen. Operations admins retain the site/day work tools; financial records and Assistant are finance-admin only.

## Urgent phone work without the Mac — 29 September 2026

Assistant → **Office tools · works with Mac off** invokes the shared hosted
read services and saves results in the same conversation. It remains usable
while an AI request waits for the Mac. No paid AI model is called. Supported
exact commands such as `сүүлийн имэйлүүдийг үзүүл`, `/mail has:attachment`,
`/invoices Example`, `/contacts Example`, `/documents insurance` and `/work`
use the same service. General/ambiguous or multi-action prompts still queue for
the model; this is not an arbitrary-language cloud agent.

- Work email: live Gmail search, pages, message text, attachments and PDF preview
  in Bobby. Incoming, Sent and self-addressed results are included. Explicit
  date ranges use Perth midnights; larger/unsupported files link to the original.
- Saved invoices: name/short-name/ABN/invoice-number lookup, work-period filters,
  quantities, GST and current recorded-payment state. Latest is received-date
  order in the displayed snapshot, not a claimed live import.
- Compare with records: loads the exact invoice work period from current hosted
  records, including dates older than 90 days. Uses the existing reconciliation
  engine, separate payable hours and rates effective on each work date. Unknown
  GST, missing records, identity/source conflicts and revisions remain review
  issues. No approval or Paid event is generated.
- Work summary: dated site, actual/payable/client-billable hours. Directory
  supports saved short names, aliases and Copy contact. Company records searches
  confirmed memory and tracked matters.
- Documents: company/contractor/client catalogue, Gmail attachment references
  and private uploaded copies. Gmail → Save to Documents records the exact
  attachment source and selected owner/category; no file is duplicated unless
  separately uploaded. Existing folder-only references still require the Mac.

Company → Documents → Add document saves its reference; **Add private file**
attaches a PDF, PNG/JPEG/WebP or .txt copy to that record. Versions are immutable,
hash-verified, authenticated finance-admin only and not publicly hosted. Current
guard is 3 MiB per upload and 100 MiB cumulative reservations in this store;
these guards do not promise an unlimited/free provider quota. Larger sources
can remain in Gmail. No paid plan, new AI API or indiscriminate migration is
activated. At release the catalogue/store is empty until actual sources are
added; do not claim existing Mac documents were already migrated.

Bobby's Mac evidence tools receive the same catalogue/file manifests and can
read a selected private file using the existing revocable device credential.
The file reader cannot select arbitrary URLs/paths, write records or send mail.
Original email, image or document instructions never grant authority.

Direct jobs have a separate executor and atomic leases; neither Mac nor cloud
AI claims them. Lost replies retry reads safely, preserve the saved request,
and reject stale completion. File upload reservations deduplicate exact copies
and recover a lost upload acknowledgement without overwriting a source.

Remaining: autonomous Mac-off AI understanding, background cloud Gmail ingestion
and new arbitrary-PDF extraction, general approved email sending and phone push.
Mac source extraction/import/filing and background mail reasoning keep their
existing runtime. Direct phone actions do not silently change that schedule.

Verification: targeted hosted-service/calculation tests, file-reader tests,
rollback SQL tests for roles/leases/replay/files, and production build. Owner
browser sign-in testing remains separately unverified; do not bypass the blocked
browser login route. Original business records and payments are not changed by
the tests.

## Current workflows

- Today: choose the site, add contractors, enter actual hours. Finance can separately record contractor payable and client billable hours with an agreement note.
- Company: contractor directory, client/site records, effective-dated agreed rates, work history, incoming invoice metadata and client invoice drafts.
- Assistant: separate persisted conversations and a fixed composer; company-record retrieval, selected verified source text, invoice reconciliation and ABN lookup. It prepares client/site/invoice proposals and single or batch contractor registrations. A fresh-invoice request invokes the fixed Gmail importer. The model has bounded read-only company tools, not arbitrary shell, file, email-send or database access. Durable cross-chat memory is available; the first four deterministic detectors are described below.
- Check latest invoices: queued Gmail import on the Mac, all result pages, existing 14-day overlap and local originals. Self-addressed invoice mail is included. Review warnings are retained; this is not a guarantee that every unreadable attachment was extracted.
- Invoice reconciliation: exact full-name and supplier-ABN match, valid work period, effective contractor rates, payable hours, explicit GST and overlapping-source checks. A calculation match does not verify completeness of time records or confirm payment.
- Client drafts: recorded client billable hours, client-specific office rates, owner-selected dates/GST; no spreadsheet/legacy tonne rates. Review and approve freezes the source and locks work against duplicate invoicing. Repeated submissions are idempotent. Rates are entered excluding GST.
- PDF invoice and separate production summary: agreed client-billable hours with date, site and owner-assigned short name in the client summary, no monetary values or rates; actual/payable hours remain internal. No conversion from hours to physical tonnage. The existing PDF font currently supports English/ASCII names; an unsupported name stops export instead of corrupting it.
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

The scoped Mac mail worker runs each minute while awake and online. The resident coordinator schedules this worker; use `scripts/install_office_runtime.py <invoice-assistant-folder>` for the current scheduling setup. Legacy interval installers refuse to create competing timers. The owner then runs `ENABLE_GMAIL_SEND.command` in the assistant folder and grants Gmail read/send access to the correct work account. Existing login is preserved until verification succeeds; tokens stay in macOS Application Support, outside Git. Read-only Gmail imports preserve granted scopes.

Generated client invoice PDFs are stored privately with the frozen preview. Original subcontractor files stay on Mac. Approved outgoing files and MIME messages are saved under `Client_Invoices/<client>/<invoice>/Prepared`, with confirmed deliveries copied to `Sent`. Phone approvals wait for the Mac if offline.

A durable local journal is written before the sole Gmail send attempt. Gmail confirmation is recorded separately from queuing. An ambiguous timeout or crash becomes **unknown**, never an automatic resend; inspect Gmail Sent and resolve delivery before a replacement. Queued messages can be cancelled before sending starts. Queued, sent or uncertain mail blocks invoice cancellation. Sent invoice credits/correction handling needs owner review; it is not automated.

Validation uses synthetic PDF/message fixtures and a mocked Gmail sender; no customer email is sent by tests. Live sending requires the owner consent step and a real reviewed invoice.

## Company memory and work registry — 27 September 2026

Stage 1 is implemented: Company → Company memory and Work inbox persist confirmed decisions and unfinished work independently of chat conversations. Finance admins can create/review records and inspect their version history. Every nonterminal work record requires a next action or waiting reason; closing requires an outcome/evidence note. Closure is owner-recorded, not independent proof of an external action.

New assistant requests include a task-time snapshot of company memory and work items. Read-only retrieval tools can search and read them, and the assistant can prepare one memory/work proposal for owner confirmation. A new chat preserves access to these records. Superseded/future agreements must not be applied; agreed rates remain in Agreed rates. Saving a standing rule does not activate execution authority.

Stable action IDs, transactional change events and optimistic versions prevent duplicate saves and stale overwrites. Completed assistant proposals remain proposals until applied_id is recorded. No email, bank transfer or invoice payment state is changed by saving these records. Hosted records remain accessible with the Mac off; model reasoning and local-source access still wait for the Mac. The four detectors below are implemented. General correspondence follow-up and a standing-rule executor are not yet enabled.

Verification: rollback database checks for replay, history, stale edits and closure evidence; anonymous/direct-write denial; six worker tests; phone/desktop synthetic UI checks; actual local Codex retrieval of memory and unfinished work from a new conversation; production build. No synthetic business records retained.

## Mobile navigation — 27 September 2026

Owner-approved layout: Today is the default landing screen. Finance users have Today, Sites, Assistant, Money and Company in the bottom navigation; operational users retain only their permitted operational sections. Today links directly to contact reviews, contractor payments, client invoice review and Work inbox, and lists active sites (not a claimed schedule). Sites holds daily entry, work history and site management. Money holds contractor invoice/payment records, client invoices and agreed rates. Company holds contacts, clients/access, work and memory. Assistant links route to these destinations.

Daily-entry state remains mounted across tab changes, preserving unsaved hours. Existing invoice/history entry links still select their corresponding screen. No payment, approval, database, source-file or email policy changes are included. Documents/global search/contextual AI are not added by this navigation release.

Verified with phone and desktop synthetic browser flows: five tabs, source-to-destination links, contact reviews, client/contractor invoice separation and unsaved work retention. Production build required before release.

## Cloud transition — 27 September 2026

See CLOUD_EXECUTION.md. Read-only hosted AI/Gmail execution is implemented behind explicit environment activation and separate Google web OAuth consent. Local API credentials were not present during preparation, and live providers have not been validated. The default remains Mac execution. Cloud register ingestion, local catch-up for newly discovered cloud invoices, general unattended cloud monitoring and cloud sending remain next stages. Do not report them as completed.

## Direct Paid and payment-day work summary — 27 September 2026

Money → Contractor invoices defaults to Payment period. Payday follows the owner's fortnightly Friday cycle anchored on 25 September 2026. Two complete Monday–Sunday work weeks end five days before payday (7–20 September for 25 September). This is a planning filter, never evidence of payment. All dates / one-off work remains available, including unknown periods. Late invoices are grouped by work period rather than arrival date.

Work summary shows each person’s recorded dates, client/site, actual hours and contractor-payable hours without money or rates. It includes recorded workers even when no matching invoice exists. It identifies unloaded periods and missing records; it does not fabricate hours, assign an ambiguous supplier or certify attendance completeness.

Owner refinement: Review and Paid are separate controls. Review only opens source/time/rate details and does not change approval or payment state. Paid itself is the owner's approval and transfer confirmation using the visible editable amount and actual date. No prior Review click or typed explanation is required, including when calculation information is missing or differs. Add comments and the bank reference are optional and saved with the payment. Invalid ABNs, duplicates and noninvoice/zero documents remain blocked for source correction. This manual approval never asserts that reconciliation matched or official ABN ownership was verified.

The payment server reloads source and payment history; Review displays calculations against loaded work records. An atomic authenticated finance-only RPC records the required approval audit event and payment together, retaining Mac compatibility. Stable IDs, source digest, expected balance and existing amount/date checks guard retries, stale tabs and overpayments. Review precedes payment in Mac sync order. Payment state is online immediately; original/Paid file verification remains a later Mac receipt.

Verified: 22 calculation/payment/payrun unit tests, rendered payment-control checks, rollback database checks for atomic failure, retries, source/balance changes, split payments and denied roles; production build. No real payment was made or marked by verification. Authenticated owner-screen visual validation is separate.

Hybrid operation remains the current default: hosted record editing/payment recording/summary uses no AI API; Mac Codex handles Bobby and Gmail imports while awake. Cloud AI stays inactive. Independent hosted Gmail collection and catch-up for cloud-discovered invoices are not activated by this payment release.

Payment-list refinement (27 September 2026): To pay is the default; Paid invoices is a separate section. The action is Mark as paid; acknowledged full payments immediately leave To pay and display a green, disabled Paid ✓ control. Partial payments remain in To pay with their remaining balance. Pending response receipts are merged by event ID until fresh server/Mac data arrives, so a delayed refresh cannot reopen the full-payment action or count it twice. Optional Review/comments and source/role/date/balance checks are unchanged.


## Resident runtime and first proactive checks — 27 September 2026

The three short interval launch agents are replaced by one resident `net.stillpartners.office-runtime` coordinator. It starts the existing scoped assistant, approved-mail and sync workers 30/60/300 seconds after the preceding run finishes. An in-flight job is never overlapped or force-restarted; other jobs continue when one fails. Wall-clock catch-up runs once after sleep, without a backlog storm. Existing locks, task leases, mail journals and payment event IDs remain authoritative. `Reports/office_runtime_status.json` records the coordinator heartbeat and process outcomes; business outcomes remain in each worker's report.

The Mac's GUI launch domain was deferring interval spawns while awake. Installation explicitly starts the resident job. A login launch agent and KeepAlive are configured, but OS-level deferral, logout, restart and lost connectivity can still interrupt work; check heartbeat/worker reports rather than promising uninterrupted execution. The installer preserves old scripts/plists and refuses to interrupt running jobs. Weekly Gmail import is unchanged. Do not reinstall legacy timers alongside the coordinator.

Company → Work inbox now has Check now and Pause/Resume checks. While enabled, the database checks saved records after authenticated Mac health publication and when a finance admin opens/checks the Work inbox. It runs on the server using current saved metadata even when opened from a phone with the Mac off. There is no independent cron or live general-Gmail search.

Current rules:
- Source warnings, missing work period or unlinked supplier on active imported invoices. Historical source-matched closures and fully paid invoices are excluded.
- Missing effective contractor/client rates on positive recorded work from the configured new-work date. Production starts 28 September 2026; historical attendance is not re-audited. Contractor base/client exceptions remain distinct from client billing rates.
- Blocked Mac filing receipts, explicitly without repeating payment.
- Unknown/blocked/failed approved client invoice mail delivery. Unknown delivery is never resent by this detector.

Stable issue keys and evidence hashes prevent repeated polling from creating duplicate cases/history. Source changes update the same case. Automatic resolution closes only untouched cases; owner notes, next actions and edited follow-ups survive. An unchanged closed case stays closed; material new evidence reopens it. Case history distinguishes automatic observations. A cleared condition does not claim that Bobby made a payment, sent mail, verified attendance or completed another external action.

These are the first four checks, not full automatic invoice/time matching, missing-attendance detection, all-company email ingestion, overdue client debt collection or document-expiry tracking. Those require complete source coverage and explicit expectations/standing rules. Today also flags stale Mac sync after 15 minutes; a fresh sync still does not prove fresh Gmail coverage.

## Clear inbox actions and touch feedback — 28 September 2026

Work inbox and assistant messages have separate tinted cards with a coloured status edge and visible status text. Review / edit brings the editor into view and focuses it. Existing active work items offer **Approve & close** and **Dismiss** directly on the card and in the editor without a typed comment. These actions record the owner's inbox decision, preserve source references and history, and use the existing finance-only, version-checked, idempotent save. They do not verify an external business outcome or change invoice/payment/source records. Optional outcome notes are retained. Dismissed records can be reopened through Including history → Review / edit.

Invoice payment sections show the current selection. Selecting a section, including the already-active To pay section, focuses and scrolls to its list heading and explains how to open supplier invoices. To pay/Paid counts keep the same period scope when Historical archive is selected. The selected list continues to respect search and document filters.

Contractor creation and company-record proposals use prominent buttons and Saving feedback. Inbox mutations surface a persistent result or error message; failed requests keep their record and retry identity. Refresh and history controls display their progress. No database migration is required.

Validation: 17 targeted work-review/payment/rendering tests and production build. Browser interaction/visual QA was blocked by the local-preview browser permission, so authenticated iPhone visual verification remains outstanding.

## Bobby evidence, office brief and short names — 28 September 2026

This release uses existing Mac Codex execution and hosted deterministic controls. It activates no paid AI API or subscription.

- Today → Office brief compares active imported invoices with loaded work, effective rates and explicit GST. Paid and historically settled sources stay excluded. It shows unreserved client work that can become a reviewed invoice draft, open matters and approaching document dates. Coverage is the displayed work range and saved invoice snapshot; this is not attendance-completeness certification or live Gmail.
- Company → Documents stores source links/location references, entity, document type, owner-confirmed expiry and version history. Originals remain at their source. Confirmed expiry creates one deduplicated work case at 30/14/7 days or expired, respecting Pause checks and owner-edited cases. Checks run on the existing Mac health publication and Work inbox check, not an independent cloud schedule. No documents are silently uploaded or classified by this release.
- Company → Contractors → Short names stores one client-facing name and other aliases per contractor. Explicit Bobby name requests prepare all resolved names for one Save all short names action. Names are available across chats; collisions, stale edits and replayed requests are checked. Legal names/ABNs stay authoritative for invoice identity.
- New client drafts freeze the saved short names. A missing name stops preparation; the summary never falls back to a legal full name. The amount-free summary has only Date / Job site / Contractor / Hours. Hours are agreed client-billable hours. The branded invoice groups frozen client work by site and rate with billing units, GST and total; billing tonnes do not represent measured physical production. Old frozen invoices are not renamed. The owner still reviews the calculated draft and exact outgoing message.
- Mac Bobby can search general company Gmail, read bodies and selected PDF, image, text, CSV and XLSX attachments with bounded extraction. Search pagination and unreadable sources are explicit. This is read-only evidence, separate from invoice import. Bobby can write a reply proposal with recipient, subject and source/attachment references; general reply attachment/sending is not implemented. Existing approved client invoice sending is unchanged.
- Work Gmail is a manual no-AI phone control to search/read messages and download original attachments while the Mac is off. It requires the separate hosted Google web OAuth configuration and owner consent. Its presence is not proof that a mailbox is connected. It does not import cloud invoices or enable cloud Bobby reasoning.
- The encrypted authenticated Mac backup allowlist includes document and nickname records/history. It does not add an off-device backup.

Validation: full JavaScript unit suite and targeted Python evidence/worker suites, production build, rendered synthetic invoice and multi-page summary, and transaction-rollback database checks covering finance access, stale versions, idempotency, expiry deduplication/renewal, alias collisions, frozen names and no financial mutations. Authenticated phone-screen and hosted OAuth provider checks require a connected owner session; do not claim those were performed from static tests.

## New-mail duty and continuous invoice review — 29 September 2026

- `office_mail_monitor.py` is a fourth job in the existing Mac resident runtime.
  It discovers new company-mail IDs every five minutes with Gmail history,
  retrieves every history/list page and retains a durable queue. An expired
  history cursor falls back to a dated search with overlap. The initial boundary
  is activation time, so this does not reopen all historical settled invoices.
- Incoming and self-addressed mail are handled; drafts and exclusively outgoing
  messages are skipped as new incoming work. Thread reading includes Sent.
- One bounded Bobby preparation per job uses the same Codex login, company
  retrieval, Gmail attachment and deterministic invoice-check tools as chat.
  Background reasoning shares the owner-chat lock. Failed messages keep their
  queue position/evidence and get bounded backoff while other mail can continue.
- Prepared results are cached before publication. The scoped device publisher
  creates/updates one Work inbox case per thread, deduplicates message IDs,
  rejects revoked/mismatched devices and respects Pause checks. Later evidence
  preserves owner edits; older observations cannot overwrite newer case evidence.
  Informational mail is recorded without generating a work alert. No work item
  is closed merely because a later email was classified as information.
- The app shows a persistent prepared-mail banner and a live-check timestamp,
  pending count and Mac/error state in Work inbox. The banner refreshes once a
  minute while the app is visible. This is **in-app notification only**; locked-
  phone push permission/subscription/delivery has not been implemented here.
- `refresh_invoice_register` now returns newly processed source IDs, refreshes
  the same model's register and company context, and lets Bobby continue reading
  and checking instead of ending with import counts. Work-date agreed rates,
  distinct actual/payable/billable hours, source flags and payment evidence remain
  separate. A reversed payment in an older snapshot is explicitly unresolved.
- A successful preparation is neither a sent email nor a Gmail draft. General
  sending still needs its exact-message approval/executor. No paid cloud AI,
  bank transfer, automatic Paid status or new hosting plan is activated.
- Verification: 47 selected Python checks (including the installed Mac Python),
  seven reconciliation tests, TypeScript and production build passed. Six SQL
  tests ran in a rolled-back transaction: device authentication, replay, priority,
  owner-edit preservation, older-message ordering, pause, information-only
  handling and no financial-event changes. Private mail ledger tables deliberately
  deny direct client access. Existing unrelated database-advisor warnings remain.

## Site plans and missing hours — 29 September 2026

Today → **Plan tomorrow’s sites**, or Sites → **Site plans**. Select date, site,
participants and the editable reminder time (default 17:00 Perth), then Save plan.
Site addresses reuse the existing site directory. Add/manage a location there if
needed. Full names/short names are searchable; a person cannot be planned twice
at different sites on the same date. Remove and save the old participation before
moving them; no original actual hours are deleted. Uncheck someone who did not
attend; history is retained. Stale edits stop for reload; retries use the same ID.

Enter hours opens existing daily work for that site/date. Planned people appear
with blank hours; recorded rows keep their actual hours. The existing actual,
contractor-payable and client-billable distinctions and locks stay unchanged.
At/after the reminder time, one grouped Work inbox case lists missing people.
Saving hours/cancelling participation clears an untouched case; owner-edited
case notes are preserved. Manual terminal decisions suppress the unchanged alert;
new missing evidence may reopen it. A source at another site never silently
satisfies the plan. No entry is not zero hours.

One `office-site-plan-reminders` database cron checks every five minutes, honours
the existing monitor pause, and needs neither Mac nor paid AI. A visible app
refresh checks current gaps every minute while open. Phone push notifications
are not enabled. The cron persists reminders while the app is closed, but that
is not proof that a locked phone received them. Status/error timestamps are
returned by the shared plan service.

Bobby direct tools **Site plans** / **Missing hours**, `/plans`, `/missing_hours`,
`маргаашийн төлөвлөгөөг харуул` and `цаг нь дутуу хүмүүсийг харуул` use the same
records. Plans default to tomorrow unless dates are selected. Model context/tools
include `plannedWork`; creation/editing uses the shared operational planner, not
an unimplemented free-text mutation. No existing legacy assignments or historical
invoice periods have been turned into expectations.

Verification: rollback synthetic database scenarios for dates, exact site,
missing/zero, replay, conflicts, role denial, cancel/pause/catch-up; targeted
TypeScript and Mac evidence tests; production build. Owner-authenticated phone
visual verification and locked-phone delivery remain separate/unverified.


## Daily workflow simplification — 4 October 2026

Owner priority is practical phone use: one date, grouped sites, people and hours
on the same screen. Daily is now the landing tab; Today/Tomorrow and date selection
reuse the existing site-plan and work-record services. Select sites, add multiple
people inline, enter hours in their rows, or apply hours to a site's unlocked rows.
People already planned/recorded/locally selected on that day are hidden from other
pickers. Existing historical multi-site work is preserved, not merged or erased.
Future participation has blank hours; actuals are only entered on/past the work day.
Payable/client hours and notes remain in row Details; locks and original timestamps
are retained. One Save day reports partial failures and keeps their drafts. The
hours batch uses one browser call, four bounded concurrent guarded row operations,
and one cache invalidation per destination. This is not an all-or-nothing day
transaction: each original guarded work RPC remains atomic. Site plans retain
version checks and stable retry IDs. No invoice/payment/source record is migrated.

The board fetches the selected day without reloading a history range. Unsaved
hours reuse existing viewer-scoped device recovery; unsaved people selections
remain in the mounted screen and warn before date changes/unload. The older
separate plan/work editors are no longer in the navigation. Existing overview,
finance, history, documents, contacts and Bobby remain reachable.

This is the first simplified daily workflow, not a completed app-wide redesign.
Atomic move between sites, lazy finance-page loading and Bobby's general Mac-only
reasoning remain separate unfinished work. No paid cloud model has been enabled.
Production build and synthetic tests are required before release; owner-phone
acceptance and real-network speed are not established by these tests.
