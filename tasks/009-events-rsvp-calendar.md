# TASK-009: Dedicated Events Calendar & RSVP System (Luma / Meetup)

## Context & Goal
Upgrade the existing `Events` post category from a simple feed filter into a full event discovery, RSVP, and calendar experience for online (Freenet room) and real-world gatherings.

## Requirements
1. **Structured Event Metadata**:
   - Extend the `Events` tab in the unified composer with structured fields: start/end date & time (with timezone), location or linked Radica/River room, capacity (optional), and cover image.
2. **RSVP & Attendee List**:
   - Allow personas to RSVP (`Going`, `Interested`, `Not Going`) using signed interactions, showing attendee counts and avatars from the reader's Web-of-Trust.
3. **Events Calendar View & Reminders**:
   - Add an Upcoming Events list/calendar view and integrate event start reminders into the central Activity & Notifications stream.
4. **Testing & Verification**:
   - Add unit tests for event date/timezone parsing, upcoming sorting, and RSVP state folding.
   - Update `ui/src/updates.ts`, `CHANGELOG.md`, `CONTEXT.md`, and `README.md` upon implementation.

## Reality check (2026-11-27)
Still TODO. Already there: the `event` category, a free-text `location` and `event_date` in the signed post (`radica/post/v3`), the Event tab in the composer and the `reddit-event-location` field in Communities, the Event flair.
Missing: end time and timezone, capacity, cover, RSVP (no signed interaction exists), attendee list, calendar view, reminders in Activity.

## Status
⚪ **TODO** (2026-11-14)
