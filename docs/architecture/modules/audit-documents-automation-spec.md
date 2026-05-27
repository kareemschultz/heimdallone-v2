# Audit, Documents & Automation Module Specification

## Purpose

Three cross-cutting capabilities: (1) Audit — generic change tracking for all entities via `audit_event`, (2) Documents — employee document management with expiry and approval, (3) Automations — event-triggered notifications/emails. Also covers the in-app notification system.

## Source References

- `docs/horilla-extraction/audit-documents-automation.md` — Full extraction
- `docs/architecture/hr-core-schema-spec.md` — audit_event and employee_document tables

## Dependencies

- **HR Core** (P0) — audit_event and employee_document are defined in HR Core schema

## Audit — Already in HR Core

The `audit_event` table is defined in `hr-core-schema-spec.md` and implemented in Phase 5B. It is generic and reusable across all modules. Every module's mutations call `createAuditEvent()`.

### First version scope (Phase 5B)
- Insert-only event log (entityType, entityId, action, actorId, changes, metadata)
- Entity timeline view on detail pages (employee profile Activity tab)
- Global audit log at `/app/audit` (HR admin, auditor)
- Filters: entity type, actor, date range
- Server-side pagination (audit grows unboundedly)

### Deferred
- Audit data retention policies (auto-archive after N months)
- Evidence pack builder (export audit trail for compliance)
- Real-time audit stream (WebSocket)
- Audit-based alerting (suspicious patterns)

## Documents — Already in HR Core

The `employee_document` table is defined in `hr-core-schema-spec.md`. This spec adds operational details.

### First version scope (Phase 5B)
- Upload documents to employee profile (Documents tab)
- Document status workflow (requested → uploaded → approved → rejected)
- Expiry date tracking with configurable reminder period
- HR document vault view (`/app/documents`) with lenses: All, Pending Review, Expiring Soon, Missing

### Deferred
- Document request bulk send (HR requests docs from multiple employees)
- Automatic expiry notifications (scheduled job)
- Document templates (pre-defined doc types with format/size requirements)
- Digital asset flag (creates asset record)
- Document version history

### Staff-Friendly UX
- **Expiring soon** lens: Red badge for expired, amber for expiring within 30 days
- **Missing documents** lens: Show which employees have required docs missing
- **Upload**: Drag-and-drop with format/size validation feedback
- **Employee view**: "You have 2 documents pending upload" banner on dashboard

## Automations — Deferred to Phase 9+

### Concept
Event-triggered email/notification rules. When a model event occurs (create/update/delete), evaluate conditions, and send email or in-app notification to configured recipients.

### First version scope (Phase 9+)
- Hardcoded triggers for common events:
  - Leave request approved → notify employee
  - Attendance exception detected → notify manager
  - Document expiring in 30 days → notify HR + employee
  - Resignation submitted → notify HR
- In-app notification delivery

### Deferred
- Visual rule builder (trigger → condition → action)
- Custom email templates
- Webhook delivery
- Scheduled/recurring automations
- Condition builder UI

### Proposed Entities (Phase 9+)

#### `notification`
- **Key fields**: id, organizationId, recipientUserId (FK), actorUserId (FK, nullable), verb (text), entityType (text, nullable), entityId (text, nullable), link (text — URL), isRead (bool, default false), createdAt
- **Delete**: Soft (mark read) or hard after 90 days

#### `automation_rule` (deferred)
- **Key fields**: id, organizationId, title, entityType, trigger (create/update/delete/field_change), conditions (jsonb), actions (jsonb), isActive, createdBy

## Proposed UI Routes

### `/app/audit` — Global audit event stream
- **Primitives**: DataTable (server-side paginated), StatusBadge (action type colors), PageHeader
- **Filters**: Entity type, Actor, Date range
- **Role access**: hr_admin, tenant_admin, tenant_owner, auditor

### `/app/documents` — Document management (HR view)
- **Primitives**: DataTable, StatusBadge, SavedViewTabs (All/Pending/Expiring/Missing), ActionMenu
- **Role access**: hr_admin sees all; manager sees team; employee sees own

### Notification bell (topbar)
- Dropdown showing recent unread notifications
- "View all" link to `/app/notifications`
- Unread count badge on bell icon

## RBAC

Audit: `audit_log:read`. Documents: `document:create/read/update/archive/scan_expiring`.

## Implementation Readiness

- **Audit**: Implemented as part of HR Core (Phase 5B)
- **Documents**: Implemented as part of HR Core (Phase 5B)
- **Notifications**: Phase 7+ (when approval workflows need notification delivery)
- **Automation rules**: Phase 9+ (after core modules are stable)
