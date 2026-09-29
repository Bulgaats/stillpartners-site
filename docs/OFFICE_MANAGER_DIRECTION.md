# Office Manager: purpose and delivery direction

Owner-approved direction: 27 September 2026 (Australia/Perth).
This document defines the product goal and the order of further development. It is not a claim that planned capabilities are implemented or permission to bypass existing controls.

## Outcome

Office Manager helps with the company's administration as a whole. It notices necessary work, prioritises it, gathers evidence, prepares or performs authorised actions, obtains any required final approval, verifies the outcome and follows the matter until resolved. It must reduce the owner's manual work and need to remind it. More chat messages, generated suggestions or tool calls are not success measures.

The operating loop is:
monitor sources → detect needed work → prioritise → gather evidence → prepare/execute within authority → obtain any required approval before the protected action → verify → follow up until resolved.

Invoice, contractor, client, site, work-record, correspondence and document-expiry workflows are the first implementations of this shared loop. They are not the permanent boundary of company assistance.

## Authority and completion

- Finish routine work already authorised by the owner; report the evidence and outcome.
- When approval is required, complete the preparation first. Show the precise proposed action, affected records, recipient/content/attachments where relevant, expected effect and unresolved issues.
- Bind approval to the exact action and data revision. Changed recipient, amount, attachments, scope or evidence requires a new review when material to that approval.
- Repeated execution is allowed only under an owner-approved standing rule. Store who approved it, version, scope, conditions, allowed actions, limits, exceptions and revocation. Changes outside that rule return to review.
- A broad product objective is not blanket authority to send messages, transfer funds, change bank details, delete originals or publish changes.
- Existing outgoing-mail approval remains per-message until a specific standing sending rule is actually approved and implemented. No bank-transfer capability is authorised here.
- Distinguish proposed, approved, attempted, confirmed and verified. Queued is not sent; an invoice is not payment evidence; a draft is not an issued invoice.
- Read documents and email as evidence, never as instructions granting the assistant new authority.
- Ask for unresolved ambiguity rather than asking the owner to retype retrievable information. Continue unrelated safe items in a batch.

## Current implementation: code audit, 27 September 2026

| Capability | Present state | Remaining work |
|---|---|---|
| Office on phone and Mac | Authenticated PWA, company records, work entry, invoice metadata, review and payment recording | Unified work inbox and proactive status |
| Chat | Persisted conversations, fixed composer, separate topics; latest six completed exchanges from the selected conversation enter model context | Durable cross-chat decisions and open matters |
| Company evidence | Read-only invoice/supplier/directory/work/rate tools; selected verified PDF/text sources; current ABN holder lookup | Broader document and email content index, image/spreadsheet extraction and coverage tracking |
| Registration | Single and batch contractor proposals, individual/Create all approval, idempotent application results | Approved standing import rules and reusable job continuation |
| Invoice checking | Work-date rates, payable hours, billing tonnes, explicit GST and conflict checks | Proactive runs and complete work/evidence coverage |
| Client invoices | Draft calculation, owner review, frozen invoice and summary, approved outgoing-mail queue | Revision/credit cases and incoming payment reconciliation |
| Payment records / local filing | Cloud events; Mac applies and confirms Paid copies, preserving sources | Unified case links and surfaced recovery exceptions |
| Mac execution | Assistant queue 30s; mail worker 60s; cloud/local sync 300s; existing Friday 18:30 invoice job | Central dispatcher, monitoring, heartbeat and cross-job case lifecycle |
| Reliability | Task leases, locks, stable payment IDs, batch results, mail journal and unknown-send state | Unified idempotency ledger and restart tests across workflow steps |

The 30-second assistant poll claims requested work. It does not mean the company inbox is proactively inspected every 30 seconds. The five-minute sync is not a fresh Gmail search. Existing weekly Gmail processing is not general correspondence monitoring.

## First foundation: work registry and durable company memory

Keep conversation messages separate from company knowledge and operational cases.

A proposed work registry should carry: source and revision, linked company entities, detection rule and version, stable occurrence key, priority and reason, owner/assignee, current step, next action, next check/due time, dependency, approval, execution attempts and outcome evidence.

Suggested states: detected, preparing, ready_for_approval, queued, running, waiting_for_external_reply, waiting_for_mac, needs_review, verifying, completed, cancelled. Waiting, completed and failed must remain visibly different.

