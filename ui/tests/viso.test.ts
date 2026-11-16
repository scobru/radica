import test from "node:test";
import assert from "node:assert/strict";
import { constants as cryptoConstants, generateKeyPairSync, randomBytes, sign as cryptoSign } from "node:crypto";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { challengeBytes, grind, makeProof } from "../src/ante.ts";
import { toBase58 } from "../src/base58.ts";
import { cborEncode } from "../src/cbor.ts";
import {
  VISO_ANTE_PURPOSE,
  anteTierOf,
  delegationMsg,
  parseStoredPoh,
  pohMsg,
  serializeStoredPoh,
  verifiedDelegations,
  verifiedPohBadges,
  verifiedPohBadgesByAuthor,
  verifiedPohs,
  verifyVisoDelegation,
  verifyVisoPoh,
  visoAnteBits,
  visoIdentityInstance,
  visoIdentityParams,
  visoPohOf,
  visoPohRawOf,
  visoProfileOf,
  type DelegationProofV1,
  type PohIssuer,
} from "../src/viso.ts";

if (!ed.etc.sha512Sync) ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
if (!ed.etc.sha512Async) ed.etc.sha512Async = (...m) => Promise.resolve(sha512(ed.etc.concatBytes(...m)));

// made with Viso's own code (viso-core: sign_slot, to_cbor, ContractKey::from_params_and_code), signing key [7; 32]
const PK = "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c";
const INSTANCE = "eb1b8fefa88eee7bbb78817e1d293d72b6d604cfbe1155ea4b68bcfa42c523c6"; // base58: GpmBjuWwjPY8kZu4dEg1vE6pw9ZDnyrDcx5waUQDYVRo
const STATE = "a265736c6f7473a16770726f66696c65a36774696d655f6d731b0000018bcfe5680065627974657356a2646e616d6568416461205669736f6362696f62686963736967984018b7185d1894184718c81862183418561118870b18b8186518f0188f18b5184d184a1839183a186618b2186d189e18ed184f18b418381860183e18e0185418650e18d218d6182818fe183f18c218641848181f18e7182d1886183a182c0f18cb18c3186a18ea183f183f18271855182b1838182418c718f4189e0b6964657374726f796564f6";
const bytes = (h: string) => Uint8Array.from(Buffer.from(h, "hex"));

test("viso: a persona's identity contract address is the one Viso derives", () => {
  assert.equal(Buffer.from(visoIdentityParams(PK)).toString("hex"), `a26776657273696f6e01667075626b65795820${PK}`);
  assert.equal(Buffer.from(visoIdentityInstance(PK)).toString("hex"), INSTANCE);
});

test("viso: the profile is read only when the persona's signature checks out", async () => {
  assert.deepEqual(await visoProfileOf(bytes(STATE), PK), { name: "Ada Viso", bio: "hi" });
  const tampered = bytes(STATE.replace("416461205669736f", "457665205669736f")); // "Ada Viso" -> "Eve Viso"
  assert.equal(await visoProfileOf(tampered, PK), null);
  assert.equal(await visoProfileOf(bytes(STATE), "00".repeat(32)), null); // someone else's key
  assert.equal(await visoProfileOf(new Uint8Array(), PK), null);
});

