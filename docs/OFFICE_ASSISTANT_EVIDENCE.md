# Office assistant: invoice evidence and dated billing checks

## Ready in this change

The assistant has a bounded read-only company-record MCP server. It can search saved invoices and supplier groups, read individual company records, read hash-verified PDF/TXT sources, and run the same reconciliation calculator as the Office UI. Search results include total counts, continuation cursors, unknown-date exclusions and coverage. Full invoice metadata stays on the Mac until retrieved by a task.

The owner's agreed billing convention is **10 contractor payable hours per billing tonne**. The derived tonne rate is the agreed hourly rate multiplied by 10. This is a billing convention, not measured physical production. Rates are selected on each work date, including client-specific contractor exceptions; a later increase does not reprice earlier work. GST is checked only when explicit. Differences and missing rates/records remain in review.

ABN verification reads the official current public ABN Lookup page at a fixed origin and compares the complete issuer name. A checksum is never treated as holder verification. Name conflicts, business aliases, inactive ABNs, unavailable registry responses and unknown historical GST status are surfaced. Matching a public entity name is not personal identity verification.

## Data boundary and activation

The Mac uses the owner's existing Codex login with GPT-6 Astra at xhigh effort. For an enabled company task, requested record details and extracted source text may be sent to OpenAI through Codex for processing. Original files remain on the Mac; this does not mean the extracted text stays exclusively on the Mac.

The owner explicitly approved this processing on 27 September 2026 before the live-data pilot. The read-only pilot then successfully searched real saved invoices, read source PDFs, checked official ABN holder records and ran the shared calculator. It correctly reported missing time records and unreadable source formats rather than asserting a verified total. Install and activate only the reviewed files; preserve the existing device scope and payment/email approval boundaries.

Model access is limited to the advertised read-only tools. It cannot select arbitrary file paths, run shell/SQL, change rates, send email or mark invoices paid. Existing authenticated record proposals and exact email approvals remain separate.

## Installation after consent

1. Retain the existing installed worker and calculator as a dated private backup.
2. Run npm run build:office-tools in the checked-out approved commit.
3. Install scripts/office_knowledge_tools.py and scripts/office_reconciliation.cjs beside the current Mac worker, then atomically replace office_assistant_worker.py after its current job releases the existing lock.
4. Retain the current launchd job and its configuration; no duplicate schedule or new credentials are needed.
5. Merge/deploy the corresponding Office changes and verify an actual request with tool evidence, not merely a done status.

No database migration, invoice deletion or payment-state change is required.

## Verified

- 20 TypeScript tests cover the existing calculation plus dated tonne rates, split rate periods, stale-rate prevention, client overrides, GST, quantities and flagged documents.
- 13 Python retrieval tests cover pagination, source boundaries/checksums, duplicate/revision preservation, buyer ABN rejection and unavailable/mismatching registry results.
- Existing 3 assistant-worker tests still pass.
- A real Codex run on wholly synthetic records searched, read the source, computed 600 + 650 = 1,250 AUD over a rate-change boundary, and correctly rejected an ABN holder-name mismatch.
- Production Next.js build and TypeScript checking pass. A consented live company-data pilot completed all five retrieval/check tool types without changing records, payment states or sending mail.

## Current limits

Work/rate/company context reflects the task submission time and its explicit 90-day work range. Saved invoices are searchable across the whole local register, including records with missing dates (reported separately). The tool does not silently claim a complete live Gmail search; that remains the existing explicit inbox-refresh action.

Source text extraction currently supports PDF/TXT, with a 100-page PDF ceiling. Scans and unsupported image/spreadsheet formats return an unreadable/review result rather than guessed evidence. Existing imported metadata is still searchable.

This release adds evidence retrieval and checks, not unrestricted autonomous writes, a complete company-mail knowledge base, persistent learning or automatic bulk contractor creation. Those remain separate unfinished capabilities. Existing proposals clearly remain proposals until applied.