Company memory should preserve:
- Source-backed facts with source, observed date and confidence/verification status.
- Proposals, kept separate from decisions.
- Owner-confirmed decisions and agreements with effective dates, scope and supersession.
- Standing rules and their approval/revocation history.
- Unfinished work and pending replies with linked messages and next review dates.

Search relevant approved memory and open work across conversations. Starting New chat resets conversational context, not company decisions or unresolved work. Never promote a model suggestion or an unreviewed email assertion into an approved agreement. Contradictions produce a review item; superseded history remains available.

Use existing effective-dated agreed-rate records as authoritative, rather than duplicating rates in free-text memory. Old spreadsheet rates remain excluded. Actual, contractor-payable and client-billable hours remain separate. Billing tonnes are a billing convention, not physical-production evidence.

## Initial detectors and proposed check cadence

These cadences and rules are a proposed implementation plan, not newly activated schedules. Use existing installed workers and a single dispatcher; do not add a second competing importer or sender.

| Work type | Evidence needed | Proposed checks and creation condition | Default autonomous preparation | Approval / missing dependency |
|---|---|---|---|---|
| Overdue client invoice | Issued/sent invoice version, agreed due date, confirmed receipts and allocations, disputes | Daily, and after receipts/corrections; due date passed with verified outstanding balance | Reconcile sources, draft follow-up and link invoice | Sending approval; incoming payment completeness is not yet assured, so unknown becomes payment-review rather than a definite overdue claim |
| Missing daily work record | Expected site/day participants or an explicit expected-record rule, actual entries, submitted/approved status | Daily after agreed cutoff; an expected entry remains absent | List affected site/person/date, gather related evidence, prepare request | Owner must define expectation and cutoff; absence alone is not zero work |
| Missing contractor invoice | Complete payable work period, received invoice register, payment cycle and submission grace | After weekly/fortnightly cutoff and fresh import | Match late/revised submissions and prepare one request | Confirm submission deadline/grace; sending approval |
| Invoice discrepancy | Source/version, supplier identity, work dates, agreed rates, separate hours, explicit GST | On import/revision or relevant record/rate change | Run deterministic checks, show difference and supporting records, prepare correction | Resolve disputed data; no automatic paid status from a calculation match |
| Awaiting email reply | Incoming and Sent thread history, participants, approved response deadline or commitment | Proposed 15-minute Mac catch-up checks while awake, daily review of due follow-ups | Summarise thread, detect response, draft next step | General email index/ingestion and scoped handling rules are not yet implemented; no automatic sending |
| Approaching document expiry | Original document, extracted verified expiry, entity and renewal lead time | Daily; proposed 30/14/7-day thresholds | Gather renewal requirements and prepare a reminder/request | Confirm expiry when extraction is uncertain; approve submissions, commitments or payment |
| Approved client billing cycle | Complete work records, rate coverage, client billing period, invoiced allocations | At approved cycle cutoff and after late records | Prepare draft plus amount-free summary and flag gaps | Owner approves final invoice/message; missing rates or records block issuance |

Upsert an existing case when its source changes; do not generate a new notification for each poll. Resolve a case only when evidence satisfies its completion conditions. Reopen a completed case only for a material new revision and retain its history.

Priority uses business consequence, actual deadlines, unresolved amounts and dependency impact. Missing data has an explicit reason; do not invent severity or a financial loss estimate.

## Mac availability

Current behaviour while the Mac is off, assuming the phone is online:
- The hosted app can read saved cloud records and accept supported company changes, work entries, approvals, payment events and assistant requests.
- Server-side draft calculations can use already synchronised, complete records.
- Mac-based model reasoning, fresh Gmail import, local source reading/OCR, outgoing Gmail delivery and Mac filing wait.
- Source data can therefore be stale even though the app is reachable.
- No general autonomous cloud monitoring service has been activated.

Target design:
- A hosted dispatcher can inspect authorised cloud metadata, create/update cases and show due work independently of the Mac once implemented.
- It must display last successful source sync, coverage, device heartbeat, waiting reason and next retry. It must not claim fresh email or local-file knowledge.
- On reconnect, replay from durable source checkpoints, acquire job leases and resume the next unfinished step.
- Use an action identity derived from case, step, target and source revision. Store the planned effect and durable execution result.
- Retry safe reads/idempotent writes; reconcile uncertain external outcomes before retrying.
- Preserve the existing mail behaviour: an interrupted or ambiguous send becomes unknown and is not automatically resent. Exactly-once delivery across a network cannot simply be promised.
- Do not move Gmail credentials or original contractor PDFs to cloud storage merely to keep working while the Mac is off. Any later hosted execution change must specify its required data and authorisation first.

