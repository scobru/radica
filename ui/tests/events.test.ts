import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_EVENT_MS, REMINDER_LEAD_MS, dayKey, dueReminders, eventReminderId, eventWindow, eventsByDay, isValidTimeZone, parseEventLine, rsvpSummary, upcomingEvents, withEventLine, zonedToUtc, type EventPost, type RsvpStatus } from "../src/events.ts";

const H = 3_600_000;
const DAY = 24 * H;
const post = (id: string, event_date: string | undefined, author = "host", category = "event"): EventPost => ({ id, author, category, event_date } as EventPost);

test("events: event line round-trips through withEventLine / parseEventLine and replaces an old line", () => {
  const meta = { end: "2026-12-05T20:00:00.000Z", tz: "Europe/Rome", cap: 40 };
  const cap = withEventLine("Meetup at the pub\n#join_room=abc", meta);
  assert.match(cap, /\nradica-event:end=.*&tz=Europe%2FRome&cap=40$/);
  assert.deepEqual(parseEventLine(cap), { text: "Meetup at the pub\n#join_room=abc", ...meta });
  // re-editing keeps one line; empty meta drops it
  const again = withEventLine(cap, { cap: 5 });
  assert.equal(again, "Meetup at the pub\n#join_room=abc\nradica-event:cap=5");
  assert.equal(withEventLine(cap, {}), "Meetup at the pub\n#join_room=abc");
  assert.equal(withEventLine("", { cap: 3 }), "radica-event:cap=3");
  // no line, or a line not at the end, is plain text
  assert.deepEqual(parseEventLine("just text"), { text: "just text" });
  const mid = "radica-event:cap=3\nmore text";
  assert.deepEqual(parseEventLine(mid), { text: mid });
});

test("events: invalid end / tz / cap in the event line are ignored, the text still shows", () => {
  const bad = [
    "end=2026-12-05T20:00:00+01:00", // offset, not UTC
    "end=2026-12-05", // date only
    "end=2026-13-45T99:00Z",
    "tz=Mars/Olympus",
    "tz=" + "A".repeat(65),
    "cap=0",
    "cap=100001",
    "cap=1.5",
    "cap=-3",
    "cap=abc",
  ];
  for (const q of bad) assert.deepEqual(parseEventLine(`hi\nradica-event:${q}`), { text: "hi" }, q);
  // the valid fields of a mixed line survive
  assert.deepEqual(parseEventLine("hi\nradica-event:end=nope&tz=America/New_York&cap=100000"), { text: "hi", tz: "America/New_York", cap: 100000 });
  assert.equal(isValidTimeZone("UTC"), true);
  assert.equal(isValidTimeZone(""), false);
  assert.equal(isValidTimeZone(42), false);
});

test("events: zonedToUtc converts wall time in a zone, standard and summer time", () => {
  assert.equal(zonedToUtc("2026-01-15T18:00", "Europe/Rome").toISOString(), "2026-01-15T17:00:00.000Z");
  assert.equal(zonedToUtc("2026-07-15T18:00", "Europe/Rome").toISOString(), "2026-07-15T16:00:00.000Z");
  assert.equal(zonedToUtc("2026-01-15T18:00", "America/New_York").toISOString(), "2026-01-15T23:00:00.000Z");
  assert.equal(zonedToUtc("2026-07-15T18:00", "America/New_York").toISOString(), "2026-07-15T22:00:00.000Z");
  // just around the changes, outside the gap / overlap
  assert.equal(zonedToUtc("2026-03-29T01:30", "Europe/Rome").toISOString(), "2026-03-29T00:30:00.000Z");
  assert.equal(zonedToUtc("2026-03-29T03:30", "Europe/Rome").toISOString(), "2026-03-29T01:30:00.000Z");
  assert.equal(zonedToUtc("2026-03-08T01:30", "America/New_York").toISOString(), "2026-03-08T06:30:00.000Z");
  assert.equal(zonedToUtc("2026-03-08T03:30", "America/New_York").toISOString(), "2026-03-08T07:30:00.000Z");
  assert.equal(zonedToUtc("2026-10-25T12:00", "Europe/Rome").toISOString(), "2026-10-25T11:00:00.000Z");
  assert.equal(zonedToUtc("2026-11-01T12:00", "America/New_York").toISOString(), "2026-11-01T17:00:00.000Z");
  // bad input
  assert.ok(isNaN(zonedToUtc("2026-01-15", "Europe/Rome").getTime()));
  assert.ok(isNaN(zonedToUtc("2026-01-15T18:00", "Nowhere/City").getTime()));
});

