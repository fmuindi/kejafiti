# Implementation handoff: Developer Implementation Report v1.0 (20 improvements)

Source: *Nyumbani Developer Implementation Report, 20 improvements*, review of 20 Oct 2026. Every item was reproduced against the code before it was changed. Each change was verified with database tests (pgTAP), unit tests and Chrome runs as the demo roles. Everything below was run against the local stack (Supabase in Docker, demo seed data); no production data was touched.

**Reviewer:** each ticket is pending product-owner review.

## Status by ticket

| ID | Status | PR | Evidence | Migration / config | Remaining limitation |
|---|---|---|---|---|---|
| IMP-01 Tenant inbox | Done | #4 | Achieng's inbox lists her thread. pgTAP: no access for other tenants or by id. | `20261021000001` | — |
| IMP-02 Listing context | Done | #4 | `/homes/L-4001` links, "Felix Properties · Direct landlord" heading, thread kept after the home is let. | `20261021000001` | — |
| IMP-03 Viewing expiry | Done | #4 | The owner gets no Accept on a past request. Server refuses a minute after the time. Both sides agree. | `20261021000002` | Grace policy: none (documented). |
| IMP-04 Delivery health | Done | #4 | Overview flags overdue and held work with no failures. Due alert delivered to Mailpit. 48 h backlog held for an admin decision. pgTAP: 14. | `20261021000003`; `MAILPIT_URL` (local only); `delivery_*` settings | Production needs a scheduler calling `POST /api/jobs/deliver`. |
| IMP-05 Device drafts | Done | #4 | Another account on the same browser sees nothing. Resume/Discard. Sign-out clears. Unit: 7. | — | — |
| IMP-06 Role-aware entry | Done | #5 | Manager, caretaker, admin and tenant each land correctly. A deep link survives sign-in, and a server action's expiry returns to the form. | — | — |
| IMP-07 Performance nav | Done | #5 | One click from the sidebar or phone tab. Unit pages keep the period. | — | — |
| IMP-08 Updates | Done | #5 | Unread badge in every shell. Read only when opened. Access checked at click time. | — | Optional email/SMS/push and digests are not built (decision below). |
| IMP-09 Search return | Done | #5 | Back link restores filters, sort, radius, page and card position. | — | — |
| IMP-10 Location on results | Done | #5 | Area changed from results, other filters kept. | `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` (optional) | Map hidden until an embed key is set. |
| IMP-11 Card totals | Done | #5 | L-4001: 14,000 rent / 15,000 a month / 29,000 to move in. Nightly prices get no monthly total. | `20261021000004` | Monthly budgets compare monthly prices only. |
| IMP-12 Compare saved | Done | #6 | 2 or 3 homes compared, "Unknown" where unconfirmed, private notes, no overflow at 390 px. | `20261021000009` | — |
| IMP-13 Review links | Done | #5 | Checklist items open their step with the field focused. Submission uses the same checks. | `20261021000005` | — |
| IMP-14 Authority review | Done | #5 | Summary before Send or Save, with changes marked. | — | — |
| IMP-15 Timestamps | Done | #5 | Signed in vs last change to rent records vs records last changed. pgTAP: drafts and reads don't move it. | `20261021000006` | — |
| IMP-16 Caretaker queue | Done | #5 | "1 thing needs you", returned entry with reason. Team and My entries agree. | `20261021000007` | — |
| IMP-17 Charts | Done | #6 | KSh scale, no clipped labels, "No records yet" vs "No rent billed". 88.9% unchanged. | — | — |
| IMP-18 Report context | Done | #6 | Commentary frozen in the version. Review before finalizing. Change summary per version. | `20261021000008` | — |
| IMP-19 Help and trust | Done, except the policy wording | #6 | Support desk with private tickets and admin queue. Policy links work. Copy fixed. | `20261021000010` | **Terms and Privacy wording must come from the product owner.** |
| IMP-20 Phone and a11y | Done for automated checks and emulation | Stage E | See the release gates below. Fixed: receipt uploads were silently dropped, date fields showed no focus, and sign-in after an expired action returned to the wrong page. | — | No real Android or iOS device, screen reader or 200% text test was run (see limitations). |

## Release gates

| Gate | Result |
|---|---|
| Core trust (IMP-01 to 05) | Pass. pgTAP covers unrelated-user and retry cases. A lost response after a server save, then retry, gives one entry. |
| Financial integrity | Pass. Register, dashboard, chart table and report agree. Fixture 120,000 / 135,000 = 88.9%. |
| Communications | Pass locally. Queue age and state are explicit, email goes to Mailpit only, channel status is stated. |
| Device readiness | Pass in Chrome emulation. Production build, 27 pages × 320/360/390/430/1280 px across six roles (signed-out visitor, tenant, owner, manager, caretaker, admin): 0 horizontal overflow, 0 axe WCAG 2.1 A/AA violations, 0 Tab stops without a visible focus ring, 0 console errors. Lost connection, expired session and interrupted upload all recover. |
| Operational readiness | Migrations are additive, with rollback notes in each file. Config is listed in the README. Support ownership is the platform admins (Support queue). |

Tests at handoff: `npm run test:db` 210, `npm test` 36, `npm run test:integration` 6; typecheck and eslint clean. CI ran green on every stage PR.

## Decisions made with report defaults (please confirm)

- **Viewing requests:** no grace period. A request can be accepted only before its time.
- **Notification backlog:** messages older than 48 h are held, and an admin sends or cancels each one.
- **Device drafts:** kept 14 days. Sign-out clears the signed-out user's drafts and recent searches.
- **Staff activity:** "Last change to rent records" counts rent-record changes only; reading pages never counts.
- **Budgets:** compare monthly prices only. There is no week/night/semester conversion.
- **Currency:** KES in the marketplace and KSh in rent records, per the design handoff. No screen mixes them.
- **Phone tabs:** the owner gets Overview, Rent, Performance, Enquiries and Account. Viewings stay inside Enquiries.

## Decisions still needed from the product owner

1. **Policy wording:** the Terms of use and Privacy notice text, which the pages say is to be published.
2. **Optional notification channels:** which events (if any) should email, SMS or push, and the digest policy. Today, required notices email and everything is in the app.
3. **Support:** response-time targets.
4. **Map:** whether to enable the on-demand area map (Maps Embed API key).

## Known limitations of the verification

- **Real devices:** none tested (Android, iOS Safari). All phone checks used Chrome device emulation, and the virtual keyboard was not emulated.
- **Assistive technology:** no screen-reader pass, and no 200% browser text-size test (the app uses fixed pixel font sizes; page zoom works).
- **Load:** not tested.
- **Browser checks are not in the repo:** they were run with ad hoc Playwright scripts against the demo seed. A committed end-to-end suite (`@playwright/test`) is recommended so the cross-role matrix can rerun in CI.

## Before deploying

1. `npx supabase db push` to apply migrations `20261021000001` to `20261021000010`.
2. Production environment: leave `MAILPIT_URL` empty, set `RESEND_API_KEY` and an `EMAIL_FROM` on a domain verified with Resend, `GOOGLE_MAPS_API_KEY`, and optionally `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY`.
3. Schedule `POST /api/jobs/deliver` (Bearer `CRON_SECRET`) every 2 to 5 minutes.
4. Publish the Terms and Privacy text.
