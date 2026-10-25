# nyumbani (working name): Kenya rental marketplace and property records

Tenants search and compare homes with full costs up front. Landlords and agents list vacancies, answer enquiries,
manage viewings and keep simple rent records with their team.

**Scope boundary:** nyumbani never collects, routes or verifies rent. Tenants pay through each property's existing
arrangements. Authorised staff check payments outside the platform, then record and confirm them here. There is no
payment processing, no bank or M-PESA connection and no automatic payment verification.

Stack: **Next.js 16 (React 19, TypeScript)**, **Supabase** (Postgres + RLS, Auth, Storage, Realtime), Tailwind CSS 4,
Zod. Runtime dependencies: `next`, `react`, `react-dom`, `@supabase/supabase-js`, `@supabase/ssr`, `zod`. That's all.

---

## 1. Architecture

```
Browser (mobile-first React UI)
  │  Server Components + Server Actions (no client-side data fetching library)
  ▼
Next.js app (one deployable)            src/app, src/components, src/lib
  │  user-scoped Supabase client (publishable key + the user's session cookie)
  ▼
Supabase
  ├─ Postgres: tables + row-level security on every table
  ├─ SECURITY DEFINER functions: the ONLY way to change financial/state records
  │    (record, submit, confirm, return, reverse, correct, allocate, invite, suspend…)
  ├─ Storage: listing-media (released only once a listing is published),
  │           private-docs (receipts; never public, path-scoped to property)
  ├─ Realtime: live message delivery (RLS-filtered)
  └─ pg_cron: daily recurring rent charges (opt-in per property)
Delivery worker   /api/jobs/deliver   (cron → durable delivery_tasks outbox → Resend email)
```

Key decisions:

| Decision | Why |
|---|---|
| Business rules live in Postgres functions (`supabase/migrations/*`) | One owner per rule. Permission checks run on **every** call, not just in hidden buttons. A suspended manager is blocked on the next request, even with a live session. |
| Append-only ledger | `allocations`, `entry_events`, `charge_adjustments`, `report_versions` cannot be updated or deleted (triggers). Corrections post linked negative allocations; confirmed entries are never deleted. |
| Balances are computed, never stored | `rent_register`, `rent_summary`, `arrears_ageing`, `tenancy_statement` compute from charges + posted allocations. The register, dashboard, exports and reports all use the same functions. |
| Idempotency | Every payment entry carries a `client_request_id` (unique); messages and viewing requests carry `client_ref`. Retries return the original result. Confirmation locks the entry row and the charges it touches (`FOR UPDATE`), so two reviewers can't both post. |
| Property-scoped authorization | `app.can(property, permission)` combines active membership, property assignment and the specific permission switch (enter payments, confirm, correct, export, view attachments, manage tenancies, manage listings). Owners and agency admins hold all of them. |
| Platform admins can't see rent records | Admin RLS covers listings, onboarding, reports and deliveries only. |
| `cacheComponents` disabled | Almost every screen is per-user, so the request-time model is simpler and safer. |
| Outbox for communications | Business actions write `notifications` (in-app, the reference record) and `delivery_tasks` in the same transaction. A worker sends email. A provider outage never blocks or undoes an action. |

### Data model (main tables)

`profiles`, `platform_admins`, `organizations` (workspaces), `memberships` (+ `membership_properties`),
`properties`, `units`, `tenants`, `tenancies` (+ `tenancy_rent_rates`), `rent_charges` (+ `charge_adjustments`),
`payment_entries`, `allocations`, `entry_events`, `attachments`, `report_versions`, `listings`, `listing_charges`,
`listing_photos`, `saved_listings`, `saved_searches`, `conversations`, `messages`, `viewings`, `listing_reports`,
`contact_events`, `audit_events`, `notifications`, `delivery_tasks`.

Separate state models are stored separately, as the handoff requires: listing publication, unit occupancy, viewing
appointment, enquiry follow-up, rent status (computed), entry status and membership status.

