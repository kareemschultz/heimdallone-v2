# Form & Wizard Standard — Specification

Phase 4E deliverable. Defines how every form and multi-step wizard in Heimdallone must behave.

---

## TanStack Form Usage

### When to use TanStack Form
- Forms with 5+ fields
- Forms with conditional fields (field visibility depends on another field's value)
- Forms with cross-field validation
- Multi-step wizard forms
- Forms with array fields (dynamic add/remove)
- Forms with async validation (email uniqueness, etc.)

### When NOT to use TanStack Form
- Login / sign-in forms (simple, already built)
- Single-field actions (inline search, filter chips)
- Toggle switches (single boolean)

### Core pattern
```ts
const form = useForm({
  defaultValues: { firstName: "", department: "", ... },
  onSubmit: async ({ value }) => {
    await oRPCMutation.mutateAsync(value)
  },
  validators: {
    onChange: formSchema,  // Zod schema
  },
})
```

### Field pattern
```tsx
<form.Field
  name="firstName"
  children={(field) => (
    <div className="field">
      <label className="label" htmlFor={field.name}>First name</label>
      <input
        className="input"
        id={field.name}
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
      />
      {field.state.meta.errors.length > 0 && (
        <p className="field-error">{field.state.meta.errors[0]}</p>
      )}
    </div>
  )}
/>
```

---

## Validation

### Schema validation
- Use **Zod** schemas for type-safe validation
- TanStack Form supports Zod via Standard Schema integration
- Define one schema per form, reuse between client and server

### Validation timing
- **onChange**: For format validation (email format, phone format, min/max length)
- **onBlur**: For async validation (email uniqueness check, employee ID availability)
- **onSubmit**: For cross-field validation (end date > start date, total percentage = 100)

### Plain-language error messages

**Rules**:
- Never show technical error messages to users
- State what's wrong + how to fix it in one sentence
- Use the field's visible label in the message, not the field key

**Examples**:

| Bad | Good |
|-----|------|
| `"required"` | `"First name is required"` |
| `"min length 2"` | `"Name must be at least 2 characters"` |
| `"invalid format"` | `"Enter a valid email address (e.g., name@company.com)"` |
| `"unique constraint violated"` | `"This email is already used by another employee"` |
| `"end_date must be > start_date"` | `"End date must be after the start date"` |
| `"value out of range"` | `"Salary must be between 0 and 10,000,000"` |
| `"FOREIGN_KEY_VIOLATION"` | `"The selected department no longer exists. Please choose another."` |

### Server-side validation
- Always validate on the server via oRPC procedure, even if client validates
- Server errors mapped back to form fields via TanStack Form's `setErrorMap`
- Generic server errors shown as a banner above the form (not per-field)

---

## Multi-Step Wizard

### When to use a wizard
- Employee creation (5+ sections: Personal → Work → Bank → Documents → Review)
- Contract setup (Contract details → Wage → Leave deduction → Review)
- Leave type configuration (Basic → Accrual/Reset → Carry Forward → Rules → Review)
- Payroll run (Period → Employees → Preview → Generate)
- Device setup (Type → Credentials → Test → Map employees)

### Step indicator
- Horizontal numbered steps at top of form
- States: completed (checkmark), current (highlighted number), upcoming (muted number)
- Step labels visible on desktop, icon-only on mobile
- No handoff CSS class exists — compose from handoff tokens

### Step navigation
- "Next" button at bottom-right (primary style)
- "Back" button at bottom-left (ghost style)
- "Cancel" link/button to abandon wizard
- Per-step validation: "Next" disabled until current step validates
- Users can click completed steps to go back (but not skip ahead)

### Review step
- Final step before submit shows summary of all entered data
- Each section collapsible or scrollable
- "Edit" link per section to jump back to that step
- Submit button only on review step

### Step data persistence
- Step data stored in TanStack Form state (client-side only)
- NOT persisted across page reloads by default
- Browser navigation warning: "You have unsaved changes. Leave anyway?"

---

## Draft / Save-and-Continue

### When to support
- Long forms where data loss is costly (employee creation with 20+ fields)
- NOT for simple request forms (leave request, shift request)

### Mechanism
- "Save as Draft" button alongside "Next" on wizard steps
- Draft saved to server via oRPC mutation with `status: "draft"`
- Draft resumed by loading entity with draft status into form
- Draft auto-deleted when submitted or explicitly discarded

### Autosave
- NOT implemented by default — explicit save only
- Evaluated per-module: complex forms (employee, contract) may add autosave in future
- If added: debounced (5s), save to localStorage, restore on page load, clear on submit

---

## Confirmation Rules

### Always confirm
- Destructive actions (archive, delete, terminate contract)
- Irreversible state transitions (confirm payslip, mark as paid)
- Actions affecting other people (approve/reject someone's request)
- Bulk operations (any action on multiple records)

### Never confirm
- Save/update (non-destructive)
- Navigate away (use "unsaved changes" warning instead)
- Filter/sort (instant, non-destructive)
- View/read-only actions

### Confirmation UI
- ConfirmDialog component with clear title and consequence description
- Destructive: red-styled confirm button with explicit action label ("Archive 3 employees", not "OK")
- Non-destructive confirmation: default-styled button ("Confirm payslip for September")

---

## Field Help / Tooltips

### FieldHelp component usage
- Used for non-obvious fields where the label alone is insufficient
- Small `(?)` icon next to label, hover/focus shows tooltip
- Tooltip text: 1-2 sentences max, plain language

### When to use
- Payroll: "Pre-tax deduction" — "Deducted before tax calculation, reducing taxable income"
- Leave: "Carry forward max" — "Maximum days that roll over to the next period"
- Attendance: "Grace time" — "Minutes of leeway before a check-in counts as late"

### When NOT to use
- Fields with obvious labels (First name, Email, Date of birth)
- Fields where the placeholder provides enough context

---

## File Upload

### Pattern
- Drag-and-drop zone with click-to-browse fallback
- Format validation before upload (accept attribute + client-side check)
- Size limit display: "Max 10 MB · PDF, DOCX, JPG"
- Upload progress bar (if file is large)
- Preview: show filename + size + remove button after selection
- Multiple files: add more button, list of selected files

### Validation messages
- Wrong format: "Please upload a PDF file. You selected a .xlsx file."
- Too large: "File must be under 10 MB. Your file is 14.2 MB."

---

## Role-Aware Fields

### Principle
- Frontend field visibility based on role is **UX optimization only**, never security
- Server-side oRPC middleware enforces field-level permissions
- Frontend hides fields the user's role cannot edit (not grayed out — hidden)

### Examples
- Employee self-service: can edit personal info, cannot see salary fields
- Manager: can see team members' work info, cannot edit salary
- HR admin: full edit access
- Payroll admin: can edit salary and bank details

### Implementation
- Role passed from OrgCtx (already exists in app layout)
- Form sections conditionally rendered based on role
- Same Zod schema used regardless — server validates field permissions

---

## Success / Next-Step Guidance

### After form submit
- Sonner toast with success message: "Employee created successfully"
- Redirect to appropriate view:
  - Create → detail page (e.g., new employee profile)
  - Edit → back to list or detail page
  - Settings → stay on settings page
  - Wizard → success step with "What's next" guidance

### Wizard success step
- After review step submit → show success state
- Content: checkmark icon, "Employee created!", brief summary
- Next actions: "View profile", "Add another employee", "Set up contract"
- Auto-redirect after 5s if no action taken (to detail page)

---

## CSS Integration

### Handoff form classes used
- `.field` — field wrapper (margin-bottom)
- `.label` — field label (font-size 12px, uppercase-style)
- `.input` — text input (height 38px, border-radius 10px, border var(--line-2))
- `.input:focus` — gold border + accent ring
- `.input-with-icon` — input with left icon
- `.field-row` — horizontal label + link (e.g., label + "Forgot?" link)

### New classes needed (Phase 4F)
- `.field-error` — validation error message (red, small, below input)
- `.field-help` — help text below field (muted, small)
- `.wizard-steps` — step indicator row
- `.wizard-step` — individual step (number + label)
- `.wizard-step.current` / `.wizard-step.completed` / `.wizard-step.upcoming`

These new classes must use handoff design tokens (colors, spacing, radii) and be added to a new CSS file (not modify `heimdall.css`).