test("events: zonedToUtc moves a time in the spring-forward gap forward (Europe/Rome, America/New_York)", () => {
  // 02:30 does not exist: the skipped hour moves forward to 03:30 summer time
  assert.equal(zonedToUtc("2026-03-29T02:30", "Europe/Rome").toISOString(), "2026-03-29T01:30:00.000Z");
  assert.equal(zonedToUtc("2026-03-08T02:30", "America/New_York").toISOString(), "2026-03-08T07:30:00.000Z");
});

test("events: zonedToUtc in the fall-back overlap gives one of the two real instants", () => {
  // 02:30 happens twice in Rome on 2026-10-25 (00:30Z CEST, 01:30Z CET); 01:30 twice in New York on 2026-11-01
  assert.ok(["2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z"].includes(zonedToUtc("2026-10-25T02:30", "Europe/Rome").toISOString()));
  assert.ok(["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"].includes(zonedToUtc("2026-11-01T01:30", "America/New_York").toISOString()));
});

test("events: eventWindow: date-only is all-day local, end kept only if after start and within 31 days", () => {
  const allDay = eventWindow({ event_date: "2026-12-05" }, "radica-event:end=2026-12-09T00:00:00Z&cap=10")!;
  assert.equal(allDay.allDay, true);
  assert.equal(allDay.start.getTime(), new Date(2026, 11, 5).getTime());
  assert.equal(allDay.end!.getTime(), new Date(2026, 11, 6).getTime()); // the line's end does not stretch an all-day event
  assert.equal(allDay.cap, 10);

  const start = "2026-12-05T18:00:00.000Z";
  const w = eventWindow({ event_date: start }, "x\nradica-event:end=2026-12-05T20:00:00.000Z&tz=Europe/Rome")!;
  assert.equal(w.allDay, false);
  assert.equal(w.start.toISOString(), start);
  assert.equal(w.end!.toISOString(), "2026-12-05T20:00:00.000Z");
  assert.equal(w.tz, "Europe/Rome");

  assert.equal(eventWindow({ event_date: start }, "").end, undefined); // no end time
  assert.equal(eventWindow({ event_date: start }, "radica-event:end=2026-12-05T17:00:00Z").end, undefined); // before start
  assert.equal(eventWindow({ event_date: start }, "radica-event:end=2026-12-05T18:00:00Z").end, undefined); // equal to start
  assert.equal(eventWindow({ event_date: start }, "radica-event:end=2027-01-05T18:00:00Z").end!.toISOString(), "2027-01-05T18:00:00.000Z"); // exactly 31 days
  assert.equal(eventWindow({ event_date: start }, "radica-event:end=2027-01-05T18:00:01Z").end, undefined); // > 31 days

  assert.equal(eventWindow({ event_date: undefined }, ""), null);
  assert.equal(eventWindow({ event_date: "soon" }, ""), null);
});

test("events: upcomingEvents keeps ongoing and future events sorted by start, drops past and non-events", () => {
  const now = Date.parse("2026-12-05T12:00:00Z");
  const iso = (t: number) => new Date(t).toISOString();
  const posts = [
    post("later", iso(now + 2 * DAY)),
    post("past", iso(now - 5 * H), "host", "event"),
    post("noEndOngoing", iso(now - 1 * H)), // within DEFAULT_EVENT_MS
    post("noEndOver", iso(now - DEFAULT_EVENT_MS)), // ends exactly now
    post("longOngoing", iso(now - 10 * H)), // end in caption, still running
    post("soon", iso(now + H)),
    post("tieB", iso(now + 3 * H)),
    post("tieA", iso(now + 3 * H)),
    post("notEvent", iso(now + H), "host", "moment"),
    post("noDate", undefined),
  ];
  const captions: Record<string, string> = { longOngoing: `radica-event:end=${iso(now + H)}`, past: `radica-event:end=${iso(now - H)}` };
  const ids = upcomingEvents(posts, (p) => captions[p.id] ?? "", now).map((e) => e.post.id);
  assert.deepEqual(ids, ["longOngoing", "noEndOngoing", "soon", "tieA", "tieB", "later"]);
});

