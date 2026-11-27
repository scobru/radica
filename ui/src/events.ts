// Events (TASK-009), DOM-free. Start is the post's signed `event_date` (UTC instant, or a bare date = all-day legacy);
// end, host timezone and capacity ride in one "event line" at the end of the caption: `radica-event:end=…&tz=…&cap=…`.
import type { NotificationItem, Post } from "./types.ts";
import type { RsvpStatus } from "./logfold.ts";

export type { RsvpStatus };
export type EventMeta = { end?: string; tz?: string; cap?: number };
export type EventWindow = { start: Date; end?: Date; allDay: boolean; tz?: string; cap?: number };
export type EventPost = Pick<Post, "id" | "author" | "category" | "event_date">;
export type UpcomingEvent<P extends EventPost = EventPost> = { post: P; window: EventWindow };

const LINE_RE = /(?:^|\n)radica-event:([^\n]*)\s*$/;
const UTC_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;
const MAX_SPAN_MS = 31 * DAY_MS;
/** An event without an end counts as ongoing this long after its start (for the Upcoming list). */
export const DEFAULT_EVENT_MS = 2 * 3_600_000;
export const REMINDER_LEAD_MS = 3_600_000;

/** Whether `tz` is an IANA zone this runtime knows. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The caption without its event line, and the line's fields that pass validation (invalid ones are ignored). */
export function parseEventLine(caption: string): { text: string } & EventMeta {
  const m = LINE_RE.exec(caption ?? "");
  if (!m) return { text: caption ?? "" };
  const out: { text: string } & EventMeta = { text: caption.slice(0, m.index).trimEnd() };
  const q = new URLSearchParams(m[1].trim());
  const end = q.get("end");
  if (end && UTC_ISO_RE.test(end) && !isNaN(Date.parse(end))) out.end = end;
  const tz = q.get("tz");
  if (isValidTimeZone(tz)) out.tz = tz;
  const cap = q.get("cap");
  if (cap && /^\d{1,6}$/.test(cap) && +cap >= 1 && +cap <= 100_000) out.cap = +cap;
  return out;
}

/** `caption` with its event line replaced by one for `meta` (none if `meta` is empty). */
export function withEventLine(caption: string, meta: EventMeta): string {
  const text = parseEventLine(caption).text;
  const q = new URLSearchParams();
  if (meta.end) q.set("end", meta.end);
  if (meta.tz) q.set("tz", meta.tz);
  if (meta.cap) q.set("cap", String(meta.cap));
  const line = q.toString();
  return line ? `${text}${text ? "\n" : ""}radica-event:${line}` : text;
}

/** Wall-clock parts of instant `t` in zone `tz`. */
function partsIn(t: number, tz?: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const p: Record<string, number> = {};
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  for (const x of fmt.formatToParts(new Date(t))) if (x.type !== "literal") p[x.type] = Number(x.value);
  return { y: p.year, mo: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
}

/** Offset of `tz` from UTC at instant `t`, in ms. */
function offsetAt(t: number, tz: string): number {
  const p = partsIn(t, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000;
}

/** The instant a `datetime-local` value ("YYYY-MM-DDTHH:MM") means in zone `tz` (DST-safe; a skipped hour moves
 *  forward). Invalid Date on bad input or zone. */
export function zonedToUtc(local: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local ?? "");
  if (!m || !isValidTimeZone(tz)) return new Date(NaN);
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  if (isNaN(guess)) return new Date(NaN);
  const o1 = offsetAt(guess, tz);
  const o2 = offsetAt(guess - o1, tz);
  // an offset is right if the instant it gives has that offset; two right ones = DST fold, take the earlier instant
  const ok = [o1, o2].filter((o) => offsetAt(guess - o, tz) === o);
  // none right = DST gap: read the time with the pre-change (smaller) offset, so it moves forward
  return new Date(guess - (ok.length ? Math.max(...ok) : Math.min(o1, o2)));
}

/** When `post` happens: null if it has no valid `event_date`. A bare date is an all-day event in the reader's zone.
 *  The event line's end is kept only if after start and at most 31 days later. */
export function eventWindow(post: Pick<Post, "event_date">, caption: string): EventWindow | null {
  const raw = post.event_date;
  if (!raw) return null;
  const meta = parseEventLine(caption);
  const day = DATE_ONLY_RE.exec(raw);
  const start = day ? new Date(+day[1], +day[2] - 1, +day[3]) : new Date(raw);
  if (isNaN(start.getTime())) return null;
  const w: EventWindow = { start, allDay: !!day };
  if (day) w.end = new Date(+day[1], +day[2] - 1, +day[3] + 1);
  else if (meta.end) {
    const end = new Date(meta.end);
    if (end > start && end.getTime() - start.getTime() <= MAX_SPAN_MS) w.end = end;
  }
  if (meta.tz) w.tz = meta.tz;
  if (meta.cap) w.cap = meta.cap;
  return w;
}

const sameDayIn = (a: Date, b: Date, tz?: string) => dayKey(a, tz) === dayKey(b, tz);

/** "Sat, Dec 5, 18:00 – 20:00 GMT+1", in the host's zone, plus the reader's local time when the zones differ. */
export function formatEventWhen(w: EventWindow, tz?: string, readerTz?: string, locale?: string): string {
  const date: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  const time: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  if (w.allDay) return new Intl.DateTimeFormat(locale, { ...date, timeZone: readerTz }).format(w.start);
  const host = tz && isValidTimeZone(tz) ? tz : readerTz;
  const range = (zone: string | undefined, named: boolean) => {
    const from = new Intl.DateTimeFormat(locale, { ...date, ...time, timeZone: zone }).format(w.start);
    if (!w.end) return from + (named ? " " + zoneName(w.start, zone, locale) : "");
    const endOpts = sameDayIn(w.start, w.end, zone) ? time : { ...date, ...time };
    const to = new Intl.DateTimeFormat(locale, { ...endOpts, timeZone: zone }).format(w.end);
    return `${from} – ${to}` + (named ? " " + zoneName(w.end, zone, locale) : "");
  };
  const reader = readerTz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!host || offsetAt(w.start.getTime(), host) === offsetAt(w.start.getTime(), reader)) return range(host, !!tz);
  return `${range(host, true)} (${range(reader, false)} your time)`;
}