### Implementation phases

| Phase | Content | Status |
|---|---|---|
| 1. Foundation | Schema, RLS, workspaces, team invitations and permissions, private storage, auth | Done |
| 2. Rent records | Tenancies with opening balances, charges, manual entry, direct confirmation, caretaker submission, partial and multi-period allocation, credit, corrections | Done |
| 3. Oversight | Register, confirmation inbox (single and bulk), dashboard (by rent period and by payment date), arrears ageing, staff activity, statements, monthly reports with immutable versions, CSV exports, print-to-PDF | Done |
| 4. Marketplace | Listing wizard (6 steps, autosave, photos), admin review, search and filters with Yes/No/Unknown must-haves, listing detail with full costs, saved homes and searches, messages, viewings | Done |
| 5. Admin | Onboarding queue and checks, listing review, listing reports, delivery tasks, users, audit log | Done |
| 6. Later | See "Not built yet" below | Not started |

---

## 2. Local setup

Prerequisites: Node 20+ (24 tested), Docker Desktop running, Git.

```bash
npm install
npx supabase start          # first run downloads images; applies supabase/migrations
cp .env.example .env.local  # then paste the values printed by: npx supabase status
npm run seed:demo           # optional: fictional demo data (the blueprint's Sunrise Apartments example)
npm run dev                 # http://localhost:3200
```

Sign-in uses 6-digit **email codes**. Locally, the emails land in Mailpit at http://127.0.0.1:54324.
Demo accounts (local only, created by the seed): `felix@` (owner), `esther@` (manager, can confirm), `joseph@`
(caretaker, submits only), `ruth@` (accountant, view only), `grace@` (single-home landlord), `achieng@` (tenant),
`admin@` (platform admin), all `@nyumbani.test`.

Make someone a platform admin (local or production, using the SQL editor):