test("viso poh: verifies RSABSSA-SHA384-PSS-Randomized attestations and rejects wrong persona, wrong issuer, or tampered tier", async () => {
  const kp1 = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const kp2 = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const issuers: PohIssuer[] = [
    { keyId: "github:age1y:2026", provider: "github", tier: "age1y", epoch: "2026", spkiDerHex: Buffer.from(kp1.publicKey).toString("hex") },
    { keyId: "github:dev1y:2026", provider: "github", tier: "dev1y", epoch: "2026", spkiDerHex: Buffer.from(kp2.publicKey).toString("hex") },
  ];

  const msgRandomizer = new Uint8Array(randomBytes(32));
  const msg = pohMsg("github:age1y:2026", PK);
  const input = Buffer.concat([msgRandomizer, msg]);
  const sig = new Uint8Array(
    cryptoSign("sha384", input, {
      key: kp1.privateKey,
      padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
      saltLength: 48,
    }),
  );

  const attBytes = cborEncode({
    version: 1,
    key_id: "github:age1y:2026",
    msg_randomizer: msgRandomizer,
    sig,
  });

  // Valid slot verification
  assert.deepEqual(await verifyVisoPoh(attBytes, PK, issuers), {
    provider: "github",
    tier: "age1y",
    epoch: "2026",
    keyId: "github:age1y:2026",
  });

  // Identity contract state scanning (live vs destroyed)
  const pohState = cborEncode({
    slots: { "poh:github": { time_ms: 1700000000000, bytes: attBytes, sig: new Uint8Array(64) } },
    destroyed: null,
  });
  assert.deepEqual(visoPohRawOf(pohState), attBytes);
  assert.deepEqual(await visoPohOf(pohState, PK, issuers), [
    { provider: "github", tier: "age1y", epoch: "2026", keyId: "github:age1y:2026" },
  ]);

  const destroyedState = cborEncode({
    slots: { "poh:github": { time_ms: 1700000000000, bytes: attBytes, sig: new Uint8Array(64) } },
    destroyed: { time_ms: 1700000000001, sig: new Uint8Array(64) },
  });
  assert.equal(visoPohRawOf(destroyedState), null);
  assert.deepEqual(await visoPohOf(destroyedState, PK, issuers), []);

  // Anti-transfer: bound to PK, fails on another persona
  assert.equal(await verifyVisoPoh(attBytes, "11".repeat(32), issuers), null);

  // Anti-spoof: rewriting key_id fails signature verification under kp2
  const spoofed = cborEncode({ version: 1, key_id: "github:dev1y:2026", msg_randomizer: msgRandomizer, sig });
  assert.equal(await verifyVisoPoh(spoofed, PK, issuers), null);

  // Unpinned / revoked issuer is rejected
  assert.equal(await verifyVisoPoh(attBytes, PK, []), null);

  // Batch log verification (verifiedPohs)
  const other = "22".repeat(32);
  const proofHex = Buffer.from(attBytes).toString("hex");
  assert.deepEqual(
    await verifiedPohs(
      [
        { author: PK, proof: proofHex },
        { author: other, proof: proofHex }, // stolen proof bound to PK
        { author: "33".repeat(32), proof: null },
      ],
      issuers,
    ),
    [PK],
  );
});

test("viso delegation: verifies dual-signed DelegationProofV1 and inherited PoH badge", async () => {
  const fromSk = ed.utils.randomPrivateKey();
  const fromPk = await ed.getPublicKeyAsync(fromSk);
  const fromHex = ed.etc.bytesToHex(fromPk);
  const toSk = ed.utils.randomPrivateKey();
  const toPk = await ed.getPublicKeyAsync(toSk);
  const toHex = ed.etc.bytesToHex(toPk);

  const timeMs = 1_794_781_500_000;
  const msg = delegationMsg(fromPk, toPk, "*", timeMs);
  const sigFrom = ed.etc.bytesToHex(await ed.signAsync(msg, fromSk));
  const sigTo = ed.etc.bytesToHex(await ed.signAsync(msg, toSk));

  const proof: DelegationProofV1 = {
    version: 1,
    from: toBase58(fromPk),
    to: toBase58(toPk),
    scope: "*",
    time_ms: timeMs,
    sig_from: sigFrom,
    sig_to: sigTo,
  };

  const ok = await verifyVisoDelegation(JSON.stringify(proof), fromHex);
  assert.ok(ok);
  assert.equal(ok.fromHex, fromHex);
  assert.equal(ok.toHex, toHex);
  assert.equal(ok.scope, "*");

  // Reject wrong expected source, tampered signature, self-delegation, or foreign scope
  assert.equal(await verifyVisoDelegation(proof, toHex), null);
  assert.equal(await verifyVisoDelegation({ ...proof, sig_to: "00".repeat(64) }, fromHex), null);
  assert.equal(await verifyVisoDelegation({ ...proof, scope: "other-app" }, fromHex), null);
  assert.equal(await verifyVisoDelegation({ ...proof, to: proof.from }, fromHex), null);

  // Batch delegation map
  const delMap = await verifiedDelegations([
    { author: fromHex, proof },
    { author: toHex, proof }, // mismatched author != proof.from
  ]);
  assert.equal(delMap.size, 1);
  assert.equal(delMap.get(fromHex)?.toHex, toHex);

  // Inherited GitHub PoH bound to `toPk` verified for `fromHex` via `proof`
  const kp = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const issuers: PohIssuer[] = [
    { keyId: "github:age1y:2026", provider: "github", tier: "age1y", epoch: "2026", spkiDerHex: Buffer.from(kp.publicKey).toString("hex") },
  ];
  const msgRandomizer = new Uint8Array(randomBytes(32));
  const pMsg = pohMsg("github:age1y:2026", toHex);
  const sig = new Uint8Array(
    cryptoSign("sha384", Buffer.concat([msgRandomizer, pMsg]), {
      key: kp.privateKey,
      padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
      saltLength: 48,
    }),
  );
  const attHex = Buffer.from(
    cborEncode({ version: 1, key_id: "github:age1y:2026", msg_randomizer: msgRandomizer, sig }),
  ).toString("hex");

  const badges = await verifiedPohBadges(
    [
      { author: fromHex, proof: attHex, delegation: proof }, // valid delegated PoH
      { author: "44".repeat(32), proof: attHex, delegation: proof }, // mismatched author
    ],
    issuers,
  );
  assert.equal(badges.size, 1);
  assert.equal(badges.get(fromHex)?.provider, "github");

  // Storage serialization round-trip (both raw legacy and delegated JSON)
  assert.deepEqual(parseStoredPoh("aabbcc"), { proof: "aabbcc" });
  const serialized = serializeStoredPoh(attHex, proof);
  assert.deepEqual(parseStoredPoh(serialized), { proof: attHex, delegation: proof });
});