function zoneName(d: Date, tz: string | undefined, locale?: string): string {
  const p = new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: "short" }).formatToParts(d);
  return p.find((x) => x.type === "timeZoneName")?.value ?? tz ?? "";
}

/** Events not over yet (ongoing or future), soonest first. `captionOf` gives the current (possibly edited) caption. */
export function upcomingEvents<P extends EventPost>(posts: P[], captionOf: (p: P) => string, now: number = Date.now()): UpcomingEvent<P>[] {
  const out: UpcomingEvent<P>[] = [];
  for (const post of posts) {
    if (post.category !== "event") continue;
    const window = eventWindow(post, captionOf(post));
    if (!window) continue;
    const end = window.end?.getTime() ?? window.start.getTime() + DEFAULT_EVENT_MS;
    if (end > now) out.push({ post, window });
  }
  return out.sort((a, b) => a.window.start.getTime() - b.window.start.getTime() || (a.post.id < b.post.id ? -1 : 1));
}

/** "YYYY-MM-DD" of `d` in zone `tz` (default: the runtime's). */
export function dayKey(d: Date, tz?: string): string {
  const p = partsIn(d.getTime(), tz);
  return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** `list` grouped by the reader's calendar day of each start (order kept). An all-day event is already local. */
export function eventsByDay<E extends UpcomingEvent<any>>(list: E[], readerTz?: string): Map<string, E[]> {
  const out = new Map<string, E[]>();
  for (const e of list) {
    const k = dayKey(e.window.start, e.window.allDay ? undefined : readerTz);
    const day = out.get(k) ?? [];
    day.push(e);
    out.set(k, day);
  }
  return out;
}

export type RsvpSummary = {
  going: number;
  interested: number;
  notGoing: number;
  mine: RsvpStatus | null;
  /** Going first, then Interested; only Web-of-Trust attendees and me. */
  avatars: string[];
  /** Going reached capacity (display only: Going stays allowed). */
  full: boolean;
};

/** Counts per status without hidden/blocked attendees (I always count), avatars only from my Web of Trust. */
export function rsvpSummary(
  rsvps: Map<string, { status: RsvpStatus; ts: number }> | undefined,
  o: { me?: string | null; isHidden: (pk: string) => boolean; isTrusted: (pk: string) => boolean; cap?: number },
): RsvpSummary {
  const s: RsvpSummary = { going: 0, interested: 0, notGoing: 0, mine: null, avatars: [], full: false };
  const going: [string, number][] = [];
  const interested: [string, number][] = [];
  for (const [pk, r] of rsvps ?? []) {
    const isMe = !!o.me && pk === o.me;
    if (isMe) s.mine = r.status;
    else if (o.isHidden(pk)) continue;
    if (r.status === "going") s.going++;
    else if (r.status === "interested") s.interested++;
    else s.notGoing++;
    if (r.status !== "not_going" && (isMe || o.isTrusted(pk))) (r.status === "going" ? going : interested).push([pk, r.ts]);
  }
  const newest = (a: [string, number], b: [string, number]) => b[1] - a[1];
  s.avatars = [...going.sort(newest), ...interested.sort(newest)].map(([pk]) => pk);
  s.full = !!o.cap && s.going >= o.cap;
  return s;
}

/** Reminders for events I am Going to or Interested in that start in `(now, now + leadMs]`. The id makes each one
 *  once per event (`recordLocalNotification` dedupes by id). */
export function dueReminders<P extends EventPost>(
  events: UpcomingEvent<P>[],
  myStatus: (e: UpcomingEvent<P>) => RsvpStatus | null | undefined,
  now: number = Date.now(),
  leadMs: number = REMINDER_LEAD_MS,
): NotificationItem[] {
  const out: NotificationItem[] = [];
  for (const e of events) {
    const start = e.window.start.getTime();
    if (start <= now || start > now + leadMs) continue;
    const st = myStatus(e);
    if (st !== "going" && st !== "interested") continue;
    out.push({
      id: eventReminderId(e.post.author, e.post.id),
      type: "event",
      from: e.post.author,
      text: `Event starts in ${Math.max(1, Math.round((start - now) / 60_000))} min`,
      timestamp: now,
      read: false,
      linkPostId: e.post.id,
      linkPostOwner: e.post.author,
    });
  }
  return out;
}

export const eventReminderId = (author: string, postId: string) => `notif_event_${author}_${postId}`;
