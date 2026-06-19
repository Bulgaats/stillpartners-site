# Still Partners PWA

Mobile-first PWA for Still Partners Pty Ltd, a Perth construction subcontract
services company supporting commercial projects with reinforcement scope delivery,
project administration, and completion records.

## Stack

- Next.js 15 App Router
- TypeScript
- Tailwind CSS
- Supabase Auth, Postgres, Storage, RLS, Edge Functions

## Project structure

```text
app/
  (public)/                   Public website pages and lead forms
  (auth)/login/              Email/password login
  (dashboard)/dashboard/     Shared role-based dashboard
  actions/                   Server Actions
  api/health/                Health endpoint
  offline/                   PWA offline route
components/
  dashboard/                 Role-aware dashboard UI
  layout/                    PWA registration
lib/
  auth/                      Role and session helpers
  supabase/                  Browser and server clients
public/                      Manifest, service worker, app icon
supabase/
  migrations/                Database schema and RLS
  functions/                 Edge function scaffolds
docs/                        Architecture notes
```

## Supabase schema

The initial migration creates:

- `profiles` with `worker` and `admin` production roles. The local demo keeps a
  Daily Leading Hand view for testing, but Leading Hand is a per-job/day
  scheduling responsibility, not a permanent worker type.
- `subcontractor_applications`, `client_requests`, and `contact_messages`
  for public website form submissions. Older lead tables may still exist for
  backwards compatibility, but new production forms write to these tables.
- `worker_payment_details` for bank details isolated from crew access.
- `clients`, `sites`, `jobs`, `job_assignments`, and `leading_hand_workers`.
- `subcontractor_agreements` and `worker_documents`.
- `timesheets`/work completion entries, where `tonnes_completed` is the primary
  production output unit and `estimated_hours` is optional internal planning
  data only.
- `timesheet_correction_requests` for contractor correction workflows.
- `worker_rates`, `worker_rate_decisions`, `contract_addendums`,
  `client_rates`, `invoices`, `invoice_lines`, `payments`.
- `recurring_expenses`, `expense_entries`, and `profit_dashboard`.
- Private Storage buckets for `certificates`, `agreements`, and `invoices`.

## RLS model

- Contractors can read and update their own profile, upload their own documents,
  sign their own agreement, view assigned jobs, submit their own completed
  tonnes, and read their own invoices and contractor rates.
- A contractor selected as the Daily Leading Hand for a specific scheduled job/day
  can enter completed tonnes for that assigned crew only. They cannot read
  contractor pay rates or client charge rates.
- Admins have full operational access across scheduling, approvals, rates,
  invoices, payments, expenses, and dashboard reporting.
- Anonymous public users can insert public form leads only.

## Authentication

Supabase Auth owns identity, including email/password and Google OAuth.
`profiles` owns app roles. Middleware refreshes sessions, Server Components
load the authenticated profile, and the shared dashboard conditionally renders
modules by role. RLS remains the hard authorization boundary.

## Demo Mode

