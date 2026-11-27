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

Verified by the architect (2026-11-27), plus what else exists:
- `event_date` must match `^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$` (`isCanonicalPost`, `ui/src/feedlight.ts`, twice incl. the worker copy) or other readers drop the post. A UTC `toISOString()` passes; offsets (`+01:00`) and IANA zones do not. Contract caps it at `MAX_NAME * 2` = 200 bytes.
- The composer's `#post-event-date` and Communities' `#reddit-event-date` are `type="date"`: today every event is date-only. The card shows the raw string (`main.ts` ~3230 feed, ~11576 Communities).
- Cover: `media_uri` is accepted for any category by the contract and rendered category-agnostically by the cards; only the composer limits it to `moment` (`main.ts` ~5675). No contract change needed.
- Signed per-post interactions already exist outside the feed contract: the `reactions/<postAuthor>` log (`post_dislike`, `comment_like`; `foldPostDislikes`/`foldCommentLikes` in `logfold.ts`, `toggleDislike` in `freenet.ts`, refreshed by `refreshVisibleReactions` in `main.ts`). `stateSlotFor`/`STATE_SUBJECT` gives one log slot per author and subject, newest wins (log-contract merge keeps the newer `ts`).
- Activity stream: `NotificationItem` (`types.ts`), `freenet.recordLocalNotification` (local, deduped by id, 50 newest) and the `syncMailNotifications()` pattern called from `updateNotificationsBadge()` in `main.ts`; `notifCounts()` decides what counts vs "Others".
- Moderation Layer 2 for posts is one call: `mod.policy.isPostHidden(post)` (`moderationPolicy.ts`; hidden authors, curator reports, reported media, AI holds).
- **River is removed** (`141bb88`): "linked Radica/River room" now means a native private room / channel only (`#join_room=` invite, already rendered as a pill by `caption.ts`; picker pattern `#comm-link-room-select` + `nativeRooms.ts`).
- Nothing named RSVP exists anywhere (`grep -ri rsvp` empty).

## Plan

No contract change: neither `contract/` (feed, post v3) nor `log-contract/`.

### Event fields: in existing fields + one caption line
| Field | Where | Notes |
|---|---|---|
| Start | `event_date`, now a UTC instant `YYYY-MM-DDTHH:MM:SS.sssZ` | passes `isCanonicalPost`, readers of older versions still show it |
| End, timezone, capacity | one **event line** at the end of the caption: `radica-event:end=<UTC ISO>&tz=<IANA>&cap=<n>` | signed with the caption; editable later through the existing `post-edits` log (same as any caption edit) |
| Location | `location` (free text, as today) | |
| Linked room | caption `#join_room=` invite (already a pill) | River gone: native rooms only |
| Cover | `media_uri` image, uploaded through the existing Moment picker | |

Validation on read (trust boundary): `end` UTC ISO, after start, at most 31 days after; `tz` accepted only if `Intl.DateTimeFormat(undefined, { timeZone })` does not throw, max 64 chars; `cap` integer 1..100000. Anything invalid is ignored (the post still shows).
Legacy (`legacy.ts` not needed: no new wire format, only a reading rule): `event_date` date-only = all-day event on that date in the reader's zone; no event line = no end/tz/capacity. Older clients show the event line as text (acceptable; new clients strip it in `renderPost`).

### RSVP: entries in the host's `reactions/<host>` log
Chosen over the feed contract: a like is a boolean (no 3 states), and a comment replaces by larger signature, not newest, counts toward 500 comments/post and would need filtering out of every thread. A new shared log would need new subscriptions; `reactions/<host>` is already fetched for visible authors, PoW-guarded for third parties, owner-scoped (past the cap others' oldest entries drop, never the host's), and `STATE_SUBJECT` keeps one slot per (attendee, event).
- Body: `{ "type": "event_rsvp", "postId": "<id>", "status": "going" | "interested" | "not_going", "ts": <ms> }`
- `STATE_SUBJECT.event_rsvp = (b) => b.postId` so the entry id is `stateSlot("event_rsvp", postId)`.
- Signed as every log entry: `radica/log/v2|` lp(params hex of `radica/reactions/<host>|<app path>`, author, id, ts, BLAKE3(body), nonce), 12-bit PoW unless the signer is the host.
- Fold: newest `ts` per (author, postId); unknown status dropped; the entry's author is the attendee (no impersonation).
- Summary per event: counts per status excluding hidden/blocked authors (`isPostHidden`-equivalent `isAuthorHidden`), avatars only for WoT-trusted attendees (`getWebOfTrust().isTrusted`) plus me; `full` when going >= cap (display only, see Open questions).

