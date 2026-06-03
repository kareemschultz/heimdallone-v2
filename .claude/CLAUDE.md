# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `bun x ultracite fix`
- **Check for issues**: `bun x ultracite check`
- **Diagnose setup**: `bun x ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**

- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**

- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**

- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Biome. Run `bun x ultracite fix` before committing to ensure compliance.

---

## References

Technology references for this project (researched from live docs):

- [Better Auth Organization Plugin](.claude/docs/better-auth-organization.md) — multi-tenancy, roles, permissions, teams
- [Better Auth Admin Plugin](.claude/docs/better-auth-admin.md) — platform admin, user management, impersonation
- [oRPC Reference](.claude/docs/orpc-reference.md) — server/client/middleware patterns with Hono
- [Design Handoff Summary](.claude/docs/design-handoff-summary.md) — tokens, screens, interactions, sample data
- [Horilla Module Map](.claude/docs/horilla-module-map.md) — Horilla module → Heimdallone concept mapping
- [shadcn/ui Reference](.claude/docs/shadcn-reference.md) — components, Field/Form pattern, Data Table, charts, blocks, skills (uses @base-ui/react NOT Radix)

Design source of truth: `design_handoff_heimdallone/` (committed to git). Open the HTML files directly — the CSS rule is the answer.
Note: This project uses shadcn `base-lyra` style (@base-ui/react), NOT Radix. shadcn skill is installed.

- [Lessons Learned & Gotchas](.claude/docs/lessons-learned.md) — edge cases, patterns, mistakes to avoid

HRMS domain extraction (Phase 4D):

- [Horilla Extraction Index](docs/horilla-extraction/README.md) — 20 module extraction docs with Heimdallone-native recommendations
- [Module Priority Index](docs/horilla-extraction/module-index.md) — priority tiers, dependencies, implementation order
- [UI Pattern Library](docs/horilla-extraction/ui-pattern-library-recommendations.md) — cross-module UI standards
- [Domain Roadmap](docs/horilla-extraction/heimdallone-domain-roadmap.md) — Phases 5-15 implementation sequence

HR Core implementation (Phase 5):

- [HR Core Domain Plan](docs/architecture/hr-core-domain-plan.md) — entity relationships, archive strategy, open questions
- [HR Core Schema Spec](docs/architecture/hr-core-schema-spec.md) — Drizzle tables, money/enum/date strategy
- [HR Core API Spec](docs/architecture/hr-core-api-spec.md) — oRPC procedures, RBAC, bank masking, known limitations
- [HR Core UI Plan](docs/architecture/hr-core-ui-plan.md) — routes, primitives, UX, Phase 5B implementation sequence
- [HR Core DB Setup](docs/implementation/hr-core-db-setup.md) — tables, migrations, seed, commands
- [Shared UI Primitives](docs/architecture/shared-ui-primitives-plan.md) — 17 component specs with handoff CSS mapping
- [Module Spec Backlog](docs/architecture/modules/README.md) — specs for all post-HR-Core modules

Contracts implementation (Phase 6):

- [Contracts Implementation Plan](docs/architecture/contracts-implementation-plan.md) — schema, API, UI, RBAC, business rules
- [Contracts Module Spec](docs/architecture/modules/contracts-spec.md) — original extraction spec

Attendance + Leave implementation (Phase 7):

- [Attendance Implementation Plan](docs/architecture/attendance-implementation-plan.md) — schema, API, UI decisions, payroll integration
- [Leave Implementation Plan](docs/architecture/leave-implementation-plan.md) — schema, API, UI decisions, balance/accrual rules
- [Payroll Readiness Plan](docs/architecture/attendance-leave-payroll-readiness-plan.md) — data flow from attendance+leave into payroll
- [Analytics & Reporting Plan](docs/architecture/analytics-reporting-plan.md) — charts, stat tiles, PDF export, per-module analytics
- [Payroll Implementation Plan](docs/architecture/payroll-implementation-plan.md) — Phase 8 spec: entities, engine, Guyana rules, UI, RBAC, Caribbean country research

Payroll engine (Phase 8C):

- `packages/payroll-engine/` — pure TypeScript calculation engine, zero dependencies
- Country rules registry: `src/countries/registry.ts` — lookup by countryCode + effectiveYear
- Guyana 2026 implemented; Barbados 2026 and Trinidad 2026 researched but deferred

Biometric + Geofencing (Phase 11 — active):

- [Biometric + Geofencing Implementation Plan](docs/architecture/biometric-geofencing-implementation-plan.md) — Phase 11A spec: device sync/import model, adapter/provider model (multi-vendor), geofenced check-in, entities, RBAC, attendance/payroll integration, UI routes, security/privacy, 11A–11H sequence
- [Biometric + Geofencing DB Setup](docs/implementation/biometric-geofencing-db-setup.md) — 11B schema (8 tables, enums, migrations 0011/0012)
- [Biometric + Geofencing API](docs/implementation/biometric-geofencing-api.md) — 11C router, adapter/provider model, punch processor, ingest endpoint, RBAC, privacy

Assets (Phase 12 — ✅ COMPLETE; 12B DB → 12C API → 12D UI → 12E QA/sidebar/offboarding-custody):

- [Assets Implementation Plan](docs/architecture/assets-implementation-plan.md) — spec (entities, Drizzle schema, oRPC API + RBAC, UI checkpoints, offboarding custody integration).
- [Assets DB Setup](docs/implementation/assets-db-setup.md) — 12B: 4 tables + 3 enums, migration 0014, idempotent seed.
- [Assets API](docs/implementation/assets-api.md) — 12C: `assets` router (inventory/categories/assignments/requests), `asset:request` AC action, 6 RBAC helpers, server-side purchaseCost redaction, transactional assign/return, two-layer authz, verify 46/46; +12D `assignments.listMine`; +12E read-only offboarding `AssetCustodyPanel`.
- [Assets Module Spec](docs/architecture/modules/assets-spec.md) — original extraction spec

Helpdesk / Requests (Phase 13 — ACTIVE; 13A spec ✅ → 13B DB ✅ → 13C API next):

- [Helpdesk Requests Implementation Plan](docs/architecture/helpdesk-requests-implementation-plan.md) — 13A spec: request/ticket LAYER that LINKS to Assets/Payroll/Leave/Offboarding (read-only link cols) and NEVER duplicates them; reuses existing `ticket` AC (employee already holds ticket:create); MVP 3 tables; status/SLA/priority; 7 RBAC helpers; router `helpdesk`; HelpdeskTabs UI; 8 open questions; benchmarks Zendesk/Freshdesk/Jira-SM/Frappe/GLPI/Horilla.
- [Helpdesk DB Setup](docs/implementation/helpdesk-db-setup.md) — 13B: 3 tables + 5 enums, migration 0016, 6 read-only cross-module link FKs (set null), SLA state DERIVED not stored, new `ticket:approve` action (least-privilege; audit stays 86/12), idempotent seed (10 cat / 10 req / 6 comment).
- [Helpdesk Module Spec](docs/architecture/modules/helpdesk-spec.md) + [Horilla Extraction](docs/horilla-extraction/helpdesk.md) — original extraction
