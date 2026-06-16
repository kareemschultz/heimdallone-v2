# Phase 21X — Remaining Roadmap (non-blocking after morning readiness)

As of `4e1be74` / `sha-72ca623` the app is morning-ready: P0 QA closed, data
migrated + GRA-reconciled (46/46), real dashboard, Setup Center, no fake data on
app pages, mobile clean (390/430/768/desktop), v1 rollback intact. The following
are **non-blocking** follow-ups, roughly in priority order.

1. **Apex marketing landing rebuild** — `apps/web/src/routes/index.tsx` still
   carries design-handoff mockup copy/data. The **app subdomain redirects away**
   from it (`app.` → `/app`), so it only shows on `heimdallone.com`/`www`. Rebuild
   with real product copy (Magic UI Pro / shadcn-studio). Not user-facing in-app.
2. **Compliance / Documents / Clients full build-out** — currently honest
   admin-only Preview scaffolds ("Not configured yet" + planned capabilities).
   Build real modules (Compliance can read the shared `audit_event` log).
3. **Broader CTA / button-by-button sweep + a11y** — key flows verified; finish an
   exhaustive per-button pass (labels, dead CTAs, dropdown triggers, modal focus).
4. **Pi attendance live-sync operator action** — see
   `phase-21v-pi-attendance-sync-operator-packet.md`. v2 side ready; needs the
   on-site Pi `.env` + Gist publish. Until then, attendance ingests no new punches.
5. **Optional payslip template enhancements** — Classic/Compact/Detailed work;
   could add Statutory/Modern variants + per-tenant branding/logo.
6. **Final freeze / delta / cleanup decision** — stabilization wrote real data
   into `heimdallone_v2_prod` (leave, departments, payslips, allowances, profile).
   If live v1 changed since these loads, run a delta reconcile before any formal
   freeze. Reconcile guard: `migration:reconcile` must stay READY 46/46.
7. **v1 archive** — only after a stable monitoring window. Keep
   `heimdallone-{web,server,nginx}` (`sha-d03e5b4`) running as rollback until then.

## Deferred technical follow-ups (documented elsewhere)
- `employees/$id.tsx` Documents/Activity tabs now show honest empty states —
  wiring real document upload + activity feed (from `audit_event`) is future work.
- Web `typecheck` carries a pre-existing nitro-version-skew baseline (1 error,
  not app code); CI runs it `continue-on-error`.
