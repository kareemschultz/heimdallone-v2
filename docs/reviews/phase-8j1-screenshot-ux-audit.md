# Phase 8J.1 Screenshot UX Audit

**Date:** 2026-05-28
**Auditor:** Claude Opus 4.7
**Screenshot batch:** `screenshots/01-payroll-overview.png` through `screenshots/29-public-pricing.png` (29 PNGs)
**App build:** local dev — web `http://localhost:3002` + API `http://localhost:3000`, seeded Atlas Shipping tenant
**Login context:** `owner@atlas-shipping.com` (Maya Persaud) — see Finding #1, the seeded "owner" role does not match the role strings the UI checks for, so several screenshots were effectively captured with employee-level permissions.

## How to read this report

This is a **read-only audit**. No UI changes have been made. The recommendation at the end is a decision the user should make (small Phase 8J.2 polish pass vs. proceed directly to Phase 9). Until that decision lands, the codebase stays at commit `8b345fb`.

---

## TL;DR

- **One blocker found** (owner role string mismatch) that prevents the org owner from running payroll or managing payment exports against their own tenant.
- **One inconsistency** (status enum visible in filter pills) that contradicts the status legend introduced earlier in 8J.1.
- **One pattern gap** (skeletons-on-empty instead of an empty state) that affects at least 5 modules.
- Everything else is medium-or-smaller polish: a duplicated "Coming soon" template across 11 modules, an unexplained `HR sync · 14:42` topbar chip, dense leave/dashboard layouts, and sidebar inconsistency that's downstream of Finding #1.
- **Recommended next step:** small Phase 8J.2 polish pass (estimate: half a day) to fix Findings #1–#4, then proceed to Phase 9.

---

## Top 10 visual / UX issues

### 1. **BLOCKER — Owner role string mismatch (`tenant_owner` vs `owner`)**

**Severity:** Critical
**Evidence:** `screenshots/02-payroll-run.png`, `screenshots/09-payroll-payments.png` — both show "You don't have permission to …" while logged in as `owner@atlas-shipping.com`. The bottom-left avatar in `screenshots/06-payroll-pay-items.png` confirms the active membership reads as `employee · Atlas`, even though the login was the owner account.

**What's wrong:** Every payroll page (and the PayrollTabs role gate) uses:
```ts
const PAYROLL_ROLES = ["tenant_owner", "tenant_admin", "hr_admin", "payroll_admin"];
```
…but the Better Auth Organization plugin seeded role for the owner is simply `"owner"`. The check `PAYROLL_ROLES.includes(org.memberRole)` returns `false`, so:
- Run Payroll → "You don't have permission to run payroll."
- Payments → "You don't have permission to manage payment exports."
- PayrollTabs hides `adminOnly` tabs (Run, Reports, Settings, Pay Items, Loans, Reimbursements, Payments) for the owner.

**Likely fix:** Either rename the seeded role to `tenant_owner` (and `tenant_admin`) in the seed + permissions mapping, OR update `PAYROLL_ROLES` to use the Better Auth defaults (`owner`, `admin`, plus the project-specific `hr_admin`, `payroll_admin`). I lean toward the latter — Better Auth's `owner` / `admin` are conventional and changing them creates friction in every future module.

**Affected files (likely):**
- `apps/web/src/routes/app/payroll/{index,run,payslips/*,reports,settings,pay-items,loans,reimbursements,payments}.tsx`
- `apps/web/src/features/payroll/payroll-tabs.tsx`
- `packages/auth/src/permissions.ts` (canonical source)
- `scripts/seed-dev.ts` (if renaming the seeded role)

### 2. Status enum still visible in payslips filter pills

**Severity:** High
**Evidence:** `screenshots/03-payroll-payslips.png` — the inline legend introduced in 8J.1 says "Preview / Finalized / Paid" but the segmented filter pills directly below say "All / Draft / Confirmed / Paid".

**What's wrong:** The friendly-status mapping was applied to the badge text (`payslipStatusLabel()`) but not to the filter pill labels — they still show `f.charAt(0).toUpperCase() + f.slice(1)` against the raw enum value. The user sees "Draft" in the picker and "Preview" in the table, which breaks the mental model 8J.1 was meant to establish.

**Likely fix:** Inside `payslips/index.tsx`, render the segmented buttons using `payslipStatusLabel(f)` rather than capitalising the raw enum. Same pattern probably applies to the contracts filter ("Draft / Active / Expiring Soon / Terminated" — see `screenshots/14-app-contracts.png`).

### 3. Skeleton-on-empty masquerading as loading

**Severity:** High
**Evidence:** `screenshots/06-payroll-pay-items.png`, `screenshots/07-payroll-loans.png`, `screenshots/11-app-employees.png`, `screenshots/12-app-attendance.png`, `screenshots/14-app-contracts.png` — all show rows of grey placeholder bars that look like loading skeletons but are actually the rendered empty state.