## Delivery order and acceptance gates

1. Work registry + durable memory + visible Work inbox.
   Gate: a confirmed agreement and unfinished task remain available in a new chat; proposals never masquerade as completed actions; every open case has a next step or explicit waiting reason.
2. Source health + dispatcher + deterministic invoice/work/expiry detectors.
   Gate: repeated scans produce one case per issue; corrected/late evidence updates it; stale or incomplete evidence is displayed; expected work is defined before missing records are claimed.
3. General company email ingestion + thread/reply tracking.
   Gate: all pages and supported attachments are accounted for, unreadable sources are listed, incoming and Sent messages are distinguished, and a reply closes only the matching follow-up.
4. Approved standing rules + preparation/execution/approval flow.
   Gate: within-scope recurring preparation completes without repeat questions; rule breaches and material changes stop at a specific prepared approval; owner can pause/revoke.
5. Recovery and operational measurement.
   Gate: Mac sleep/restart, uncertain send, changed invoice, duplicate event and partial batch tests resume without duplicate external effects or lost originals.

Stages share one case engine, rule evaluator, evidence interface, approval record and action executor. Add business workflows through these common parts rather than independent chat-only commands. Each released stage must deliver a usable outcome and report what is still unavailable.

## Success measures

Measure from actual events, not estimated marketing claims:
- Verified business cases completed, by type; exclude chat replies and duplicate attempts.
- Owner interventions and repeated reminders per completed case.
- Detection delay from source arrival/availability, and overdue open cases.
- Proportion of tasks completed under existing approved authority.
- Duplicate actions, false alerts, reopenings and unresolved uncertain outcomes.
- Source freshness and coverage, and recovery after Mac reconnection.
- Owner time saved only when measured or explicitly estimated with its basis.

A task is complete only when its intended business result is verified and recorded. Report completed, awaiting approval, waiting externally, blocked and next due separately.

Stage 1 implementation status (27 September 2026): company memory, work records, version history and cross-chat retrieval are implemented. See office-manager.md for capability and verification details. Stages 2–5 remain planned.

## Owner priority update — 27 September 2026

The phone is the primary daily control surface; the Mac is used occasionally. Owner-approved direction: cloud AI and live company email reads should work with the Mac off; hosted financial records are authoritative for phone actions; Mac reconnect later downloads missing Gmail sources and files originals/paid copies without replaying payments. Implement this cloud transition before general proactive detectors. CLOUD_EXECUTION.md distinguishes prepared code, activation gates and unfinished cloud ingestion/catch-up work.

Current owner choice: hybrid operation without activating paid cloud AI. Prioritise phone record entry, direct Paid for clean invoices, exception-only review and per-payrun work summaries. Mac reasoning/import/filing remains the current execution path; independent no-AI cloud Gmail ingestion still requires a separate enabled mailbox and implementation.

Owner interaction refinement (27 September 2026): use separate Review (view only) and Paid buttons. Pressing Paid is approval of that exact invoice and confirmation of the displayed actual transfer. Comments are optional, including for advisory reconciliation warnings. Do not require a Review click or typed resolution first, or describe the manual Paid decision as an automatic calculation match. Preserve source-integrity, balance, date, role and retry checks.

Payment-list refinement (27 September 2026): To pay is the default; Paid invoices is a separate section. The action is Mark as paid; acknowledged full payments immediately leave To pay and display a green, disabled Paid ✓ control. Partial payments remain in To pay with their remaining balance. Pending response receipts are merged by event ID until fresh server/Mac data arrives, so a delayed refresh cannot reopen the full-payment action or count it twice. Optional Review/comments and source/role/date/balance checks are unchanged.


## Delivery update — resident runtime and initial detection, 27 September 2026

Stage 1 memory/work registry is implemented. Stage 2 now includes a resident Mac dispatcher with per-job heartbeat/outcomes and four deterministic saved-record detectors: active invoice source warnings, missing agreed rates on new work, blocked local filing and uncertain/failed approved invoice-email delivery. They share one deduplicated Work inbox and preserve owner decisions/version history. See office-manager.md for exact scope and pause controls.

