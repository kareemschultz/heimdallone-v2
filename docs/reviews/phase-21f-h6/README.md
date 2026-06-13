# Phase 21F-H6 — App-shell live-data hardening

**Date:** 2026-06-13 · **Scope:** `apps/web/src/routes/app/route.tsx` (the app shell — sidebar + topbar). **Closes audit finding H6** (the only strict cutover blocker).

## What was fake (presented as live) → now real

| Site | Before (fake) | After (live) |
| --- | --- | --- |
| Topbar avatar | `MP` / "Maya Persaud" | real session initials + `org.userName` |
| Topbar user menu | "Maya Persaud" / "maya@atlas-shipping.com" | `org.userName` / `org.userEmail` |
| Sidebar sub-label | hardcoded country chips `GY · TT · BB · +2 more` | real membership role (`org.memberRole`) |
| Workspace switcher | fake list (Atlas / Mahaica Group 328 emp / Trident Capital 84 emp) | the real active org only, marked "current" |
| Notifications dot | always shown | shown only when real `unreadCount > 0` |
| Notifications list | 3 fake items (NIS rate change · Guyana / 14 contracts / Barbados pay run BBD 412,600) | real `orpc.notifications.list` (21D-F), with honest **loading / empty / error** states |
| "Mark all read" | static text | real `client.notifications.markAllRead` mutation (only when unread > 0) |
| Context defaults | `"Atlas Shipping"` fallback | neutral `"Workspace"` placeholder |

All identity/org values come from the existing `OrgCtx` (already populated from `getUser()` session + `authClient.useActiveOrganization()`); the sidebar user-menu already used them — the topbar/switcher/notifications were the divergent fake surfaces.

## Honest states (no error-as-empty)
The notifications query distinguishes **loading** ("Loading…"), **error** ("Notifications are unavailable right now."), and **empty** ("You're all caught up.") — a `?? []` fallback alone would have shown "all caught up" on a 500 (recurring lesson; see 13H).

## Browser verification (3 roles, 0 console errors)
Real API server (:3000) + web on the trusted origin (:3002). Dev DB was behind — applied pending additive migrations 0021/0022 so the `notification` table exists (the 500s before that were `relation "notification" does not exist`, not a code bug).

| Role | Login | Real identity shown | Nav |
| --- | --- | --- | --- |
| Admin | `admin@atlas-shipping.com` | **Sasha Bharrat** / admin@… · tenant admin | full |
| Employee | `employee@atlas-shipping.com` | **Rohan Gopaul** · employee | correctly reduced (no Employees/Payroll/Analytics/Finance/CRM) |
| Manager | `manager@atlas-shipping.com` | **Andre Sealey** · manager | manager scope (Analytics/Finance/CRM visible) |

Notifications dropdown shows the real empty state; no dot; **zero console errors** after migration. Screenshots: `admin-shell.png`, `employee-shell.png`, `manager-shell.png`.

## Gates
web tsc 0 · check-types 3/3 · build 2/2 · audit 161/21 · lint route.tsx clean · fake-data grep (Maya/atlas-shipping/Mahaica/Trident/Barbados/NIS) = none.

## Follow-up (out of this scope)
`login.tsx` has a similar decorative "Atlas Shipping · GY · TT" chip (pre-auth, cosmetic). Recommend cleaning before any external demo.