When `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing,
the app runs in Demo Mode:

- Public pages and `/login` load normally.
- `/dashboard` opens with realistic local mock data.
- A visible Demo Mode banner appears.
- The role switcher lets you test `worker`, `leading_hand`, and `admin` views.
- Demo interactions use client-side state only and reset on refresh.

Use Demo Mode to test:

- Worker: today’s job, weekly tonnes, work completion entry submit/edit, correction
  request, invoices, profile, certificates, agreement status.
- Daily Leading Hand: assigned crew today, crew tonnes entry, correction
  requests, and the explicit rates-hidden state.
- Admin: scheduling, approval queues, correction decisions, worker/client rates,
  rate change/addendum workflow, invoice generation, paid tracking, recurring
  expenses, and profit dashboard.

Worker rates are never displayed to Leading Hands. Client rates are only shown
to Admins.

## Supabase-Backed Dashboard

When Supabase env vars are present, `/dashboard` requires an authenticated
Supabase session and loads the real `profiles.role` value. The dashboard data
layer reads from Supabase tables through RLS and server actions handle writes:

- agreement signing writes `subcontractor_agreements` and updates
  `profiles.agreement_signed_at`
- certificate upload writes to the private `certificates` Storage bucket and
  creates a `certificates` row
- work completion create/update writes one logical `timesheets` row per
  job/worker/date with `tonnes_completed` as the invoice unit
- admin approval locks work completion entries with `approved_at` and `locked_at`
- correction requests write to `timesheet_correction_requests`
- scheduling creates `jobs` and `job_assignments`
- worker invoices are generated from approved locked work completion entries on
  a 7-day period and show tonnes, site, rate per tonne, total, period, and status
- client invoices are generated from approved locked work completion entries on
  a 14-day period
- invoice paid actions update payment status and paid timestamp
- recurring expenses are stored in `recurring_expenses`
- profit uses paid client invoices, paid contractor invoices, and recurring
  expenses
- invoice generation creates a basic PDF, uploads it to the private `invoices`
  Storage bucket, and stores the generated storage path on the invoice record
- contractor invoices follow `Draft -> Approved -> Submitted -> Paid`; contractors
  review and approve before downloading the PDF and confirming they sent it
  from their own email

Server actions repeat permission checks before writing. RLS remains the hard
database boundary.

### Contractor weekly PDF storage

The simplified contractor MVP invoice flow generates a weekly contractor PDF
from saved production records, uploads it to the private Supabase Storage bucket
named `invoices`, and returns a signed download URL. Production must have the
`invoices` bucket configured before contractors use Generate PDF.

See [docs/authentication-architecture.md](docs/authentication-architecture.md).

Agreement wording notes live in
[docs/subcontractor-agreement-template.md](docs/subcontractor-agreement-template.md).

## Local setup

The public pages can load without Supabase variables. Production public form
submissions, auth, storage, and the dashboard require Supabase configuration.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the app without Supabase for public-page development:

   ```bash
   npm run dev
   ```

   These routes should load without `.env.local`:

   - `/`
   - `/about`
   - `/become-subcontractor`
   - `/become-client`
   - `/contact`
   - `/login`

   `/dashboard` stays protected and shows a setup message until Supabase is
   configured.

3. Create local environment variables:

   ```bash
   cp .env.example .env.local
   ```

4. Fill these required values in `.env.local`:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

5. Fill this server-only value before using admin jobs or edge functions:

   ```bash
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
   ```

6. In Supabase, enable auth providers:

   - Email/password
   - Google OAuth

   Add `http://localhost:3000/dashboard` to the allowed redirect URLs while
   developing locally. If the dev server uses another port, add that dashboard
   URL too, for example `http://localhost:3001/dashboard`.

7. Apply the database migrations:

   ```bash
   supabase db push
   ```

   Or paste/run
   Or paste/run the SQL files in `supabase/migrations/` in filename order in
   your Supabase SQL editor.

   For the public website forms, confirm the latest migration has created:

   - `subcontractor_applications`
   - `client_requests`
   - `contact_messages`

   Anonymous users can insert into these tables through RLS, but cannot read
   submitted messages. Admin users can manage submissions after logging in.

8. Create at least one admin user:

   - Create a user in Supabase Auth.
   - Find the matching `profiles` row.
   - Set `role = 'admin'`.

   Example SQL:

   ```sql
   update public.profiles
   set role = 'admin', full_name = 'Still Partners Admin'
   where id = 'AUTH_USER_UUID_HERE';
   ```

9. Confirm Storage buckets exist and are private:

   - `certificates`
   - `agreements`
   - `invoices`

10. Run checks and tests:

   ```bash
   npm run lint
   npm run typecheck
   npm run test
   npm run build
   ```

11. Restart the dev server after changing `.env.local`:

   ```bash
   npm run dev
   ```

## Deployment Notes

For Vercel:

