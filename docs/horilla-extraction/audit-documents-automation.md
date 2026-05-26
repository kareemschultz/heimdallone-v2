# Audit, Documents, Automations & Notifications — Horilla Extraction

## Overview

These four cross-cutting modules support all other HRMS functionality: Audit tracks field-level changes across all models, Documents manages employee document uploads with expiry and approval, Automations triggers email/notifications on model events, and Notifications provides in-app notification delivery.

## Horilla Files Inspected

- `horilla_audit/models.py` (129 lines) — AuditTag, HorillaAuditInfo, HorillaAuditLog, HistoryTrackingFields
- `horilla_documents/models.py` (170 lines) — DocumentRequest, Document
- `horilla_automations/models.py` (145 lines) — MailAutomation
- `notifications/models.py` (16 lines) — Notification (extends AbstractNotification)
- OpenHRMS: `employee_documents_expiry/`, `hr_reminder/`, `hr_company_policy/`

---

## Audit Module

### How It Works

Horilla wraps `django-simple-history` (HistoricalRecords) as `HorillaAuditLog`. Models that include `history = HorillaAuditLog(...)` get automatic field-level change tracking. Each historical record can have: history_title, history_description, history_highlight (bool), history_tags M2M.

**AuditTag** — Labels for audit entries. Fields: title, highlight (bool).

**HorillaAuditInfo** — Abstract model added as a base to historical records. Adds title, description, highlight, tags to each history entry.

**HistoryTrackingFields** — Configuration for which fields to track. Fields: tracking_fields (JSON), work_info_track (bool).

Models with audit: EmployeeWorkInformation, RotatingWorkTypeAssign, RotatingShiftAssign, WorkTypeRequest, ShiftRequest, Attendance, AttendanceOverTime, LeaveRequest, LeaveAllocationRequest, AvailableLeave, Contract, Payslip, LoanAccount, Candidate, CandidateTask, EmployeeTask, EmployeeObjective, EmployeeKeyResult, Feedback, BonusPoint, Ticket.

### Heimdallone Audit Design

- `audit_event` — id, organizationId, entityType (string), entityId, action (create/update/delete), actorId FK, timestamp, changes (JSON array of {field, oldValue, newValue}), metadata (JSON — IP, source, request details)
- Single table for all audit events rather than per-model history tables
- Query by: entity, actor, time range, action type
- Entity timeline: all events for a specific record ordered by time

---

## Documents Module

### Models

**DocumentRequest** — HR requests documents from employees. Fields: title, employee_id M2M, format (any/pdf/txt/docx/xlsx/jpg/png/jpeg), max_size (MB), description. Auto-creates Document records for each employee on M2M change.

**Document** — Individual document record. Fields: title, employee FK, document_request FK, document (file), status (requested/approved/rejected), reject_reason, issue_date, expiry_date, notify_before (days), is_digital_asset (bool — creates Asset record on save).

Key behaviors:
- File format validation against document_request.format
- File size validation against document_request.max_size
- Title minimum 3 characters
- Digital asset flag: creates Asset record in asset module for document-as-asset tracking
- Expiry date tracking with configurable reminder notifications

### OpenHRMS Comparison

`employee_documents_expiry` — Adds expiry tracking and automated reminders for document renewal. Similar to Horilla's expiry_date + notify_before, but with scheduled email reminders.

### Heimdallone Documents Design

- `document_request` — organizationId, title, format (enum), maxSizeMB, description, targetEmployeeIds (JSON or junction table)
- `employee_document` — employeeId FK, requestId FK (nullable), title, fileUrl, fileName, fileSize, format, status (requested/uploaded/approved/rejected), rejectReason, issueDate, expiryDate, notifyBeforeDays, uploadedAt, approvedBy FK
- Route: `/app/documents` (HR view), employee profile Documents tab (employee view)
- Views: Document vault (all docs), Expiring soon lens, Missing documents lens, Approval queue

---

## Automations Module

### Models

**MailAutomation** — Event-triggered email/notification rules. Fields: title (unique), method_title (slug), model (which model to watch), mail_to (recipient field path), mail_details, trigger (on_create/on_update/on_delete), mail_template FK, also_sent_to M2M (additional recipients), delivery_channel (email/notification/both), template_attachments M2M, condition (filter expression), condition_html, condition_querystring.

Key behaviors:
- Watches model save/delete signals
- Evaluates conditions against the instance
- Resolves recipients from field paths (e.g., "employee_id__employee_work_info__reporting_manager_id__email")
- Sends via email, in-app notification, or both

### Heimdallone Automations Design

- `automation_rule` — organizationId, title, entityType, trigger (create/update/delete/field_change), conditions (JSON), actions (JSON array of {type: email/notification/webhook, config: {...}}), isActive, createdBy FK
- Start simple: hardcoded automation triggers for common events (leave approved → notify employee, attendance exception → notify manager)
- Future: visual rule builder for custom automations

---

## Notifications Module

### Models

**Notification** — Extends django-notifications AbstractNotification. Adds multi-language verb fields (verb_en, verb_ar, verb_de, verb_es, verb_fr). Standard fields: recipient, actor, verb, description, target, action_object, timestamp, unread, public, deleted, emailed, data.

### Heimdallone Notifications Design

- `notification` — id, recipientUserId FK, actorUserId FK, verb (string), entityType, entityId, link (URL), isRead, createdAt
- In-app notification bell with unread count
- Notification center page with mark-read/mark-all-read
- Future: push notifications via Expo, email digest
- Route: Notification dropdown in topbar, `/app/notifications` for full list

---

## Heimdallone UI Pattern Recommendation

### Audit
- Entity activity timeline on every detail page (employee, payslip, leave request, etc.)
- Global audit log at `/app/audit` with search/filter
- Diff view for sensitive changes (salary, role, permissions)

### Documents
- Employee profile → Documents tab with upload, status badges, expiry indicators
- HR → Documents dashboard with "Missing", "Expiring Soon", "Pending Approval" lenses
- Upload: Sheet with drag-and-drop file upload, format/size validation feedback

### Automations
- Settings → Automations with rule list and enable/disable toggles
- Future: visual rule builder (trigger → condition → action)

### Notifications
- Topbar bell icon with unread count badge
- Dropdown showing recent notifications with "View all" link
- `/app/notifications` — Full notification list with filters

## Priority

- **Audit**: P0 (foundation — needed from day one for compliance)
- **Documents**: P0 (employee documents are core HR data)
- **Notifications**: P1 (needed for approval workflows)
- **Automations**: P3 (enhancement — hardcoded triggers first, rule builder later)
