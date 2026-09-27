# Bobby cloud execution — activation handoff

Status: implementation prepared on 27 September 2026. Activation and live provider validation are separate gates. Do not call this a fully cloud office manager.

## Owner intent and boundaries

Phone is the primary control surface. Payment entries, approvals and saved company records already persist in hosted storage while the Mac is off. Mac reconnection handles source downloads and local filing; payment status and file-sync status remain separate. Preserve originals and existing financial events. This change does not rewrite invoice import, payment or local filing.

New chat requests can use a hosted read-only AI runtime after explicit server activation. Old Mac requests retain their route. Do not replay a cloud request as a Mac request after a timeout. Mailbox access requires a separate reviewed Google web OAuth consent; no Mac credential is copied.

## Implemented

- Server Responses API runtime, current-task/company-memory retrieval, full paginated imported invoice metadata, deterministic recorded-work/rate checks, and current cloud payment events.
- Gmail read-only OAuth for the expected work account. Encrypted refresh token (AES-256-GCM, owner-bound authenticated data), server-only table access, signed-in admin + state cookie checks.
- Live Gmail search with page tokens, bodies and attachment manifests; PDF, PNG/JPEG/WebP, text/CSV content supplied transiently to the configured model. Unsupported or oversized files stay explicitly unread.
- Durable per-job executor, atomic owner-scoped cloud leases, stale-lease rejection, recovery bounds and configurable daily attempt cap. Mac exchange only claims Mac jobs.
- Connection page at /office/connections; chat displays the real executor and links to setup.
- Existing proposal/approval RPCs remain the only supported writes. Runtime has no send, pay, delete, arbitrary URL, shell or file-write tools.

## Not yet delivered

Cloud register ingestion and Mac catch-up downloads of newly cloud-discovered invoices; cloud outgoing delivery; general email/expiry issue detection; unattended cron dispatch; official ABN-holder lookup in the cloud toolset. These remain next stages, not activated capabilities. The Money / Latest invoices importer still queues a Mac job.

A submitted chat dispatches through a 300-second server route using Next after. Existing browser polling retries the dispatcher; its atomic lease prevents duplicate model jobs. If the app closes before dispatch is accepted, reopen the app to resume queued work. No always-on scheduler is installed. A process killed after a model request may require a second billed read attempt after its lease expires; no external write is performed by the runtime. Do not promise exactly-once API billing.

## Required server setup (Vercel production environment only)

Never paste secrets into a chat, repository, NEXT_PUBLIC variable, screenshot or PR.
- OPENAI_API_KEY: dedicated restricted project API key with Responses access, configured billing and owner-reviewed spend controls.
- OFFICE_CLOUD_MODEL: gpt-6-astra (owner preference; verify project access before activation).
- OFFICE_CLOUD_REASONING: xhigh.
- OFFICE_CLOUD_DAILY_REQUESTS: owner-chosen integer 1–500. This is an attempt cap, not a guaranteed AUD budget. Each request can make up to eight model calls.
- OFFICE_CLOUD_ENABLED: keep false until the live acceptance checks are ready.
- SUPABASE_SERVICE_ROLE_KEY: existing server-only database credential is required.
- OFFICE_GOOGLE_CLIENT_ID and OFFICE_GOOGLE_CLIENT_SECRET: a NEW Google OAuth Web application client, not the Mac Desktop client.
- OFFICE_TOKEN_KEY: fresh random 32 bytes encoded as 64 hex characters. Retain securely; changing it requires reconnecting cloud Gmail. Never store it beside the ciphertext in the database.

Google client authorised redirect URI:
https://www.stillpartners.net/api/office/gmail/callback

Use the existing Google Cloud project with Gmail API enabled. Workspace Internal audience where appropriate. Request gmail.readonly only. Open production /office/connections and choose Connect work Gmail while signed in to the correct Office admin and work mailbox. The page explains that email/attachment content will be processed by the cloud AI. No existing subcontractor PDFs are uploaded from the Mac by setup.

Then activate the model and redeploy, first testing a harmless saved-record question and a bounded live Gmail check. OpenAI store:false is used; this is not a promise of zero provider retention. Follow the actual provider data policy.

## Runtime bounds and honest coverage

Eight model rounds, at most 36 tool reads, 240-second loop deadline, at most three leased attempts. 30 company records per page, 50 Gmail IDs per page, explicit next-page tokens. Per-file attachment 8 MB and aggregate 12 MB per request. Body/text truncation is reported. All remaining pages and unread attachments must be reported when bounded execution cannot finish. XLS/XLSX are currently unsupported, not silently ignored.

Company work evidence covers the task's last 90 days; older invoice checks return review rather than false matches. Cloud metadata carries its snapshot export time. Owner-entered payment events are merged for the current cloud payment view. None of these checks establishes bank settlement independently.

## Verification and next gate

Synthetic unit tests exercise configuration, owner-bound encryption/tampering, pagination, self-addressed messages, attachment coverage, tool allowlist, Responses tool replay and incomplete-result rejection. Rollback SQL checks verify owner routing, no duplicate lease, stale completion rejection, recovery limits, daily cap and denied browser token/claim access. No synthetic invoices/payments or outgoing emails are retained.

Live API and Google consent cannot be verified without the owner/provider setup. Before declaring active, test with Mac off: request -> live model result -> Gmail source/attachment read -> honest source time and remaining import state. Verify auth denial and reconnect behavior. Existing Mac importer remains operational in the meantime.

## References

- https://developers.openai.com/api/docs/guides/function-calling
- https://developers.openai.com/api/docs/guides/file-inputs
- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://nextjs.org/docs/15/app/api-reference/functions/after
- https://supabase.com/docs/guides/database/postgres/row-level-security

Security advisor baseline: older auth helper / mutable search_path / password-protection findings remain outside this change. The new mailbox table deliberately has no browser RLS policy and no browser grants; service-role access is the only path. This is deny-by-default, not public token access. Advisor explanation: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

Saved-record Work inbox detection is separately implemented without cloud AI activation. Its four exact rules, triggering conditions and limitations are documented in office-manager.md. It does not make this hosted Gmail/AI runtime active.