```sql
insert into public.platform_admins (user_id) select id from public.profiles where email = 'you@example.com';
insert into public.app_settings (key, value) values ('admin_alert_email', 'you@example.com')
  on conflict (key) do update set value = excluded.value;
```

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | browser + server | Public key; all access is still governed by RLS |
| `NEXT_PUBLIC_SITE_URL` | server | Base URL for invitation links |
| `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) | **server only** | Used only by the delivery worker (`src/lib/delivery.ts`). Never expose it. |
| `CRON_SECRET` | server | Bearer token required by `/api/jobs/deliver` |
| `MAILPIT_URL` | server | Local development only. When set, outbound email goes to the local Mailpit inbox instead of a provider, so nobody real is emailed. Leave empty in production. |
| `RESEND_API_KEY`, `EMAIL_FROM` | server | Outbound email when `MAILPIT_URL` is empty. `EMAIL_FROM` must be on a domain verified with Resend. Without a provider, tasks stay queued (shown as "Email is switched off") and invitations show a copyable link. |
| `GOOGLE_MAPS_API_KEY` | **server only** | Optional. Google Places API (New) suggestions in the Explore search box and the listing wizard's location step, proxied through `/api/places/*`. Without it, those fields are plain text. |
| `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` | browser | Optional. Maps Embed API key for the on-demand "approximate area" map on listings (centred on the public position, rounded to about 1 km, no pin). Restrict it to your domains and the Maps Embed API. Empty means no map. |
| `NEXT_PUBLIC_PHONE_AUTH_ENABLED` | browser | `true` only after an SMS provider is configured in Supabase Auth |

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js on port 3200 |
| `npm run typecheck`, `npm run lint` | TypeScript and ESLint |
| `npm test` | Unit tests (money, allocation preview, cost totals, search URL state, CSV safety, spreadsheet import, alerts, emails, CSP) |
| `npm run test:db` | pgTAP database tests (`supabase/tests`): permissions, rent calculations, workflows |
| `npm run test:integration` | Real-API isolation tests against the local stack (PostgREST + Storage with real sessions) |
| `npm run test:e2e` | Playwright browser tests against the local stack and demo seed (`npm run seed:demo` and `npm run build` first). Sign-in uses the real email-code flow via Mailpit. |
| `npm run db:reset` | Rebuild the local database from migrations |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` after schema changes |
| `npm run seed:demo` | Local demo data (refuses non-local URLs) |

---

## 3. Tests: what is proven

Run `npm run test:db && npm test && npm run test:integration && npm run test:e2e`. Last run: **309 + 104 + 6 + 5 passing**. The 20-improvement implementation and its verification are recorded in [docs/IMPLEMENTATION_HANDOFF.md](docs/IMPLEMENTATION_HANDOFF.md).

From the blueprint's acceptance tests:

- **Worked example**: 135,000 billed, 110,000 confirmed, 25,000 outstanding, 81.5%, occupancy 9 of 10. After the
  manager confirms KSh 10,000: 120,000, 15,000 outstanding, 88.9%, and the entry leaves the inbox.
- **Caretaker submission** stays pending and doesn't increase confirmed collections. A caretaker can't confirm, even
  their own entry.
- **Direct confirmation** in one action, recorder = confirmer, with no second owner approval required.
- **Partial then full**: 10,000 + 5,000 settles 15,000.
- **Retry / simultaneous approval**: the same request returns the original entry. A second reviewer gets "already
  confirmed by Esther W". Allocations are posted exactly once.
- **Multi-period allocation**: one payment settles two periods, the remainder is kept as identifiable credit, and
  over-allocation is rejected.
- **Corrections**: the original is kept as reversed, the replacement links to it, negative allocations are posted and
  totals stay consistent. Confirmed entries can't be edited directly.
- **Vacancy / tenant change**: vacant units are never unpaid tenants, and old arrears stay with the former tenancy.
- **Property isolation**: no access to another property's records through table reads, RPCs, a direct id or the
  private-file path (signed URL, download and list all refused). The same holds across workspaces.
- **Suspension** blocks the next request on the same session. History is retained.
- **Invitations**: an existing identity is reused (no duplicate account). Wrong-email, used and expired links are refused.
- **Managers** can't invite staff, can't raise their own permissions and can't see colleagues' access.
- **Marketplace**: fixed monthly and move-in totals, "incomplete" when a compulsory charge is unknown, Unknown never
  satisfies a must-have unless included, drafts are invisible to the public, enquiries reuse one conversation, viewing
  requests start as Requested, and marking a home let cancels open viewings.

- **Optional email**: per-category opt-out, one email per burst on a thread, admin notices not doubled.
- **Saved-search alerts**: only homes published since the last alert, never twice, only the job can run them.
- **Tenant self-view**: link accepted only by the invited email, neighbours' records and staff notes stay hidden,
  removing access hides everything again.
- **Tenant communications**: only staff with tenancy permission send, for every tenant in the send; invoices show the
  month's charges, the earlier balance and the amount due from confirmed records; tenants with no email, no charges
  that month or nothing owed are skipped with a reason; one reminder a day at most; a retry never sends twice; the
  tenant sees only their own, and only while they have online access.
- **Listing edits**: wording, contact or photo changes to a live listing are held for review; price and dates stay live.
- **Spreadsheet import**: dry runs change nothing, imports are all or nothing, every failing row is reported.

Browser tests (`tests/e2e`, run in CI): search and listing under the Content Security Policy, robots/sitemap/manifest
and share images, layouts at 200% text size, a tenant's saved-search alert arriving by email, and a landlord
importing units and sharing a tenancy that the tenant then opens, and a landlord emailing an invoice, a message
and a reminder that arrive by email and that the tenant then finds in My rent.

---

## 4. Deployment

1. **Supabase**: create a project (Pro is recommended for production backups). Link and push the schema:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
   - In Auth settings, set the Site URL and redirect URLs to your domain. **Configure production SMTP** (the built-in
     sender is for development). Paste `supabase/templates/magic_link.html` into the Magic Link and Confirm signup
     templates so emails contain the 6-digit code, and set the OTP expiry to 600 seconds.
   - Enable `pg_cron` (Database → Extensions), then run once:
     `select cron.schedule('generate-due-rent-charges', '15 0 * * *', 'select app.generate_due_charges()');`
     (the migration does this automatically when the extension is already enabled).
   - Make yourself a platform admin (SQL above).
2. **App hosting**: any Node 20+ host. Vercel works (`npm run build`); so does a self-hosted Node process (`npm run build && npm start`) on an existing EC2 or Lightsail instance behind Caddy or Nginx with TLS. Set the environment variables above.
3. **Scheduled jobs**: call `POST /api/jobs/deliver` with `Authorization: Bearer $CRON_SECRET` every 2–5 minutes
   (Vercel Cron, an external cron, or `pg_cron` + `pg_net`). Each run checks saved searches that are due (instant:
   every couple of minutes; daily: once after 07:00 Nairobi time), then sends queued email. Server actions also
   trigger a best-effort send right away when email is configured.
   Admin → Deliveries shows queue health: due, overdue (due for longer than `delivery_expected_delay_minutes`,
   default 15), stuck, failed and held. Messages older than `delivery_max_age_hours` (default 48) are held instead
   of sent automatically, so enabling a provider never replays an old backlog; an admin sends or cancels each one.
   Both settings are rows in `app_settings`.
4. **Backups**: Supabase database backups don't include Storage files. Schedule a separate copy of the
   `private-docs` and `listing-media` buckets (S3 is a good fit) and test a restore.

Operating cost at launch: Supabase Pro (from USD 25/month) plus app hosting (USD 0–20/month), with email in Resend's free tier. No other paid services are required.

---

## 5. Status: what is complete and what isn't

### Complete and working (real backend, tested)

- **Team**: invite by email (7-day expiring, single-use, hashed token), accept with your own account, role and
  property assignment, separate permission switches including "Can confirm rent records", edit access (audited),
  resend, cancel, suspend, reactivate and remove with reassignment of open work, expired invitations shown separately.
- **Rent records**: properties and units (bulk "A1-A10"), tenancies with opening arrears or credit at a cut-off,
  rent changes from an effective date, move-out, monthly charges (preview and create, or daily auto-create), charge
  adjustments with a reason, record payment (oldest-first suggestion, full-payment shortcut, multi-period allocation,
  tenant credit, duplicate warning, private receipt upload with in-browser resizing, device draft, retry-safe
  submit), confirmation inbox (confirm, return or reject with a reason, bulk confirm with a summary), entry history,
  reverse or correct, apply credit, tenant statement, evidence policy per property.
- **Oversight**: register with filters, dashboard (six KPIs, six-month chart with a table view, unit grid, arrears
  ageing with former tenants kept separate, staff activity, corrections), "By payment date" view, monthly report
  draft and finalized immutable versions with change notes, print-to-PDF, CSV (register, report version,
  statement; formula-injection safe; exports audited).
- **Marketplace**: guided 6-step listing wizard with autosave, structured costs and a live "Tenants will see"
  total, photos (camera or file, resized to a full image plus a thumbnail, labelled actual, building or sample,
  move earlier or later, cover, retry), submit for review, pause, resume, mark let and withdraw, one-tap and bulk
  "Still available". Search by area, budget (rent only or rent + fixed charges), home type, must-haves with
  "Include unconfirmed", furnishing, advertiser role, move-in date and category, with sort, pagination, a live
  count in the filter sheet and no-results recovery with real counts. Listing detail with gallery, Yes/No/Unknown
  facts, full cost breakdown, dated checks, report, call and WhatsApp handoff (logged as an attempt only) and an
  approximate location. Saved homes and searches, messages (live, offline queue, retry, no duplicates), viewing
  requests, responses, rescheduling and outcomes, enquiry inbox with follow-up stages and assignment.
- **Admin**: listing review queue with flags (possible duplicate, unconfirmed charge, sample photos), publish or
  send back with a note, onboarding (assign, record identity and authority checks, approve), listing reports,
  delivery tasks with retry, users and audit log. A registration alert is written for every new account.
- **Re-review of live edits**: changing a published listing's wording, contact details, viewing instructions or
  house rules, or adding a photo, hides it until an admin approves; the reviewer sees each changed field with its
  last approved value. Price, charges, facts and dates update straight away.
- **Notifications**: everything arrives in the app; each person chooses which categories are also emailed
  (Account → Email me about). Bursts on one thread email once while unread.
- **Saved-search alerts**: each saved search alerts instantly, daily or not at all (set in Saved), in the app and
  by email.
- **Tenant self-view**: staff with tenancy permission send a tenant a one-time link (unit page → Tenant's online
  access); the tenant sees their tenancy, balance and statement under My rent (confirmed records only, never staff
  notes). Access can be removed at any time. Several tenants can be invited at once from the Tenants page.
- **Tenant communications**: staff with tenancy permission email tenants an **invoice** for a month (charges, earlier
  balance, amount due; numbered INV-000123), a **reminder** of what is owed, or a **message** (repairs, water cuts,
  how to pay). One tenant from the unit page, or many from the property's **Tenants** page (filter by who owes, who
  has no email, who isn't online yet). Each is kept with its figures as sent and shows whether the email went; tenants
  with online access also find it in My rent with an in-app update. Staff can change a tenant's email and phone.
- **Spreadsheet import**: units and tenancies from a CSV file or cells pasted from Excel or Google Sheets (property
  page), with a template, a row-by-row check against the real rules, and an all-or-nothing import.
- **Help and support desk** with tickets and replies; **map**: approximate area map on listings and a live map with
  the tenant's own position for a confirmed viewing; distance search around a picked place.
- **Search engines and sharing**: sitemap, robots, listing share images (photo, rent, move-in total), and an
  installable web app (manifest and icons).
- **Security headers**: a per-request nonce Content Security Policy (`src/lib/csp.ts`), plus frame, referrer and
  permissions policies.

### Not built yet (no mock versions exist in the app)

- **Platform billing** (plans, promotions, M-PESA hosted checkout, invoices with email + SMS tasks): not started. The
  scope excluded payment integrations; this needs a decision before it's built.
- **SMS, WhatsApp and web push** channels: the outbox supports them, but no provider is wired, and SMS tasks are
  never created. Phone sign-in needs an SMS provider in Supabase Auth.
- **Search results map view** and a curated estate directory (search is text, area and distance around a picked place).
- Admin outreach composer, listing-report outcome emails to users.
- Excel `.xlsx` upload (the import reads CSV and pasted cells), optional expenses module, deposit refunds and
  applications, report sign-off, review holds and dispute notes on entries, server-generated PDF files (reports use
  the browser's print-to-PDF from the immutable snapshot).
- Real-device, screen-reader and performance testing (Core Web Vitals) still need to be done.

### Assumptions to confirm

- The brand name "nyumbani", the colours and the logo come from the handoff (placeholders for now).
- Email codes are the default sign-in. Phone codes are off until an SMS provider is configured.
- At least 4 photos are needed to submit a listing. The upload limit is 15 MB. Invitations expire after 7 days.
  Viewing times must be at least 1 hour ahead and within 60 days. A listing confirmed more than 10 days ago shows
  "reconfirm".
- Rent is monthly, and a charge uses the rate in effect on the period's first day. A partial first month uses an
  explicit adjustment, not automatic prorating.
- Demo photos are generated illustrations labelled "Sample photo, not this unit".
- Legal and regulatory questions (estate-agency status, data protection, eTIMS) are outside this code. See the
  business plan.
