# Helpdesk — Horilla Extraction

## Overview

Horilla's Helpdesk module is an internal ticketing system for employee inquiries, suggestions, complaints, and service requests. Tickets have types (suggestion/complaint/service_request/meeting_request/anonymous_complaint), priorities, assignment routing (by department/job_position/individual), comments with attachments, and a FAQ knowledge base.

## Horilla Files Inspected

- `helpdesk/models.py` (311 lines) — DepartmentManager, TicketType, Ticket, ClaimRequest, Comment, Attachment, FAQCategory, FAQ

## Important Models

**TicketType** — Ticket categories. Fields: title (unique), type (suggestion/complaint/service_request/meeting_request/anonymous_complaint/others), prefix (3-char unique).

**Ticket** — Core entity. Fields: title, employee FK (owner), ticket_type FK, description, priority (low/medium/high), created_date (auto), resolved_date, assigning_type (department/job_position/individual), raised_on (FK ID as string), assigned_to M2M (Employee), deadline, tags M2M, status (new/in_progress/on_hold/resolved/canceled). Has audit history.

**ClaimRequest** — Employee claims/accepts a ticket. Fields: ticket FK, employee FK, is_approved, is_rejected. Unique per ticket+employee.

**Comment** — Ticket comments. Fields: comment text, ticket FK, employee FK, date (auto).

**Attachment** — File attachments for tickets/comments. Auto-detects format (image/audio/file).

**FAQ** — Knowledge base. Fields: question, answer, tags M2M, category FK, company FK.

**FAQCategory** — FAQ grouping. Fields: title, description.

## State Machine / Lifecycle

**Ticket**: New → In Progress → On Hold | Resolved | Canceled

**ClaimRequest**: Created → Approved | Rejected

## Heimdallone UI Pattern Recommendation

### Routes
- `/app/helpdesk` — Ticket list/kanban
- `/app/helpdesk/$id` — Ticket detail with comments
- `/app/helpdesk/create` — New ticket form
- `/app/helpdesk/faq` — FAQ knowledge base
- `/app/helpdesk/settings` — Ticket types, department managers

### View Modes
- **Kanban**: Status columns (New, In Progress, On Hold, Resolved)
- **Table**: Filterable ticket list
- **Ticket detail**: Description + comment thread + attachments + status actions
- **FAQ**: Searchable, categorized Q&A

### Staff-Friendly UX Notes
- Employee self-service: Simple "Submit a Request" form with type selection
- Plain ticket types: "Ask a Question", "Report a Problem", "Request a Service", "Schedule a Meeting"
- Anonymous option: "Submit anonymously" checkbox hides employee identity from assignees
- SLA/deadline indicators: Overdue tickets highlighted in red

## Proposed Drizzle Entities

- `ticket_type` — organizationId, title, category (enum), prefix
- `ticket` — organizationId, employeeId FK, typeId FK, title, description, priority, status, assignedToIds (JSON), deadline, resolvedAt, tags (JSON)
- `ticket_comment` — ticketId FK, authorId FK, content, createdAt
- `ticket_attachment` — ticketId FK (or commentId FK), fileUrl, fileName, format
- `faq_category` — organizationId, title, description
- `faq` — categoryId FK, question, answer, tags (JSON)

## Priority

**P3** — Nice-to-have for employee self-service. Standalone from core HR operations.
