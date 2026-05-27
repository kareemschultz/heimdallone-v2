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

## Heimdallone Project Context

Heimdallone v2 is a multi-tenant HRMS/payroll/workforce platform.

### Stack
- Bun + Turborepo monorepo
- TanStack Start + React (frontend)
- Hono + oRPC (API server)
- Better Auth + Organization/Admin plugins (auth/RBAC, 9 tenant roles)
- Drizzle ORM + PostgreSQL (central Postgres)
- Tailwind CSS v4 + Heimdallone design handoff CSS (dark-first, gold-accent)
- shadcn/ui with `base-lyra` style (@base-ui/react, NOT Radix)

### Implementation Pattern
Each module follows: **A** (spec) → **B** (schema+seed) → **C** (API) → **D** (UI) → **E** (QA/RBAC).

### Current Status (2026-05-27)
- HR Core: **Complete** (employees, org settings, holidays, CRUD, RBAC/scope)
- Contracts: **Phase 6 complete** (schema, API, UI — verified end-to-end; 6E QA/docs closure done)
- Phase 6E: **Complete** — payroll/attendance/leave spec enrichment, GRA verification, v1+gy-taxcalc inspection
- Phase 7A: **Complete** — Attendance + Leave implementation plans finalized, payroll-readiness plan created
- Phase 7B: **Complete** — Attendance DB schema (4 tables, 5 enums), migration, seed (72 records, 73 events, 2 corrections)
- Phase 7A.1: **Complete** — Odoo HRMS research, feature gap review, spec enrichment
- Phase 7C: **Complete** — Attendance oRPC router (17 procedures), RBAC scoping, audit events
- Phase 7D: **Complete** — Attendance UI (records table, clock panel, detail drawer, corrections view, bulk actions)
- Next: Phase 7E — Leave DB schema + seed

### Key Architecture Files
- `.claude/CLAUDE.md` — Full project instructions with doc references
- `docs/architecture/` — Schema specs, API specs, UI plans, implementation plans
- `docs/horilla-extraction/` — Module extraction docs from Horilla/OpenHRMS
- `packages/db/src/schema/` — Drizzle schema (`auth.ts`, `hr-core.ts`)
- `packages/api/src/routers/` — oRPC routers
- `packages/api/src/utils/` — Audit, scope, error utilities
- `packages/auth/src/permissions.ts` — 9 tenant roles with resource/action definitions

### Design Fidelity Rule
- Handoff CSS classes (`.tbl`, `.badge`, `.tabs`, `.filter-chip`, etc.) are first choice
- shadcn used only for behavior/accessibility where handoff has no equivalent
- No visual drift toward default shadcn styling
