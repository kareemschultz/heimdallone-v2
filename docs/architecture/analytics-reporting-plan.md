# Analytics, Charts, Reports & PDF Export Plan

Phase 7H deliverable. Cross-module analytics strategy for Attendance, Leave, Payroll, and the Executive Dashboard.

---

## Philosophy

Every module that touches payroll or workforce data should surface **actionable insights** — not just tables of raw records. Charts reduce cognitive load for HR managers and executives who need at-a-glance understanding of attendance trends, leave utilization, payroll costs, and compliance posture.

**Design rules**:
- Stat tiles use handoff `.stat` / `.stat-label` / `.stat-value` / `.stat-delta` CSS (already in `heimdall.css`)
- Charts use **shadcn Chart** (Recharts under the hood) — install: `bunx shadcn@latest add chart`
- All charts respect the Heimdallone token system (CSS variables, no hardcoded hex)
- Numbers use `font-mono` + `tabular-nums`, thousand separators, explicit currency codes
- Charts are **read-only** — they never modify data, only visualize it
- All chart data comes from **oRPC procedures** with the same tenant-scoping and RBAC as existing routes

---

## Shared Primitives

### StatTile

Wraps the handoff `.stat` CSS. Used across all dashboards.

```ts
interface StatTileProps {
  label: string
  value: string | number
  delta?: { value: number; direction: "up" | "down" | "neutral" }
  format?: "number" | "currency" | "percent" | "hours"
  currencyCode?: string
}
```

**Handoff CSS**: `.stat`, `.stat-label`, `.stat-value`, `.stat-delta`, `.stat-delta.up/.down/.neutral`

### ChartCard

Wraps shadcn Chart in a Card with a title, optional date-range selector, and loading skeleton.

```ts
interface ChartCardProps {
  title: string
  description?: string
  dateRange?: { from: Date; to: Date }
  onDateRangeChange?: (range: { from: Date; to: Date }) => void
  children: React.ReactNode
  loading?: boolean
}
```

### Chart Types to Install

| shadcn Chart | Use Case |
|-------------|----------|
| Area Chart | Attendance trend (daily headcount over time) |
| Bar Chart | Leave type breakdown, payroll cost by department |
| Line Chart | Payroll cost trend over periods |
| Pie / Donut | Leave type utilization split, attendance status distribution |
| Radial Chart | Leave balance consumption (per employee) |
| Stacked Bar | Gross/deductions/net breakdown per period |

---

## Module Analytics

### 1. Executive Dashboard (`/app`)

The dashboard already has a design spec. Analytics additions:

| Widget | Chart Type | Data Source | Role |
|--------|-----------|-------------|------|
| Headcount trend | Area | `employee_profile` count by month | HR+ |
| Payroll cost trend | Line | `payslip` sum by period | HR+ |
| Attendance pulse | Stacked Bar | `attendance_record` status distribution (7d) | HR+ |
| Leave utilization | Pie | `leave_balance` used vs available aggregate | HR+ |
| Pending approvals | StatTile | Count of pending attendance/leave/payroll items | Manager+ |
| Compliance alerts | StatTile | Count of open compliance findings | HR+ |

### 2. Attendance Analytics (`/app/attendance`)

Add a collapsible "Analytics" section above the records table (or as a tab).

| Widget | Chart Type | Data Source |
|--------|-----------|-------------|
| **This week at-a-glance** (4 stat tiles) | StatTile | Present count, Late count, Absent count, Avg hours |
| Attendance rate trend | Area | `attendance_record` by day (30d rolling) |
| Late arrivals by department | Bar | `attendance_record` WHERE `isLateArrival=true` grouped by department |
| Overtime distribution | Bar | `attendance_record` `overtimeMinutes > 0` grouped by employee (top 10) |
| Status breakdown | Donut | Count by `attendanceStatus` for current period |
| Payroll readiness | StatTile + Progress | % of records with `payrollStatus='approved'` vs total |

**oRPC procedures to add** (in `attendance.summary` group):

```
attendance.summary.weekSnapshot  → { present, late, absent, avgHours, totalOT }
attendance.summary.trendByDay    → [{ date, present, late, absent, holiday }]
attendance.summary.lateByDept    → [{ department, count }]
attendance.summary.otByEmployee  → [{ employeeId, name, minutes }]
attendance.summary.statusBreakdown → [{ status, count }]
attendance.summary.payrollReadiness → { approved, pending, total, percentage }
```

### 3. Leave Analytics (`/app/leave`)

Add an "Analytics" section or tab alongside the balance cards.

| Widget | Chart Type | Data Source |
|--------|-----------|-------------|
| **Balance overview** (stat tiles) | StatTile | Avg utilization %, total pending requests, upcoming leaves (7d) |
| Leave requests by type | Bar | `leave_request` grouped by `leaveTypeId` for current year |
| Monthly leave trend | Area | `leave_request` approved days by month (12m rolling) |
| Department absence heatmap | Table/Heatmap | Approved leave days by department by month |
| Carry-forward expiry risk | StatTile | Balances with carry-forward days expiring within 60d |
| Top leave takers | Bar | Employees with most leave days taken (top 10) |

**oRPC procedures to add** (in `leave.calendar` group or new `leave.analytics` group):

```
leave.analytics.balanceOverview     → { avgUtilization, pendingCount, upcomingCount }
leave.analytics.requestsByType      → [{ leaveTypeId, typeName, count, totalDays }]
leave.analytics.monthlyTrend        → [{ month, approvedDays, rejectedDays }]
leave.analytics.departmentAbsences  → [{ departmentId, name, months: { [month]: days } }]
leave.analytics.carryForwardRisk    → [{ employeeId, name, leaveType, expiringDays, expiryDate }]
leave.analytics.topLeaveTakers      → [{ employeeId, name, totalDays }]
```