### Calendar view
Attaches to the existing sidebar **Events** category (`.cat-btn[data-cat="event"]`, `setCategory`): when active, a `#events-upcoming` panel above the feed lists upcoming and ongoing events from `timelinePosts` sorted by start, grouped by day, with a List / Month toggle (month grid marks days with events; clicking a day filters the list). Rows open `openSinglePostModal`. Communities keeps its 📅 flair filter; its event meta row gets the same formatted time and RSVP bar as the feed card.

### Reminders
Local, like mail: `syncEventReminders()` called from `updateNotificationsBadge()` next to `syncMailNotifications()`. For each visible event I marked `going` or `interested` whose start is within the lead time (1 h, see Open questions) and not past, `freenet.recordLocalNotification(me, { id: "notif_event_<author>_<postId>", type: "event", from: <host>, linkPostId, linkPostOwner, ... })`. The id makes it once per event. `NotificationItem.type` gains `"event"`; `notifCounts()` counts an `event` item only if its id starts with `notif_event_` and its post is one I RSVP'd to (an inbox entry from someone else cannot fake a reminder).

### Moderation, 3 layers
1. Local: cover goes through the Moment picker (`analyzeImageFile`, `currentMediaNsfw`/`NSFW_BLOCK` guard already in publish); caption + location through `okToPublish`; cards mask caption and location with `maskProfanity` when the reader has `maskBadWords`. RSVPs carry no text.
2. Curator/AI/WoT: Upcoming panel, calendar and reminders use only posts that pass `mod.policy.isPostHidden(post) === null` (own posts always pass); RSVP counts and avatars drop `isAuthorHidden` attendees; WoT-only avatars.
3. Manual: every Upcoming/calendar row opens the Single Post View, whose card already has Report and Hide Author; the attendee avatars open the profile (Hide there).

### Files
- core: `ui/src/events.ts` (new), `ui/src/logfold.ts`, `ui/src/freenet.ts`, `ui/src/types.ts`, `ui/src/caption.ts`
- ui: `ui/index.html`, `ui/src/main.ts`, `ui/src/style.css`, `ui/src/updates.ts`
- test: `ui/tests/events.test.ts` (new), `ui/tests/logfold.test.ts`, `ui/tests/caption.test.ts`, `CHANGELOG.md`, `README.md`
- `CONTEXT.md` terms added by the architect: **Event line**, **RSVP**, **Upcoming panel**, **Event reminder**.