test("events: eventsByDay groups by the reader's day, all-day events by their own date", () => {
  const list = upcomingEvents(
    [post("a", "2026-12-05T10:00:00.000Z"), post("b", "2026-12-05T20:00:00.000Z"), post("c", "2026-12-06T01:00:00.000Z"), post("d", "2026-12-07")],
    () => "",
    Date.parse("2026-12-01T00:00:00Z"),
  );
  const utc = eventsByDay(list, "UTC");
  assert.deepEqual([...utc].map(([k, v]) => [k, v.map((e) => e.post.id)]), [["2026-12-05", ["a", "b"]], ["2026-12-06", ["c"]], ["2026-12-07", ["d"]]]);
  const tokyo = eventsByDay(list, "Asia/Tokyo"); // UTC+9
  assert.deepEqual([...tokyo].map(([k, v]) => [k, v.map((e) => e.post.id)]), [["2026-12-05", ["a"]], ["2026-12-06", ["b", "c"]], ["2026-12-07", ["d"]]]);
  assert.equal(dayKey(new Date("2026-12-05T23:30:00Z"), "Asia/Tokyo"), "2026-12-06");
});

test("events: rsvpSummary drops hidden attendees, avatars only from WoT plus me, full at cap", () => {
  const r = (status: RsvpStatus, ts: number) => ({ status, ts });
  const rsvps = new Map([
    ["me", r("going", 1)],
    ["friend", r("going", 5)],
    ["stranger", r("going", 6)],
    ["spammer", r("going", 7)],
    ["friend2", r("interested", 3)],
    ["stranger2", r("interested", 4)],
    ["nope", r("not_going", 2)],
    ["friendNo", r("not_going", 8)],
  ]);
  const hidden = new Set(["spammer", "me"]); // I never hide myself out of my own count
  const trusted = new Set(["friend", "friend2", "friendNo", "spammer"]);
  const opts = { me: "me", isHidden: (pk: string) => hidden.has(pk), isTrusted: (pk: string) => trusted.has(pk) };
  const s = rsvpSummary(rsvps, { ...opts, cap: 3 });
  assert.deepEqual(s, { going: 3, interested: 2, notGoing: 2, mine: "going", avatars: ["friend", "me", "friend2"], full: true });
  assert.equal(rsvpSummary(rsvps, { ...opts, cap: 4 }).full, false);
  assert.equal(rsvpSummary(rsvps, opts).full, false); // no cap
  assert.equal(rsvpSummary(rsvps, { ...opts, me: null }).mine, null);
  assert.equal(rsvpSummary(rsvps, { ...opts, me: null }).going, 2); // logged out: "me" is just another hidden author
  assert.deepEqual(rsvpSummary(undefined, opts), { going: 0, interested: 0, notGoing: 0, mine: null, avatars: [], full: false });
});

test("events: dueReminders only for going/interested events starting in (now, now+lead], stable id", () => {
  const now = Date.parse("2026-12-05T12:00:00Z");
  const iso = (t: number) => new Date(t).toISOString();
  const list = [post("atNow", iso(now)), post("inLead", iso(now + 30 * 60_000)), post("edge", iso(now + REMINDER_LEAD_MS)), post("tooFar", iso(now + REMINDER_LEAD_MS + 1)), post("interested", iso(now + 10 * 60_000)), post("notGoing", iso(now + 10 * 60_000)), post("noRsvp", iso(now + 10 * 60_000))].map((p) => ({ post: p, window: eventWindow(p, "")! }));
  const mine: Record<string, RsvpStatus> = { atNow: "going", inLead: "going", edge: "going", tooFar: "going", interested: "interested", notGoing: "not_going" };
  const due = dueReminders(list, (e) => mine[e.post.id] ?? null, now);
  assert.deepEqual(due.map((n) => n.linkPostId), ["inLead", "edge", "interested"]);
  const n = due[0];
  assert.equal(n.id, "notif_event_host_inLead");
  assert.equal(n.id, eventReminderId("host", "inLead"));
  assert.equal(n.type, "event");
  assert.equal(n.from, "host");
  assert.equal(n.linkPostOwner, "host");
  assert.equal(n.read, false);
  assert.match(n.text, /30 min/);
  // the id does not change as time passes: recorded once
  assert.equal(dueReminders(list, (e) => mine[e.post.id] ?? null, now + 60_000)[0].id, n.id);
  // custom lead
  assert.deepEqual(dueReminders(list, (e) => mine[e.post.id] ?? null, now, 15 * 60_000).map((x) => x.linkPostId), ["interested"]);
});
