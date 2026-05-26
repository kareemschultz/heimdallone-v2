# Old HeimdallOne Feature Map

> Source: `.references/old-heimdallone/` (cloned from github.com/kareemschultz/HeimdallOne)
> This document catalogs proprietary features from HeimdallOne v1 for rebuild/extension in v2.

---

## Payroll Engine (Crown Jewel)

### Multi-Country Tax Engines

| Country | Status | Key Statutory Rules |
|---------|--------|-------------------|
| **Guyana (GY)** | Production | PAYE (25%/35% bands), NIS (5.6% emp / 8.4% empr, GYD 280k ceiling), child allowance (GYD 10k/child), medical deduction, OT allowance (GYD 50k cap), second-job allowance |
| **Trinidad & Tobago (TT)** | Beta | PAYE, NIS equiv, Health Surcharge, gratuity rules |
| **Barbados (BB)** | Beta | PAYE, NIS equiv, Training Levy, gratuity rules |
| **Jamaica (JM)** | Beta | PAYE, NIC, Education Tax, NHT, gratuity rules |

- Rules stored as immutable versioned snapshots (`rules-2022.ts` through `rules-2026.ts` for GY)
- Per-tenant statutory rate overrides (`tenant_statutory_rules` table)
- Frozen into each payslip at finalize time — prevents retroactive rate changes

### Gross Computation

- Hourly / daily / salary classification
- Labour Act overtime multipliers (1.5x / 2x / 2x+ per jurisdiction)
- Saturday classification (Mon-Fri shops: 1.5x premium; Mon-Sat shops: regular rate)
- Auto-deducted lunch breaks (configurable threshold, optional per-day override)
- Grace periods for late arrivals / early departures

### Live Pay Accrual

- Real-time running total updated every 60 seconds
- Exact NIS calculation; projected PAYE via pace extrapolation
- Open-shift indicator (currently clocked in)
- Per-employee cards + tenant-wide totals + department drill-down

### Payroll Run Lifecycle

- Period create → compute → finalize (lock payslips, post GL entries) → export
- Recovery path if posting fails mid-finalize
- Preview re-run (show impact without mutating finalized data)
- Immutable corrections: reversal payslip + reversing journal (never delete finalized)

### Payroll Components

- Pre-tax, taxable, post-tax, non-taxable categories
- Default catalogue auto-seeded per country (11 core + country extras)
- Salary advances + loan repayments as named line items (not opaque deductions)
- Per-employee component overrides (temporary pay changes)

### Statutory Exports

- **GRA Form 5** (Guyana PAYE return) — CSV with summary + employee breakdowns
- **NIS Schedule** (Guyana) — CSV with contributions detail
- **Republic Bank EzPay** — pipe-delimited corporate payroll feed
- Idempotent exports (same period = bit-identical output via content hash)

---

## Time & Attendance

### Multi-Source Punch Collection

| Source | Details |
|--------|---------|
| **ZKTeco K40 Biometric** | Fingerprint/face on LAN, device bridge daemon (Bun + Python), per-device API key auth |
| **Software Clock-in** | Web-based `/my-clock`, optional GPS + mock-GPS detection |
| **Kiosk PIN** | Scrypt-hashed PIN, mobile + desktop |
| **Mobile GPS** | Expo app, offline queue (SQLite) with replay on sync, dual-layer mock-GPS rejection |

### Schedule Management

- Work schedules with shift windows, break deduction, OT threshold
- Per-day overrides (JSONB `day_overrides` keyed by weekday 0-6)
- Employee shift assignments + date ranges
- Shift roster overrides for specific dates
- **Resolver chain**: Roster → approved leave → public holiday → employee assignment → tenant default → fallback
- Caribbean SMB defaults (Mon-Sat 8am-6pm, auto-lunch, hard 6pm cap)

### Proprietary Algorithms

- **Logical shift date computation** — UTC punch → org-local calendar day, handles overnight shifts
- **Shift-window clipping** — enforce start/end boundaries with grace periods
- **Attendance processor** — ZKTeco K40 punches → `AttendanceSummary` with shift-window clipping
- **Missing punch detection** with compensation options
- Attendance corrections (self-service + HR-submit + HR-direct-apply paths)

---

## HR & Employee Lifecycle

### Employee Core

- CSV import/export (bulk create + update)
- Portal access invitations (auto-create login)
- **Encrypted PII at rest** (TIN, NIS, bank account) — per-tenant encryption keys
- Document expiry tracking (90/60/30/7 day alerts)
- Custody assets tracking (devices, uniforms, tools per employee)
- Org chart with department hierarchy + reporting tree

### Salary Structure Assignments (SSA)

