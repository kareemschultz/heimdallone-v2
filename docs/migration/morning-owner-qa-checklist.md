# Morning Owner QA Checklist — v2 (`sha-72ca623`)

Run this on your phone **and** desktop before staff start using the app. If any
item fails, report it before staff use — v1 rollback is still available.

## Sign-in & tenant
- [ ] Sign in with **Google** → lands on the dashboard (no "Loading workspace" hang).
- [ ] **Tenant switcher** lists **Foreign Links** and **Netsurf**; switching
      changes the data (employee counts, payroll, etc.).
- [ ] `app.heimdallone.com` opens the **app** (not the marketing page).

## Dashboard
- [ ] Dashboard shows **real stat tiles** (Active employees, Pending leave,
      Unread, Setup) — numbers look right, not fake.
- [ ] Active-employees count matches the tenant (Foreign Links ~3, Netsurf ~20).

## People & payroll
- [ ] **Employees** list opens; an **employee detail** opens (no fake
      "Maya Persaud"/"Lia Roberts" activity — empty states instead).
- [ ] **Payroll** shows "Guyana 2026 · Active"; **Payslips** list opens.
- [ ] A **payslip detail** opens with earnings/PAYE/NIS/net + hourly wage type;
      template selector (Classic/Compact/Detailed) works; Print/Save-as-PDF works.
- [ ] **Leave** shows balances; **Countries & Tax** shows the real GY-2026 profile.

## Setup & ops
- [ ] **Setup center** (Govern) lists org / payroll / tax / pay items / time
      clocks / geofencing / leave / migration.
- [ ] **Time clocks** and **Geofencing** appear in nav and open.
- [ ] **Settings** is usable (tabs scroll, no crushed columns) on mobile.

## Mobile
- [ ] Sidebar opens/closes as a drawer; no sideways scrolling; buttons not clipped.
- [ ] Log out and back in cleanly.

## Known / expected
- Attendance shows historical punches but **no new live punches yet** — the on-site
  Pi still needs its one-time switch (see the Pi operator packet). Not a bug.
- Compliance / Documents / Clients are admin-only **Preview** ("Not configured yet").
- The public marketing page (`heimdallone.com`) is still a mockup — separate rebuild.
