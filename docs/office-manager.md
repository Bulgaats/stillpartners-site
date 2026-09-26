# Office Manager

Open /office after signing in with an active admin or operations admin account.

- Daily work: choose the work date, client and location; save actual hours per contractor. Finance admins can record separately agreed contractor payable hours and client billable hours with a reason.
- Work history: load a date range and filter by contractor or client. Pay and bill estimates exclude GST and use the rate effective on the work date.
- Contractors: finance admins can maintain Full Name, Phone, Email and supplier ABN, copy contact details, and order Regular and Occasional contractors separately. Archived contacts remain in history.
- Agreed rates: enter current agreements with effective dates. A client-specific contractor agreement takes precedence over the base contractor rate. Correct an incorrect rate by voiding it with a reason and adding a replacement; history is retained.

Existing spreadsheet rates are not imported. Missing office rates display Rate needed. These estimates do not approve invoices or record payments. Automatic invoice matching and client invoice generation from the new agreed hours are a later integration step.

Operations admins can read contractor names and location names, and save actual hours. They cannot read office rates or agreed payable/billable hours. Finance actions require the admin role in both server actions and database policies.

The migrations are additive. Existing invoices, work records and the local Mac invoice assistant remain available. Apply migrations in chronological order only to an appropriately baselined database; do not replay historical migrations against an existing production database.

Validation: production build including lint/type checks, 32 unit tests, and rollback-only database checks for contact edits, ABN validation, stale work updates, immutable rate history, audit records and operations/contractor access restrictions.