The new-work rate-check boundary is 28 September 2026. Historical settled accounts remain archived. Detection runs on Mac health publication and Work inbox checks; it is not a general always-on cloud email monitor. The proposed overdue/expected-record/expiry detectors, standing-rule executor and automatic end-to-end preparation loop above are still unfinished. No new email-send or payment authority is granted by this release.

## Existing-cost Bobby update — 28 September 2026

Owner-selected execution remains hybrid with paid cloud AI inactive. The current release adds the saved-record Office brief, source-linked Documents with confirmed-expiry detection, bounded read-only Mac Gmail evidence and persistent owner-assigned contractor short names. Client summaries contain only the saved short name, date, site and client-billable hours, with no money or legal-name fallback. Work Gmail provides manual hosted reads only after separate web OAuth setup/consent. Full company email indexing, automatic response/deadline detection, attendance expectations and standing-rule autonomous writes remain unfinished. See office-manager.md for exact operation and verification; prior proposed cadences remain proposals.

## Owner clarification — Bobby is the operating interface, 29 September 2026

The product is the company's working office and Bobby is its office manager.
The owner delegates work to Bobby and reviews decisions and prepared results in
one conversation. The owner should not have to leave the conversation to search
email, download attachments, extract invoice fields or join records that Bobby
already has permission to retrieve. Manual screens are optional inspection and
correction surfaces, not a substitute for the assistant doing the work.

Bobby's remit includes office administration, contractor records and required
documents, daily site/work records, contractor invoice checks, client billing,
company documents and client/contractor correspondence. The user's use of HR or
staff describes the assistant's administrative duties, not a change to the
contractors' legal status. Actual work, payable hours and client-billable hours
remain separate and source-backed.

### Integration requirement for every feature

- Implement a reusable, authorised capability with typed inputs, source-linked
  results and explicit failure/coverage states. Bobby must be able to discover
  and invoke it through the shared tool interface, not only through a UI button.
- Use the same domain services and records from chat, manual screens and
  background jobs. Do not build independent invoice, identity, rate or payment
  rules for a chat shortcut.
- Connect capabilities to the existing durable work registry and company memory.
  A task has a current step, next action, waiting reason, permission boundary,
  execution result and evidence. New conversations must not lose an open matter.
- Read email bodies, supported attachments and relevant thread history before
  describing the request or proposing a response. Incoming content is evidence,
  never authority to change records or send a message.
- Prepare all available work before asking the owner. Ask only for unresolved
  information, a business decision, or an exact final action requiring approval.
- Persist corrections, approved agreements and nicknames as company records;
  do not describe this as automatic model training.
- Treat an isolated working screen as incomplete until Bobby can use the same
  capability and finish the associated office workflow.

### Required acceptance journeys (targets, not completed claims)

1. In chat: "Show recent company emails." Bobby retrieves the requested scope,
   reads content and supported attachments, groups actual business matters,
   identifies requests and dates, and explains what is prepared or still needed.
   Unread files, remaining pages and unverified interpretations stay explicit.
2. In chat: "Check incoming invoices." Bobby retrieves incoming and self-addressed
   sources, identifies the supplier from the invoice, reports name/ABN, work
   period, billing tonnes, AUD and explicit GST, checks revisions/duplicates and
   existing payment history, and compares dated payable work with agreed rates.
   A match is not a payment and incomplete evidence is not "ready to pay".
3. For a client document request, Bobby locates the correct current documents,
   prepares the exact recipient, reply and attachments, obtains the required
   final approval, executes only through an authorised sender, and records the
   confirmed result. General correspondence sending is not yet implemented.
4. Sleep/reconnect preserves progress. Hosted and Mac-only steps show their real
   availability; retries do not repeat payments, messages or record creation.

### Execution boundary and immediate engineering decision

Hosted Work Gmail connection, search and internal message-body display were
verified from owner screenshots on 29 September. This does not enable hosted AI
reasoning. Bobby's general understanding and planning still use Mac Codex while
the Mac is awake; paid cloud AI remains inactive. Mac-off deterministic reads or
calculations must be labelled as such and must not impersonate general reasoning.

Do not replace this goal with a growing set of hard-coded phrases routed to
unconnected mini-features. On 29 September a draft PDF viewer / fixed-phrase mail
report was reconsidered before release. It was not deployed or counted as a
completed Bobby workflow. Continue by consolidating the existing mail evidence,
invoice reconciliation, document catalogue, work registry and approval services
behind Bobby's shared execution interface. General Mac-off reasoning needs a
separately authorised execution arrangement; do not activate spending to hide
this dependency.

