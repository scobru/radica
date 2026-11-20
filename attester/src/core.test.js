import test from "node:test";
import assert from "node:assert/strict";
import * as ed from "@noble/ed25519";
import { encodeProofToken } from "../../donate-app/src/lib.js";
import { judgeClaim, issueReceipt, signEntry, logEntryMessage, SCOPE_FIELD, bytesToHex } from "./core.js";

const CFG = { chainId: 84532, contract: "0xAbC", groups: { sprout: 7n, root: 8n, oak: 9n } };
const donor = "ab".repeat(32);
const proof = (over = {}) => ({ merkleTreeDepth: 1, merkleTreeRoot: "1", nullifier: "77", message: BigInt("0x" + donor).toString(), scope: SCOPE_FIELD, points: Array(8).fill("0"), ...over });
const entry = (token, author = donor) => ({ author, id: "x", ts: 1, sig: "", body: JSON.stringify({ type: "claim", token }) });
const tok = (o = {}) => encodeProofToken({ chainId: 84532, contract: "0xabc", tier: "root", groupId: 8n, proof: proof(), ...o });
const deps = (ok = true, seen = new Map()) => ({ ...CFG, seen, verifyOnChain: async () => ok });

test("accepts a valid claim for the proof's own key", async () => {
  assert.deepEqual(await judgeClaim(entry(tok()), deps()), { ok: true, donor, tier: "root", nullifier: "77" });
});

test("rejects claims the attester must not sign", async () => {
  const cases = [
    [entry(tok(), "cd".repeat(32)), deps(), /another Radica key/],
    [entry(tok({ groupId: 9n })), deps(), /group does not match/],
    [entry(tok({ chainId: 8453 })), deps(), /other chain/],
    [entry(tok({ proof: proof({ scope: "5" }) })), deps(), /wrong scope/],
    [entry(tok()), deps(false), /rejected on-chain/],
    [entry(tok()), deps(true, new Map([["77", "ee".repeat(32)]])), /another key/],
    [entry(tok({ proof: proof({ nullifier: "077" }) })), deps(), /bad proof nullifier/],
    [entry(tok({ proof: proof({ nullifier: "0x4d" }) })), deps(), /bad proof nullifier/],
    [entry(tok({ proof: proof({ nullifier: " 77 " }) })), deps(), /bad proof nullifier/],
    [entry(tok({ proof: proof({ points: Array(7).fill("0") }) })), deps(), /bad proof format/],
    [entry("garbage"), deps(), /bad token/],
  ];
  for (const [e, d, re] of cases) assert.match((await judgeClaim(e, d)).reason, re);
});

test("same donation can be attested again for the same key", async () => {
  assert.equal((await judgeClaim(entry(tok()), deps(true, new Map([["77", donor]])))).ok, true);
});

test("scope matches Semaphore's bytes32 string encoding", async () => {
  const { encodeBytes32String } = await import("../../donate-app/node_modules/ethers/lib.esm/index.js");
  assert.equal(SCOPE_FIELD, BigInt(encodeBytes32String("radica-supporter-v1")).toString());
});

test("receipts verify in Radica, log entries verify with the log contract's message", async () => {
  const { verifyReceipt } = await import("../../ui/src/supporter.ts");
  const sk = ed.utils.randomPrivateKey();
  const pk = bytesToHex(await ed.getPublicKeyAsync(sk));
  const r = await verifyReceipt(await issueReceipt(sk, donor, "oak"), donor, [pk]);
  assert.equal(r.tier, "oak");

  const e = await signEntry(sk, "supporter-receipts", "/app/", { a: 1 }, 1000);
  const msg = new TextEncoder().encode(logEntryMessage("supporter-receipts", "/app/", e.author, e.id, e.ts, e.body));
  assert.equal(await ed.verifyAsync(e.sig, msg, e.author), true);
});

test("log entry message matches Radica's formatLogEntryMessage", async () => {
  const { formatLogEntryMessage } = await import("../../ui/src/crypto.ts");
  // outside a browser Radica's appPath() is "", so compare with app ""
  assert.equal(logEntryMessage("supporter-claims", "", "aa", "id1", 5, "{}"), formatLogEntryMessage("supporter-claims", "aa", "id1", 5, "{}"));
});