test("viso ante: maps commitment bit tiers and verifies ante slot proofs", async () => {
  assert.equal(anteTierOf(15), null);
  assert.equal(anteTierOf(16)?.label, "Seeded");
  assert.equal(anteTierOf(19)?.id, "bronze");
  assert.equal(anteTierOf(20)?.label, "Forged");
  assert.equal(anteTierOf(23)?.id, "silver");
  assert.equal(anteTierOf(24)?.label, "Veteran");
  assert.equal(anteTierOf(32)?.id, "gold");

  const sk = ed.utils.randomPrivateKey();
  const pk = await ed.getPublicKeyAsync(sk);
  const pkHex = ed.etc.bytesToHex(pk);
  const nonce = await grind(challengeBytes(VISO_ANTE_PURPOSE, pk), 8);
  const anteBytes = await makeProof(sk, VISO_ANTE_PURPOSE, nonce, 1_794_790_000_000);
  const state = cborEncode({ slots: { ante: { bytes: anteBytes, time_ms: 1_794_790_000_000, sig: new Uint8Array(64) } } });

  const bits = await visoAnteBits(state, pkHex);
  assert.ok(bits !== null && bits >= 8);

  // Rejects wrong persona key, foreign purpose, or destroyed persona state
  assert.equal(await visoAnteBits(state, "11".repeat(32)), null);
  const badPurpose = await makeProof(sk, "ante:identity-level:v1", nonce, 1_794_790_000_000);
  assert.equal(await visoAnteBits(cborEncode({ slots: { ante: { bytes: badPurpose } } }), pkHex), null);
  assert.equal(await visoAnteBits(cborEncode({ destroyed: { time_ms: 1 }, slots: { ante: { bytes: anteBytes } } }), pkHex), null);
});

test("viso poh google: verifies google:verified issuer and preserves multiple providers per author", async () => {
  const sk = ed.utils.randomPrivateKey();
  const pk = await ed.getPublicKeyAsync(sk);
  const pkHex = ed.etc.bytesToHex(pk);

  const kpGh = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const kpGoog = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const issuers: PohIssuer[] = [
    { keyId: "github:age1y:2026", provider: "github", tier: "age1y", epoch: "2026", spkiDerHex: Buffer.from(kpGh.publicKey).toString("hex") },
    { keyId: "google:verified:2026", provider: "google", tier: "verified", epoch: "2026", spkiDerHex: Buffer.from(kpGoog.publicKey).toString("hex") },
  ];

  const signSlotHex = (keyId: string, privateKey: typeof kpGoog.privateKey) => {
    const r = new Uint8Array(randomBytes(32));
    const sig = new Uint8Array(
      cryptoSign("sha384", Buffer.concat([r, pohMsg(keyId, pkHex)]), {
        key: privateKey,
        padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
        saltLength: 48,
      }),
    );
    return Buffer.from(cborEncode({ version: 1, key_id: keyId, msg_randomizer: r, sig })).toString("hex");
  };

  const ghHex = signSlotHex("github:age1y:2026", kpGh.privateKey);
  const googHex = signSlotHex("google:verified:2026", kpGoog.privateKey);
  const googRaw = Buffer.from(googHex, "hex");
  const verifiedGoogle = await verifyVisoPoh(googRaw, pkHex, issuers);
  assert.deepEqual(verifiedGoogle, { provider: "google", tier: "verified", epoch: "2026", keyId: "google:verified:2026" });

  // Slot discovery works for poh:google as well as poh:github
  const state = cborEncode({
    slots: {
      "poh:google": { bytes: googRaw },
      "poh:github": { bytes: Buffer.from(ghHex, "hex") },
    },
  });
  const found = await visoPohOf(state, pkHex, issuers);
  assert.deepEqual(found.map((b) => b.provider).sort(), ["github", "google"]);

  const byAuthor = await verifiedPohBadgesByAuthor(
    [
      { author: pkHex, proof: ghHex },
      { author: pkHex, proof: googHex },
    ],
    issuers,
  );
  assert.deepEqual((byAuthor.get(pkHex) ?? []).map((b) => b.provider).sort(), ["github", "google"]);
});