## Standing duty clarified by owner — 29 September 2026

New company mail is Bobby's standing work, not a task requiring an owner prompt
for each poll. An owner request to check mail is an additional immediate check.
Monitor every newly received message (including self-addressed generator mail),
read the thread and relevant attachments, identify and prioritise real work,
prepare available evidence/drafts, then bring decisions and exact final approvals
to the owner. Do not generate a new alert on every repeat poll. Retain unresolved
work and catch up after the Mac reconnects. A mail search/AI failure must remain
visible and queued, never be described as a complete check.

The owner further confirmed that this proactive responsibility covers daily work
records, contractor invoice reconciliation, client invoice preparation, receipt
confirmation, payable invoices, insurance renewal and other company work. Do not
wait for a separate instruction for each obvious, already authorised preparation.
Ask for missing actual work/site facts, business decisions or final permission;
do not invent attendance, agreed rates, due dates, bank receipts or payment dates.
A client invoice becoming due is a reason to prepare a receipt-confirmation task,
not proof that it is unpaid. Sending, bank transfers and binding commitments keep
their existing exact-action approval boundaries.

Implementation status must remain explicit: the new-mail release uses the
existing Mac Codex login and the shared Work inbox/evidence tools. It does not
activate paid cloud AI. In-app notices are separate from phone push delivery;
never claim a locked-phone notification until device permission, subscription
and delivery are verified. Automatic client billing cycles and expected daily
attendance still need their agreed schedules/coverage and executors implemented.

### Owner acceptance and corrections — 29 September 2026

The owner can accept a known discrepancy, including a small hours difference,
and close a specified set of earlier review requests together. Preserve that
manual acceptance and its scope so unchanged evidence does not reopen the issue.
A calculation mismatch remains factual evidence; the decision is `owner accepted`,
not a fabricated automatic match. Accepting a review is separate from confirming
an actual bank payment. When asked, Bobby must show each selected contractor's
work by date, weekday, site and hours, then apply an unambiguous owner correction
with an audit trail of old/new values. Ambiguous person/date/site needs resolution;
retrievable details should not be asked for again. The shared work tools already
retrieve the records; conversational batch closure, exception acceptance and
audited time corrections still require their action executors to be connected.

## Urgent work while the Mac is off — owner approval, 29 September 2026

Use every existing authorised hosted read and deterministic calculation for
urgent phone work before waiting for Mac reasoning. Reuse company domain
services: clear source retrieval and numeric/date comparisons do not require a
model. Keep Bobby's conversation as the result surface and durable task record.
Complex free-text reasoning continues on the Mac; paid cloud AI remains inactive.

The owner now authorises a private hosted store for company and contractor
documents needed away from the Mac. This supersedes the earlier local-only
restriction for selected company documents. Preserve originals, source links,
file hashes and version history. Keep Gmail originals directly accessible; do
not indiscriminately upload the Mac or personal files. Storage limits must be
visible and no paid plan or spending activation is authorised.

Delivered scope and remaining gaps are recorded in office-manager.md. Showing a
file is separate from extracting or verifying its content. Deterministic invoice
comparison uses known imported source fields and current saved work/rates, not
guessed numbers from an unread incoming PDF. All approval/payment evidence rules
remain unchanged.

## Planned site participation → missing hours — 29 September 2026

Owner-approved daily flow: enter tomorrow's sites/addresses and participants,
then ask for actual hours after the work day. Site selection comes first.
A plan is an expectation, never a work entry or payment. Default reminder time
is visibly editable at 17:00 Perth per site/day; it is a product default, not
an asserted business agreement. Only new explicit plans create expectations;
legacy assignments and settled historical invoices are not imported/re-audited.

The same hosted records feed the site planner, daily-entry people, Bobby's direct
reads/model evidence and existing Work inbox. One grouped reminder lists only
people with no actual entry for that exact site/date. Explicit zero is a record;
work elsewhere requires correction of the plan, not an inferred match. Cancelling
participation retains its history and never erases actual work. Future automatic
client invoice preparation must use actual approved work, not planned people.

The database checks due plans every five minutes independently of the Mac,
respects Company → Work inbox → Pause checks, and updates one case per site/day.
Current delivery is inside the app; locked-phone push remains unconfigured.