1. Create a Vercel project from this repo.
2. Add environment variables:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   NEXT_PUBLIC_SITE_URL
   SUPABASE_SERVICE_ROLE_KEY
   ```

3. For public website form submissions, `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` are required. Get them in Supabase from:

   ```text
   Supabase Dashboard -> Project Settings -> API
   ```

   Use:

   - `Project URL` as `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key as `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   Do not use the service role key in browser/public env variables.

4. Set `NEXT_PUBLIC_SITE_URL` to the production URL.
5. Add the production callback URL in Supabase Auth:

   ```text
   https://your-domain.example/dashboard
   ```

6. Run Supabase migrations before sending real users to the app.
7. Confirm private Storage buckets and RLS policies exist in production.

The current PDF generator is intentionally lightweight and dependency-free. It
creates a valid basic PDF suitable for MVP testing. Before launch, replace it
with a branded renderer if the business needs richer formatting, email delivery,
or accounting-system integration.

## Public Website Live Deployment

The public marketing website is ready to deploy separately from the internal
operations dashboard. Treat the public routes as live and the dashboard as
private beta until Supabase production auth, RLS, storage, invoices, email, and
legal/accounting review are completed.

Live public routes:

- `/`
- `/about`
- `/become-subcontractor`
- `/become-client`
- `/contact`

Internal beta routes:

- `/login`
- `/dashboard`

Vercel deployment steps:

1. Push the current repo to GitHub.
2. Create a Vercel project and import the repo.
3. Set the build command to `npm run build`.
4. Set the install command to `npm install`.
5. Add environment variables when Supabase is ready:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   NEXT_PUBLIC_SITE_URL=https://stillpartners.net
   SUPABASE_SERVICE_ROLE_KEY
   ```

6. For live public form submissions, configure Supabase first. Without Supabase
   env vars, public pages still load and forms redirect to a safe demo
   confirmation message instead of crashing.
7. In Vercel, add `stillpartners.net` under Project Settings -> Domains.
8. Point the domain DNS records at Vercel as instructed:
   - Apex/root domain: use Vercel's recommended A record.
   - `www`: use Vercel's recommended CNAME.
9. Set the primary domain to `stillpartners.net`.
10. After DNS is live, update `NEXT_PUBLIC_SITE_URL` to
    `https://stillpartners.net` and redeploy.
11. When turning on Supabase auth, add these callback URLs in Supabase:

   ```text
   https://stillpartners.net/dashboard
   https://www.stillpartners.net/dashboard
   ```

12. Keep public navigation pointed at the public pages. The login link is
    labelled `Internal Beta`; do not publicly promote the dashboard until the
    beta checklist is complete.

### Verify Public Form Submissions

After deploying with Supabase env vars:

1. Submit `/become-subcontractor`.
2. In Supabase, open `Table Editor -> subcontractor_applications` and confirm a
   new row appears.
3. Submit `/become-client` or the homepage Project Enquiry form.
4. Confirm a new row appears in `client_requests`.
5. Submit `/contact`.
6. Confirm a new row appears in `contact_messages`.

Each successful submit redirects to `/thanks`. If a submit fails, the form page
shows a safe public error message and logs the detailed error server-side.

## Email Provider Placeholder

Invoice email delivery is scaffolded through the Supabase Edge Function:

```text
supabase/functions/send-invoice-email
```

Set this secret before enabling real email sending:

```bash
EMAIL_PROVIDER_API_KEY=your-provider-key
```

The function is provider-neutral. Replace the placeholder block with Resend,
SendGrid, Postmark, or another transactional provider.

- Worker invoices should be emailed to Still Partners, with reply-to set to the
  worker email where possible.
- Client invoices should be emailed to `clients.billing_email`.
- Invoice records track `email_status` and `sent_at`.

## Production Checklist

- Apply all migrations in `supabase/migrations/`.
- Confirm RLS is enabled on sensitive tables.
- Confirm private Storage buckets exist: `certificates`, `agreements`,
  `invoices`.
- Create at least one admin user manually and verify public users cannot
  self-assign admin.
- Configure Email/password and Google Auth providers.
- Add local and production Auth redirect URLs.
- Configure `EMAIL_PROVIDER_API_KEY` in Supabase Edge Function secrets.
- Deploy Edge Functions.
- Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and
  `npm run test:e2e`.

## Legal And Accounting Review Checklist

Before real launch, get qualified Australian advice on:

- independent contractor agreement wording
- sham contracting risk
- ATO, GST, PAYG, and ABN treatment
- superannuation obligations
- statutory compensation insurance and public liability insurance
- site-control practices and safety obligations
- invoice GST wording and payment terms