- Valid-date ranges with overlap prevention
- Active SSA resolution (accounts for fixed-term contracts)
- Auto-versioning on each change
- Historical audit via `audit_logs` + `pay_change_requests`

### Pay Changes (Bulk Salary Management)

- Workflow: draft → approved | rejected → applied
- Bulk upload with per-row checkboxes
- Approver-cannot-approve-own rule
- Applied: close prev SSA, create new with forward-carry fields

### Leave Management

- Leave requests with calendar view (Recharts)
- Per-tenant accrual policies (monthly, annual, at-hire)
- Balance tracking with pro-rata + encashment on resignation
- Public holidays (tenant-scoped, country-seeded)

### Lifecycle Events

| Event | Capabilities |
|-------|-------------|
| **Resignations** | Request → HR approval, exit checklist, final settlement payslip + gratuity |
| **Onboarding** | Checklists (equipment, access, training, documentation) |
| **Transfers** | Role + department change with history |
| **Gratuity** | Versioned per jurisdiction/year, calculation snapshot frozen at settlement |
| **Appraisals & KRAs** | Cycles, 360 feedback, goal tracking |
| **Disciplinary** | Warnings, appeals, termination grounds |
| **Recognition** | Bonuses, milestone tracking |
| **Recruitment ATS** | Job postings, applicant tracking, interviews, offers |
| **Public Job Portal** | Careers page with application form |
| **Training** | Programs, modules, enrollments, completions |

---

## Finance & Accounting

### Double-Entry GL

- Chart of accounts (tree structure, cost center assignment)
- **Every money mutation = balanced journal** (payroll finalize, loan disbursement, insurance, etc.)
- Manual journal entries with multi-currency support
- Balance sheet with account tree drill-down

### Salary Advances & Loans

- Request → approve → disburse → installment deduction workflow
- GL posting: receivable + wage deduction
- Loan products with terms and approval authority
- Write-off capability (owner role only) → Bad Debt Expense journal

### Insurance & Benefits

- Insurance plans, enrollment, premium schedules
- Premium deduction integrated with PAYE (GY: medical + external capped at GYD 50k/month + 10% gross)

### Expense Claims

- Upload receipts, HR approval, post-finalize mark-paid
- Cost centers + expense categories

---

## Platform & Security

### RBAC (7 Roles)

| Role | Access Level |
|------|-------------|
| `owner` | Full access including statutory rate overrides, loan write-offs |
| `admin` | Full access except owner-only actions |
| `hr_admin` | HR operations, employee management |
| `payroll_admin` | Payroll operations, pay runs |
| `manager` | Department-scoped employee view |
| `employee` | Self-service only (My Payslips, My Leave, My Profile) |
| `auditor` | Read-only across all modules |

### Multi-Tenancy

- Tenant scoping mandatory on every business table + query
- Per-tenant branding (logo, colors, address, footer)
- Per-tenant statutory rate overrides
- Per-tenant work schedules, cost centers, payroll components, public holidays
- Organization auto-created on sign-up via Better Auth

### Deployment

- Docker Compose (SaaS via Coolify + Nginx; on-prem bundled)
- GitHub Actions CI/CD → GHCR
- PostgreSQL 16 with pgBackRest backups
- Diagnostics API (read-only bearer token, no PII exposure)

---

## Database Scale

**111 tables** across these domains:
- Organizational (5), Employee & HR (10+), Payroll (6), Attendance (8), Lifecycle (12+), Leave (4), Finance & Accounting (10+), Performance (6), Recruitment (4), Assets (3), Notifications & Audit (2), Auth (6 via Better Auth)

---

## v2 Rebuild Priorities

### Must Preserve (P0)

1. Multi-country tax engines with versioned immutable snapshots
2. Live pay accrual (real-time NIS + projected PAYE)
3. Logical shift date computation for overnight shifts
4. Immutable payslip corrections (reversal + reversing journal)
5. Double-entry GL with balanced journals
6. Per-tenant statutory rate overrides
7. Encrypted PII at rest with per-tenant keys
8. Audit trail on every money + PII mutation
9. Bigint-cent money storage (no floating-point)
10. Device bridge bearer-token auth pattern

### Extend in v2 (P1)

1. Additional country engines beyond Caribbean-4
2. Advanced compliance packs (quarterly/annual filing automation)
3. Bank statement import + matching
4. Predictive payroll analytics
5. Multi-language i18n
6. Third-party accounting integrations (QuickBooks, Xero)
7. Payroll API for third-party read access

### New in v2

1. Design handoff visual overhaul (Heimdall design system)
2. Better Auth Admin plugin for platform admin
3. Hash-chained compliance audit ledger
4. Evidence pack export (SOC 2)
5. Risk scoring and compliance dashboard
6. Enhanced mobile app (Expo with native-uniwind)
