# Helpdesk Module Specification

## Purpose

Internal ticketing system for employee inquiries, suggestions, complaints, and service requests. Supports ticket types, priorities, department-based assignment, comments with attachments, and FAQ knowledge base.

## Source References

- `docs/horilla-extraction/helpdesk.md` — Horilla extraction

## Dependencies

- **HR Core** (P0) — employee_profile, department

## First Version Scope

- Ticket type configuration (suggestion/complaint/service_request/meeting_request/anonymous)
- Ticket CRUD (title, type, description, priority, assignee, deadline, status)
- Ticket lifecycle (new → in_progress → on_hold → resolved → canceled)
- Assignment routing (by department, position, or individual)
- Comment thread with attachments
- FAQ knowledge base (categories, questions, answers)
- Employee self-service: submit ticket, view own tickets

## Deferred Scope

- SLA/escalation rules, ticket templates, auto-assignment, CSAT surveys, ticket analytics

## Proposed Entities

### `ticket_type` — title, category (pgEnum), prefix
### `ticket` — employeeId, typeId, title, description, priority (low/medium/high), status, assignedToIds (jsonb), deadline, resolvedAt, tags
### `ticket_comment` — ticketId, authorId, content, createdAt
### `ticket_attachment` — ticketId or commentId, fileUrl, fileName
### `faq_category` — title, description
### `faq` — categoryId, question, answer, tags

## Proposed UI Routes

### `/app/helpdesk` — Ticket list/kanban (switchable via ViewSwitcher)
### `/app/helpdesk/$id` — Ticket detail with comment thread
### `/app/helpdesk/create` — Simple ticket form
### `/app/helpdesk/faq` — Searchable FAQ

**Primitives**: DataTable, StatusBadge, PageHeader, ActionMenu, EntitySheet, EmptyState

## RBAC

Uses existing: `ticket:create/read/update/assign/resolve/close`. helpdesk_agent has full access.

## Staff-Friendly UX

- Simple ticket form: "What do you need help with?" + type selector + description
- Anonymous option for complaints
- FAQ search before creating ticket: "Have you checked our FAQ?"
- Status updates via notification: "Your ticket was assigned to IT Department"

## Implementation Readiness

**Ready after HR Core**. Standalone module with no complex dependencies.
