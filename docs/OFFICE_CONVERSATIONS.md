# Office conversations and contractor batches

The Assistant uses a viewport-bounded workspace. Message history and conversation navigation scroll independently of the composer. VisualViewport resize/offset updates keep it above a mobile keyboard. Existing tasks remain in Earlier conversations; independent new conversations carry only their own six most recent completed exchanges into model context. Company data retrieval remains available across chats.

New chats are persisted on their first request. Empty drafts do not create server records. Titles can be renamed. Older messages load in pages, and asynchronous responses are applied only to the selected conversation. Separate queued topics may wait for the Mac without a three-request UI cap. Follow-ups in the same chat wait for its current response so context is ordered.

Contractor requests can return a structured batch. Create all or individual Create record uses an authenticated server operation. Each proposal has its own durable application result, so retries do not duplicate successful records. Source IDs are checked against imported supplier name and ABN; the buyer ABN is rejected. Existing identity/contact overlaps remain review items without overwriting the directory. The existing save function validates supplier ABNs and records contact audit entries. A batch does not create rates, payments, or outgoing email.

Internal payload/time limits remain finite (100 proposals per response, 180 KB response ceiling, existing model timeout). They are resource bounds, not a one-person workflow. Oversized work must be reported as incomplete, never silently claimed complete.

Validation:
- TypeScript and production build.
- Python response-boundary tests including four proposals and invalid batches.
- Actual Mac model run returned four hypothetical proposals together without writes.
- Phone and desktop browser checks: fixed composer, 65-message pagination, independent chats, single and batch save, simulated phone keyboard.
- Hosted database rollback checks: rename/history isolation, individual + batch apply, replay produces no duplicates, buyer-ABN conflict does not block valid items, unauthorized caller is denied.
- Synthetic browser preview route removed before production build.
