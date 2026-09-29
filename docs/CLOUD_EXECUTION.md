# Bobby cloud execution — activation handoff

Status: hosted read-only AI implementation prepared on 27 September 2026; manual Work Gmail delivered on 28 September 2026. Provider configuration, owner consent and live validation remain separate gates. The current owner choice is manual hosted Gmail with paid cloud AI inactive. Do not call this a fully cloud office manager.

29 September update: the owner completed hosted Gmail connection and verified
search/message retrieval from the phone. Bobby now has a separate `direct`
executor for the same hosted Gmail reads, saved-record retrieval and deterministic
invoice comparison, independent of `OFFICE_CLOUD_ENABLED`. Office tools in the
conversation expose this path even while Mac AI waits. Selected private document
storage and scoped Mac reading are also authorised/implemented; see
office-manager.md. This update does not activate cloud AI or background cloud
email reasoning. Earlier setup notes below are historical handoff evidence.

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

## Current setup: manual Work Gmail without a paid AI API

This is the current authorised connection task. `/office/mail` provides direct search, message reading and original attachment downloads while the Mac is off after setup. It does not make Mac Bobby chat, invoice import, source filing or outgoing email run in the cloud. Existing hosting and account limits still apply; no paid plan or API is activated by this setup.

1. Sign in to the existing Vercel project and Google Cloud project using their normal authentication. Check existing production configuration by key names/presence only; never print secret values. If interactive sign-in is unavailable, save the stopping point instead of reusing browser cookies or Mac credentials.
2. In the existing Google project with Gmail API enabled, create a separate OAuth **Web application** client. Use the organisation's Internal audience where appropriate. Register this exact authorised redirect URI:

   `https://www.stillpartners.net/api/office/gmail/callback`

   The existing Desktop client and its Mac refresh token stay local. A web client cannot be constructed by renaming Desktop credentials.
3. Configure the following **production-only, server-side** values in Vercel. Keep the secret values out of chat, git, screenshots and `NEXT_PUBLIC` variables.

   | Variable | Preparation |
   |---|---|
   | `OFFICE_GOOGLE_CLIENT_ID` | The new Web application's client ID |
   | `OFFICE_GOOGLE_CLIENT_SECRET` | The new Web application's secret; store as a Secret |
   | `OFFICE_TOKEN_KEY` | Fresh random 32 bytes encoded as 64 hex characters; store as a Secret. Preserve an existing key when reconnecting rather than silently rotating it. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Verify the existing server-only database credential is configured; do not overwrite it or expose it to the browser. |

   Keep `OFFICE_CLOUD_ENABLED=false`. Do not create an OpenAI API key, add billing or enable the model for this connection. `gmailConfig()` checks the three Gmail settings; callback storage separately requires the service-role credential.
4. Redeploy production so the configuration takes effect. Open `/office/connections` as the finance admin, choose **Connect work Gmail (read only)** and complete Google's consent for the expected work mailbox. The application requests only `https://www.googleapis.com/auth/gmail.readonly`; it rejects a different mailbox or broader granted scopes. The owner completes sign-in and consent through the supported authentication flow; do not request passwords, OTPs or tokens in chat.
5. Confirm a mailbox record was saved, then use `/office/mail` to search a bounded recent range, read one message and open one supported attachment. Report the source date and any remaining pages. Repeat with the Mac unavailable to establish that this read path is independent. A configured button or successful OAuth redirect alone is not a completed live acceptance test.

The refresh token is encrypted and owner-bound before database storage. The encryption key stays in server configuration, separate from the ciphertext. Disconnecting hosted Gmail does not alter the Mac connection. Mail search/download requires no model call; general AI replies continue on the Mac under the current arrangement.

### Resume evidence, 28 September 2026

The Vercel environment-settings page required sign-in in the available browser. Google Cloud's OAuth client page returned `Site Unavailable`; its configuration was not inspected. No server variables or OAuth clients were changed, no new token was issued, and no hosted mailbox was connected. The owner deferred any required participation until morning. Continue from authentication/configuration, not by reinstalling the Office app or copying the Mac's Gmail token. The private Mac report `Reports/office_work_gmail_connection_status.json` holds the detailed resumable checkpoint.

## Optional later setup: paid cloud AI (not authorised for activation now)

Never paste secrets into a chat, repository, NEXT_PUBLIC variable, screenshot or PR.
- OPENAI_API_KEY: dedicated restricted project API key with Responses access, configured billing and owner-reviewed spend controls.
- OFFICE_CLOUD_MODEL: gpt-6-astra (owner preference; verify project access before activation).
- OFFICE_CLOUD_REASONING: xhigh.
- OFFICE_CLOUD_DAILY_REQUESTS: owner-chosen integer 1–500. This is an attempt cap, not a guaranteed AUD budget. Each request can make up to eight model calls.
- OFFICE_CLOUD_ENABLED: keep false until the live acceptance checks are ready.
- SUPABASE_SERVICE_ROLE_KEY: existing server-only database credential is required.

The separately connected hosted mailbox can supply requested email evidence to a cloud model only if this optional AI runtime is later activated. Existing source PDFs are not bulk-uploaded from the Mac by setup. Obtain separate owner approval for the provider, spend controls and activation; then test a harmless saved-record question and bounded Gmail read. OpenAI store:false is used; this is not a promise of zero provider retention. Follow the actual provider data policy.

## Runtime bounds and honest coverage

Eight model rounds, at most 36 tool reads, 240-second loop deadline, at most three leased attempts. 30 company records per page, 50 Gmail IDs per page, explicit next-page tokens. Per-file attachment 8 MB and aggregate 12 MB per request. Body/text truncation is reported. All remaining pages and unread attachments must be reported when bounded execution cannot finish. XLS/XLSX are currently unsupported, not silently ignored.

Company work evidence covers the task's last 90 days; older invoice checks return review rather than false matches. Cloud metadata carries its snapshot export time. Owner-entered payment events are merged for the current cloud payment view. None of these checks establishes bank settlement independently.

## Verification and next gate

Synthetic unit tests exercise configuration, owner-bound encryption/tampering, pagination, self-addressed messages, attachment coverage, tool allowlist, Responses tool replay and incomplete-result rejection. Rollback SQL checks verify owner routing, no duplicate lease, stale completion rejection, recovery limits, daily cap and denied browser token/claim access. No synthetic invoices/payments or outgoing emails are retained.

Live Google consent cannot be verified without owner/provider setup. For the current manual connection, verify search -> message -> original attachment from `/office/mail` with the Mac off, including source time and search coverage. Verify auth denial and reconnect behavior. Test request -> live model result only if paid cloud AI is separately authorised and activated later. Existing Mac importer remains operational in the meantime.

## References

- https://developers.openai.com/api/docs/guides/function-calling
- https://developers.openai.com/api/docs/guides/file-inputs
- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://nextjs.org/docs/15/app/api-reference/functions/after
- https://supabase.com/docs/guides/database/postgres/row-level-security

Security advisor baseline: older auth helper / mutable search_path / password-protection findings remain outside this change. The new mailbox table deliberately has no browser RLS policy and no browser grants; service-role access is the only path. This is deny-by-default, not public token access. Advisor explanation: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

Saved-record Work inbox detection is separately implemented without cloud AI activation. Its four exact rules, triggering conditions and limitations are documented in office-manager.md. It does not make this hosted Gmail/AI runtime active.