## Tasks
- [ ] [core] core-1: `ui/src/events.ts` (DOM-free): `parseEventLine(caption) -> { text, end?, tz?, cap? }` with the validation above, `withEventLine(caption, meta)`, `zonedToUtc("YYYY-MM-DDTHH:MM", tz) -> Date` (Intl offset, DST-safe), `eventWindow(post, caption) -> { start, end?, allDay }` (date-only = all-day legacy), `formatEventWhen(window, tz, readerTz)` (host zone + reader local when they differ), `upcomingEvents(posts, captionOf, now)` (ongoing + future, sorted by start), `eventsByDay(list, readerTz)`.
- [ ] [core] core-2: `ui/src/logfold.ts`: `foldEventRsvps(entries) -> Map<postId, Map<author, { status, ts }>>` (newest per author/post, unknown status dropped) and `event_rsvp: (b) => b.postId` in `STATE_SUBJECT`.
- [ ] [core] core-3 (after: core-1): `ui/src/events.ts`: `rsvpSummary(rsvps, { me, isHidden, isTrusted, cap }) -> { going, interested, notGoing, mine, avatars, full }`; `dueReminders(events, myStatus, now, leadMs) -> NotificationItem[]` (id `notif_event_<author>_<postId>`, type `event`, only going/interested, start in `(now, now+lead]`).
- [ ] [core] core-4 (after: core-2): `ui/src/freenet.ts`: `eventRsvps(host, postId)` (memo over `reactions/<host>` like `postDislikers`), `setRsvp(identity, host, postId, status)` (append `event_rsvp`, `notifyListeners`); `ui/src/types.ts`: `NotificationItem.type` adds `"event"`.
- [ ] [core] core-5 (after: core-1): `ui/src/caption.ts`: `renderPost` and `linkCard` drop the `radica-event:` line (use `parseEventLine`).
- [ ] [ui] ui-1: `ui/index.html` + `style.css`: `#event-fields` gets start `datetime-local` (replaces `#post-event-date` date), end `datetime-local`, timezone select (default `Intl...resolvedOptions().timeZone`), capacity number, linked-room select (same markup as `#comm-link-room-select`); `#events-upcoming` panel (List/Month toggle, list, month grid) hidden by default.
- [ ] [ui] ui-2 (after: core-1, ui-1): `main.ts` composer: show the Moment image picker on the Event tab (cover, image only, existing NSFW guard), publish `event_date = zonedToUtc(start, tz).toISOString()`, append `withEventLine` and the room invite after `okToPublish`; reject end before start.
- [ ] [ui] ui-3 (after: core-3, core-4, ui-2): `main.ts` cards (feed ~3230, Communities ~11576): formatted when, masked location, capacity / Full, RSVP bar Going / Interested / Not going (`setRsvp`), counts and WoT avatars from `rsvpSummary` with `isHiddenAuthor` + `getWebOfTrust().isTrusted`.
- [ ] [ui] ui-4 (after: core-1, ui-1): `main.ts`: render `#events-upcoming` when `setCategory("event")` from `timelinePosts` filtered by `mod.policy.isPostHidden(p) === null`, captions via `freenet.postEdit`; rows open `openSinglePostModal`; month grid day click filters the list.
- [ ] [ui] ui-5 (after: core-3, core-4): `main.ts`: `syncEventReminders()` in `updateNotificationsBadge()` (visible events only, my RSVP from `eventRsvps`), `notifCounts()` accepts `event` items only per the rule in Plan, icon/label for `event` in the notifications list (click already opens `linkPostId`).
- [ ] [ui] ui-6 (after: ui-3, ui-4, ui-5): `updates.ts` entry (2026-11-27 or ship date) and an Events `<details>` in `#guide-modal`.
- [ ] [test] test-1 (after: core-1, core-3): `ui/tests/events.test.ts`: event line round-trip and rejection of bad end/tz/cap, `zonedToUtc` across a DST change, date-only legacy as all-day, `upcomingEvents` order and past exclusion, `rsvpSummary` hidden/WoT/full, `dueReminders` window and status.
- [ ] [test] test-2 (after: core-2, core-5): `ui/tests/logfold.test.ts` `foldEventRsvps` newest wins / bad status / `stateSlotFor` same slot per post; `ui/tests/caption.test.ts` event line not rendered.
- [ ] [test] test-3 (after: all): `npm test`, `npm run build`, `graphify update .`, check the 3 moderation layers by reading ui-3/ui-4/ui-5, `CHANGELOG.md` + `README.md` Key Features, close the spec and `ISSUES.md` row.

Note: ui-2..ui-5 all edit `main.ts`: one `[ui]` agent does them in order. No `[core]` task touches `main.ts`, `index.html`, `style.css` or `updates.ts`.

## Open questions
1. Capacity: display only ("Full", Going still allowed) or disable Going when full / show overflow as waitlist (ordered by RSVP time)? Plan assumes display only; it cannot be enforced anyway.
2. Counts: total of all non-hidden attendees (Sybil-inflatable) or only Web-of-Trust attendees? Plan assumes total + WoT avatars.
3. Reminder lead time: 1 h only, or also 24 h? For Interested too, or Going only? Plan assumes 1 h, both.
4. Notify the host in their inbox when someone RSVPs Going (like comment likes do)? Plan leaves it out.
5. Rescheduling: allow `start=` in the event line (via post edit) to override `event_date`? Plan leaves it out; today start cannot change after publishing.
6. Communities inline composer: upgrade `#reddit-event-date` to the full fields too, or keep date-only there? Plan keeps it date-only.

## Status
🟡 **IN_PROGRESS** (2026-11-27)