**What's wrong:** When the API returns `[]`, the table still renders skeleton rows instead of switching to a friendly empty state. The user can't tell whether the page is loading forever, the data is genuinely empty, or their role hides everything.

**Likely fix:** Standardise an `<EmptyState />` primitive (already referenced in the shared-ui-primitives plan, currently unbuilt) — icon, single-sentence headline, optional sub-line, optional CTA. Tables only show skeletons during the actual `isLoading` window; once `isLoading === false && rows.length === 0` switch to the empty state.

### 4. Sidebar nav changes between pages for the same user

**Severity:** Medium-High (downstream of Finding #1)
**Evidence:** Compare the sidebar in `screenshots/01-payroll-overview.png` (Overview / Employees / Attendance / Leave / Payroll / Contracts / Countries & Tax / Compliance / Documents / Clients / Settings) with `screenshots/06-payroll-pay-items.png` (Overview / Leave / Contracts / Documents / Settings) — same user, same tenant, two pages.

**What's wrong:** Maya Persaud appears to have two memberships in Atlas Shipping (owner + employee), and the active membership is resolving differently per route. On admin-gated routes that bail early with "no permission", the layout falls back to the employee membership. This is a coherence bug — once you're at a URL, your role should not change because you navigated to a route that demands a stricter check.

**Likely fix:** Falls out of Finding #1. Once the owner role gate works, the sidebar will resolve consistently from the same membership. If the dual-membership issue persists, the org switcher should pin the active membership at login.

### 5. Eleven modules share an identical "Coming soon" template

**Severity:** Medium
**Evidence:** `screenshots/16-app-recruitment.png`, `screenshots/17-app-performance.png`, `screenshots/18-app-assets.png`, `screenshots/19-app-helpdesk.png`, `screenshots/20-app-compliance.png` (compliance IS built — false placeholder), `screenshots/21-app-biometrics.png`, `screenshots/22-app-geofencing.png`, `screenshots/23-app-documents.png`, `screenshots/24-app-clients.png`, `screenshots/25-app-countries.png`, `screenshots/26-app-onboarding.png`, `screenshots/27-app-offboarding.png`.

**What's wrong:** All 11+ "Coming soon" pages render the exact same card: amber eyebrow + module title + one-line description. Stacked screenshots feel like the app is mostly empty. Compliance and Countries & Tax in particular are NOT empty — they have real implementations or data — but the routes still show the placeholder, which suggests a routing/lazy-load issue or a stale stub.

**Likely fix:**
- Audit which modules are *actually* placeholder vs. wired up. Compliance has real data (audit ledger, evidence completeness) — see `screenshots/20-app-compliance.png` lower half is non-empty. Why does the same screenshot also show "Coming soon" card? Probably a layout overlay bug — verify.
- For genuinely planned modules: add an ETA chip ("Phase 9 — Recruitment", "Phase 11 — Biometric + Geofencing") so the user can see the roadmap, not just a vague promise.
- Optional: rotate a single illustration through the placeholder so screenshots don't all look identical.

### 6. "HR sync · 14:42" topbar chip is undocumented

**Severity:** Medium
**Evidence:** All app screenshots have a green-dot chip in the topbar reading "HR sync · 14:42".

**What's wrong:** No tooltip, no link, no surrounding context. Is this last-sync time? Next-sync time? A demo string? It looks important (green dot reads as "healthy") but communicates nothing.

**Likely fix:** Either remove it until there's a real HR-sync feature, OR add a tooltip + popover with "Last sync 14:42 GYT · running every 5 min · click for details" and a link to a sync log / settings page.

### 7. App overview is dense; "Compliance score 98" lacks units

**Severity:** Medium
**Evidence:** `screenshots/10-app-overview.png`. Big numbers at top: `1,284 / 1,196 / 12 / 98`. The fourth tile reads "Compliance score 98" — no `/100`, no trend, no breakdown link. Lower sections (Payroll cycles, Compliance & risk feed, Approval queue, Attendance pulse heatmap, Headcount trend, Total payroll cost) are excellent but compete for first attention.

**What's wrong:** Hierarchy needs work. The four big numbers should be the headline, but they're not equally important — Compliance score in particular needs a `/100` and a colour cue. The lower grid is densely informative; it'd benefit from progressive disclosure (collapse one or two sections by default).

**Likely fix:** Quick win — add `/100` (or `%`) to the Compliance score. Medium effort — make the headline tiles clickable and lead to a drill-down.

### 8. Leave page balance grid is too dense

**Severity:** Medium
**Evidence:** `screenshots/13-app-leave.png`. ~16 balance cards in a 4×4 grid, each a different leave-type × employee combination. Combined with the requests table below and the "Upcoming approved leave" section, the page is information-rich but visually noisy.

**What's wrong:** Too many small cards for a glance read. Leave balances per employee per type works for HR but employees might just want their own summary.

**Likely fix:** When viewing as employee — show only "My leave balances" with a clear my-vs-org switch. When viewing as HR — keep the dense grid but group by employee (collapsible per-employee blocks) rather than a flat grid.

### 9. Settings (organization-level) starts on "Loading…" with no detected scroll

**Severity:** Low-Medium
**Evidence:** `screenshots/15-app-settings.png`. Tabs (Departments / Positions / Roles / Work Types / Employment Types / Shifts / Holidays) render but the body says "Loading…" with no progress indicator.

**What's wrong:** Could be a long-running query, but the user has no signal of progress. After about a second the user starts wondering if the network is up.

**Likely fix:** Either resolve the load fast (this should be a small query) or show a skeleton in the body instead of the bare word "Loading…".

### 10. Compliance audit ledger has a long unfiltered list

**Severity:** Low
**Evidence:** `screenshots/20-app-compliance.png` lower half — 14 audit rows of small text. The "All / Approvals / Audit / Doc / Pay / Sec" filter is collapsed and the column widths are tight.

**What's wrong:** Not blocking, just dense. Useful as an audit log but hard to scan.

**Likely fix:** Filters more prominent; consider grouping by day (`Today / Yesterday / Older this week / Earlier`).

---

## Quick wins (in this order)

1. Friendly status pill labels on Payslips (~5 min — `payslipStatusLabel(f)` in the segmented buttons).
2. `/100` suffix on Compliance score (~2 min).
3. "HR sync · 14:42" tooltip OR hide until wired up (~10 min).
4. Audit which "Coming soon" pages should actually be wired (Compliance, Countries & Tax) — drop the stub if the real page exists (~30 min).
5. Rename or alias the seeded role so `PAYROLL_ROLES` matches reality (this is Finding #1; depending on chosen approach, ~30 min to 2 hours).

## Medium improvements

1. Stand up a shared `<EmptyState />` primitive (already in the primitives plan — finally land it) and switch all five tables off skeleton-on-empty (Pay Items, Loans, Attendance, Employees, Contracts).
2. App overview tile hierarchy: clickable drill-downs, units on Compliance score, optional progressive disclosure for the lower grid.
3. Module placeholder template: add a phase chip and at least two visual variants so screenshots don't feel identical.
4. Leave page: HR-vs-employee toggle for the balance grid.

## Defer / later

1. Sidebar coherence: parked behind Finding #1; revisit only if dual-membership still resolves inconsistently after the role fix.
2. Print payslip layout polish (no negative cases in this screenshot batch; revisit when we have a real preview or a negative-net-pay row).
3. Mobile screenshots — none captured at 1440×900 viewport; take a separate mobile pass later.
4. Compliance audit ledger grouping by day.

---

## Module tab recommendations (post-Phase 8J.1)

Phase 8J.1 made module-tabs a product standard with `PayrollTabs` as the reference. After visually auditing the other modules:

| Module | Recommend tabs? | Suggested tabs |
|---|---|---|
| **Payroll** | ✅ already shipped | Overview · Run Payroll · Payslips · Reports · Settings · Pay Items · Loans · Reimbursements · Payments |
| **Attendance** | ✅ yes — next | Overview · Records · Approvals · Exceptions · Reports |
| **Leave** | ✅ yes — next | Overview · My Leave · Calendar · Requests · Balances · Types · Reports |
| **Employee Profile** | ✅ yes (when profile page exists in design) | Personal · Job · Pay · Documents · Attendance · Leave · Notes |
| **Contracts** | ✅ yes — straightforward | Active · Drafts · Expiring Soon · Terminated · Templates |
| **Compliance** | ✅ yes — currently flat | Overview · Audit ledger · Document completeness · Evidence pack · Reports |
| **Settings** (org-level) | Already tabbed inline (Departments / Positions / Roles / …) — keep as-is, no module-tabs needed |
| **Recruitment / Performance / Assets / Helpdesk / Biometrics / Geofencing / Documents / Clients / Countries / Onboarding / Offboarding** | Defer — modules still placeholders. Add tabs at module-build time. |

Pattern reminder: copy `apps/web/src/features/payroll/payroll-tabs.tsx` to `apps/web/src/features/<module>/<module>-tabs.tsx`; reuse the `.payroll-tabs` / `.payroll-tab` CSS (already shared in `apps/web/src/styles/payroll.css` — consider lifting to `module-tabs.css` once the second module ships).

---

## Screenshot repository strategy recommendation

**Current state:** 29 PNGs at `/screenshots/` in the repo root, ~3 MB total, committed in `8b345fb`. `screenshots-review/` is still gitignored.

**Recommendation:**
1. **Keep the current batch in git.** Useful baseline immediately after 8J.1 — gives other agents (and future Claude sessions) a visual ground truth without needing to rebuild locally.
2. **Move to `docs/screenshots/phase-8j1/`** in the next polish PR. The repo-root `screenshots/` is fine as a working directory but doesn't communicate provenance. A phase-namespaced subdir under `docs/screenshots/` does — and matches the existing `docs/reviews/` convention this audit just introduced.
3. **Add `docs/screenshots/README.md`** explaining: what the batches are, capture command/role used, viewport size, when to re-capture (after major UX changes or before a phase boundary).
4. **No Git LFS yet.** At ~3 MB per batch, even after several phases we'd be under ~30 MB total. LFS adds operational complexity. Re-evaluate at the 50 MB or 100-screenshot threshold.
5. **Capture script.** Add `scripts/capture-screenshots.ts` that walks a hard-coded route list, logs in via the seed creds, and writes PNGs to `docs/screenshots/<phase>/`. This makes the next batch reproducible rather than agent-mediated.

---

## Recommended next action

**Small Phase 8J.2 polish pass before Phase 9.** Justification: Finding #1 is a blocker — the owner currently cannot run payroll against their own tenant. Findings #2 and #3 are visible regressions or gaps that contradict the UX the prior commit advertised. Findings together are well under one focused day's work and leave the module in the shape its docs already claim it has.

Suggested 8J.2 scope:
- **Required:** Finding #1 (role string mismatch), #2 (status pill labels), #3 (real empty states for the 5 affected tables).
- **Should:** Finding #6 (HR sync chip — minimum tooltip or remove), #7 (`/100` on compliance score), part of #5 (drop stub for Compliance/Countries if real route exists).
- **Out of scope for 8J.2:** module-tabs in other modules (those belong with each module's "B" phase), mobile pass, employee-profile redesign.

After 8J.2 lands and the screenshot batch is re-captured under `docs/screenshots/phase-8j2/`, **Phase 9 (Recruitment + Onboarding)** is unblocked and the recommended next module per `docs/architecture/modules/implementation-sequence.md`.

---

## Appendix — full screenshot inventory

| # | File | Role context | Notes |
|---|---|---|---|
| 01 | payroll-overview | owner sidebar | Full module set visible. PayrollTabs visible. "Recommended" highlight on Run payroll. |
| 02 | payroll-run | **degraded → employee sidebar** | "You don't have permission to run payroll." Blocker for Finding #1. |
| 03 | payroll-payslips | owner sidebar | Status legend ✅. Filter pills show raw enum — Finding #2. |
| 04 | payroll-reports | owner sidebar | "What these mean" helper ✅. "Coming soon" placeholders ✅. "Needs fixing" badges ✅. |
| 05 | payroll-settings | owner sidebar | Reorder ✅ (General → Overtime → Work schedule → Country rules → Payslip numbering). |
| 06 | payroll-pay-items | **degraded → employee sidebar** | 6 filter pills visible ✅. Skeleton-on-empty — Finding #3. |
| 07 | payroll-loans | **degraded → employee sidebar** | Advances filter visible ✅. Skeleton-on-empty — Finding #3. |
| 08 | payroll-reimbursements | owner sidebar | Filter pills + helper text + status badges all clean. |
| 09 | payroll-payments | **degraded → employee sidebar** | "You don't have permission to manage payment exports." Finding #1. |
| 10 | app-overview | owner sidebar | Dense executive dashboard. Finding #7 (units on Compliance score). |
| 11 | app-employees | owner sidebar | "0 active employees" + skeleton rows — Finding #3. |
| 12 | app-attendance | **degraded → employee sidebar** | "0 records" + skeleton rows — Finding #3. |
| 13 | app-leave | owner sidebar | Dense balance grid + approval table — Finding #8. |
| 14 | app-contracts | **degraded → employee sidebar** | "0 contracts" + skeleton rows — Finding #3. Filter pills show raw enum — extension of Finding #2. |
| 15 | app-settings | owner sidebar | Tabs visible; body shows "Loading…" — Finding #9. |
| 16–27 | recruitment / performance / assets / helpdesk / compliance / biometrics / geofencing / documents / clients / countries / onboarding / offboarding | varies | "Coming soon" template — Finding #5. Compliance also has the real implementation lower down (#5 detail). |
| 28 | public-landing | logged out | Solid marketing page. "Run payroll like you run your company." messaging is consistent with module copy. |
| 29 | public-pricing | logged out | Pricing tiers (Starter $6 / Growth $14 / Enterprise / Self-hosted). Looks ready. |

---

**End of audit.** No code changed in this commit. The next decision (8J.2 polish pass vs. straight to Phase 9) is the user's.
