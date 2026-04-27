# Authentication architecture

Still Partners uses Supabase Auth as the identity provider and `public.profiles`
as the application role record.

## Roles

- `worker`: signs subcontractor agreement, uploads certificates, views assigned
  jobs, submits hours, receives invoices.
- `leading_hand`: sees their own profile plus assigned workers, crew jobs, and
  crew daily hours.
- `admin`: manages all scheduling, approvals, rates, invoices, payments,
  recurring expenses, and profit reporting.

## Session flow

1. Users sign in through `/login` with Supabase email/password auth or Google
   OAuth.
2. Next.js middleware refreshes Supabase cookies on every app route.
3. Server Components call `getSessionProfile()` to fetch the authenticated
   Supabase user and matching `profiles` row.
4. The dashboard is shared by all roles. UI sections are conditionally visible
   from the profile role, while database access is enforced by RLS.

## Profile creation

The migration creates `handle_new_auth_user()`, which inserts a `worker` profile
when a Supabase Auth user is created. Admins can later promote a user to
`leading_hand` or `admin` by updating `profiles.role`.

## Agreement gate

Workers have `agreement_signed_at` on `profiles` and immutable agreement records
in `subcontractor_agreements`. The UI should prevent work submission until the
agreement is signed. The database keeps all submissions attributable to the
authenticated user and supports admin review.

## Public Forms

Public website forms insert into RLS-protected tables:

- `public_subcontractor_leads`
- `public_client_leads`
- `contact_messages`

Anonymous users can insert only. Admins can read and manage submissions.

## Sensitive Data

Worker bank/payment details are stored in `worker_payment_details`, isolated
from crew-management tables. Workers can read/update their own details. Admins
can manage them. Leading Hands have no policy path to this table.

## Storage

The migration creates private buckets:

- `certificates`: worker documents and trade tickets.
- `agreements`: signed subcontractor agreement PDFs or generated copies.
- `invoices`: subcontractor and client invoices.

Storage policies map file ownership through `worker_documents`, agreement rows,
and invoice rows where possible. Admins have full storage access.
