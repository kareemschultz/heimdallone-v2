# Onboarding — Horilla Extraction

## Overview

Horilla's Onboarding module provides a stage-based task checklist system for new hires transitioning from hired candidate to active employee. It's tightly coupled with Recruitment — onboarding stages and tasks are defined per recruitment, and candidates progress through stages with assigned tasks tracked to completion.

## Horilla Files Inspected

- `onboarding/models.py` (215 lines) — OnboardingStage, OnboardingTask, CandidateStage, CandidateTask, OnboardingPortal

## Important Models

**OnboardingStage** — Pipeline stages for onboarding (per recruitment). Fields: stage_title, recruitment FK, employee_id M2M (stage managers), sequence, is_final_stage. Auto-creates "Initial" stage when Recruitment is created.

**OnboardingTask** — Tasks within a stage. Fields: task_title, stage FK, candidates M2M, employee_id M2M (task managers).

**CandidateStage** — Tracks which onboarding stage a candidate is in. OneToOne to Candidate. Fields: onboarding_stage FK, onboarding_end_date (auto-set when reaching final stage), sequence.

**CandidateTask** — Individual task completion per candidate. Fields: candidate FK, stage FK, status (todo/scheduled/ongoing/stuck/done), onboarding_task FK. Tracks completion ratio.

**OnboardingPortal** — Self-service portal token for candidates. Fields: candidate FK, token, used, count, profile image.

## State Machine / Lifecycle

**CandidateTask status**: Todo → Scheduled → Ongoing → Stuck | Done

**Onboarding progression**: Candidate moves through stages → reaches final stage → onboarding_end_date set → ready for employee conversion.

## Heimdallone UI Pattern Recommendation

### Routes
- `/app/onboarding` — Active onboarding pipelines
- `/app/onboarding/$candidateId` — Individual onboarding progress

### View Modes
- **Kanban**: Stages as columns, candidates as cards showing task completion ratio
- **Checklist**: Per-candidate task list with status toggles
- **Timeline/Gantt**: Visual timeline of onboarding progress (if dependencies exist)

### Staff-Friendly UX Notes
- HR sees all onboarding candidates in one view
- Task managers get notifications when tasks are assigned
- Candidate portal: new hire can view their tasks and upload required documents
- Progress bar showing X/Y tasks completed
- "Onboarding complete — Create employee record" CTA when all tasks done

## Proposed Drizzle Entities

- `onboarding_template` — organizationId, name, description, stages (JSON array of {name, sequence, tasks: [{title, assigneeRole}]})
- `onboarding_instance` — templateId FK, candidateId FK, startDate, completedDate, status (in_progress/completed)
- `onboarding_task_instance` — onboardingInstanceId FK, taskTitle, assigneeId FK, status (todo/in_progress/stuck/done), dueDate, completedAt

## Priority

**P2** — Follows recruitment. Important for structured new-hire experience.
