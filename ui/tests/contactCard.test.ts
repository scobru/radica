import test from "node:test";
import assert from "node:assert/strict";
import { contactCardText, parseContactCard, readContactCards, saveContactCard } from "../src/contactCard.ts";

const pk = "a".repeat(64);
const enc = "b".repeat(64);

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

test("contactCard: text round-trips, names with colons and accents survive", () => {
  const card = { pubkey: pk, encPub: enc, name: "Zoë: la radice" };
  assert.deepEqual(parseContactCard(`  ${contactCardText(card)}\n`), card);
});

test("contactCard: rejects anything that is not a valid card", () => {
  assert.equal(parseContactCard(pk), null);
  assert.equal(parseContactCard(`radica:c1:${pk}:xyz:Bob`), null);
  assert.equal(parseContactCard(`radica:c1:${"A".repeat(64)}:${enc}:Bob`), null);
  assert.equal(parseContactCard(`radica:c2:${pk}:${enc}:Bob`), null);
  assert.equal(parseContactCard(`radica:c1:${pk}:${enc}:%E0%A4%A`)?.name, ""); // broken escape: no name, card still valid
});

test("contactCard: saved per persona, never my own", () => {
  const s = memStore();
  saveContactCard(s, "me", { pubkey: pk, encPub: enc, name: "Bob" });
  saveContactCard(s, "me", { pubkey: "me", encPub: enc, name: "Me" });
  assert.deepEqual(Object.keys(readContactCards(s, "me")), [pk]);
  assert.deepEqual(readContactCards(s, "other"), {});
});