### 4. Payroll Analytics (`/app/payroll`) — Future (Phase 8+)

| Widget | Chart Type | Data Source |
|--------|-----------|-------------|
| **Pay run summary** (stat tiles) | StatTile | Total gross, total net, total deductions, headcount |
| Cost trend by period | Line | `payslip` totals over last 12 periods |
| Cost by department | Bar | `payslip` gross grouped by department |
| Deduction breakdown | Stacked Bar | PAYE + NIS + other deductions per period |
| Salary distribution | Histogram/Bar | Employee gross pay ranges |
| Country cost comparison | Grouped Bar | Total payroll cost by country |

---

## PDF Export Strategy

### Approach: Client-Side Generation

Use **@react-pdf/renderer** for structured payroll documents (payslips, pay registers) and **html2canvas + jsPDF** for visual chart exports.

| Document Type | Library | Trigger |
|--------------|---------|---------|
| Individual payslip | @react-pdf/renderer | "Download payslip" button on payslip detail |
| Pay register (batch) | @react-pdf/renderer | "Export register" on payroll period |
| Attendance report | @react-pdf/renderer | "Export" button on attendance analytics |
| Leave report | @react-pdf/renderer | "Export" button on leave analytics |
| Chart snapshot | html2canvas + jsPDF | "Export chart" context menu on any ChartCard |
| Compliance audit pack | @react-pdf/renderer | "Export evidence pack" on compliance module |

### PDF Template Structure

```
┌──────────────────────────────────────┐
│ [Logo] Heimdallone        [Date]     │
│ [Org Name]    [Report Title]         │
├──────────────────────────────────────┤
│                                      │
│  [Stat tiles row]                    │
│                                      │
│  [Table / Chart content]             │
│                                      │
│  [Page N of M]                       │
├──────────────────────────────────────┤
│ Generated by Heimdallone · Conf.     │
│ [Tenant] · [Generated by user]       │
└──────────────────────────────────────┘
```

### Security in PDFs

- Every PDF includes: org name, generated-by user, timestamp, confidentiality notice
- Payslips include employee name, employee ID, period — no other employees' data
- Batch reports respect RBAC: only HR/admin can generate cross-employee reports
- PDF generation happens client-side — no server-side rendering needed initially
- No PII in filenames beyond employee ID (e.g., `payslip-EMP00214-2026-09.pdf`)

---

## Security & Privacy Constraints

| Rule | Enforcement |
|------|-------------|
| All analytics procedures are tenant-scoped | `authorizedProcedure` + `organizationId` filter |
| Employee role sees only own data | `scopedEmployeeIds()` returns self only |
| Manager sees direct reports | `scopedEmployeeIds()` returns self + reports |
| HR/admin sees all org data | `scopedEmployeeIds()` returns "all" |
| No cross-tenant aggregation | Every query includes `WHERE organizationId = ?` |
| Salary/pay data restricted to HR+ | `authorizedProcedure("payroll", "read")` |
| Chart data is read-only | No mutations in analytics procedures |
| PDF exports logged | Audit event emitted when PDF is generated |

---

## Company Branding in Reports

All PDF reports and payslip exports use the organization's branding profile:
- Company logo (falls back to report logo → payslip logo → company logo)
- Primary/accent colors for headers and accents
- Company address, phone, email, website in footer
- Tax/NIS registration numbers where required
- Custom footer text
- Optional signature/stamp image

Template choices (Classic, Modern, Compact, Detailed, Statutory) are selected per-org and can be overridden per-run. Preview uses sample data unless viewing an authorized employee.

All exports are audit-logged. PDFs enforce tenant isolation — no cross-tenant data leakage.

---

## Implementation Phases

| Phase | Scope | Depends On |
|-------|-------|-----------|
| **8** (Payroll) | Payroll stat tiles, pay run summary, cost trend | Payroll engine |
| **8G** (Templates) | Payslip template foundation, PDF export basics | Payroll API |
| **8J** (Branding) | Company branding profile, template customization, onboarding wizard polish | Phase 8I |
| **9** (Analytics) | Shared StatTile + ChartCard primitives, install shadcn Chart | Recharts dependency |
| **9** (Analytics) | Attendance analytics (6 procedures + 6 widgets) | Phase 7 attendance API |
| **9** (Analytics) | Leave analytics (6 procedures + 6 widgets) | Phase 7 leave API |
| **9** (Analytics) | Executive dashboard chart widgets | All module APIs |
| **10** (Reports) | PDF export: payslips, pay register, report templates | Payroll engine |
| **10** (Reports) | PDF export: attendance/leave reports | Analytics procedures |
| **10** (Reports) | Chart snapshot export | ChartCard component |
| **8K** (Payments) | Payment batch summary, bank distribution, missing bank details, failed payment report, export audit | Payment batch entities |

---

## Open Questions

1. **Server-side PDF for payslips?** Client-side works for single payslips, but batch generation of 100+ payslips may need a server-side queue. Defer decision to Phase 10.
2. **Dashboard widget customization?** Should HR admins be able to rearrange/hide dashboard widgets? Adds complexity — defer to post-MVP.
3. **Export formats?** PDF is primary. CSV export for tables is trivial to add. Excel (XLSX) adds a dependency — evaluate demand first.
4. **Real-time vs. cached aggregates?** For small orgs (<500 employees), real-time queries are fine. For larger orgs, consider materialized views or periodic aggregation jobs. Defer to scale phase.
