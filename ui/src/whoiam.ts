import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { fromBase58, toBase58 } from "./base58.ts";
import { roomOwnerSk } from "./riverRooms.ts";

// Ensure noble ed25519 uses sha512
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
ed.etc.sha512Async = (...m) => Promise.resolve(sha512(ed.etc.concatBytes(...m)));

const enc = new TextEncoder();
const hex = (b: Uint8Array) => ed.etc.bytesToHex(b);
const unhex = (h: string) => ed.etc.hexToBytes(h);

export { fromBase58, toBase58 };

export const personaName = (pkHex: string): string => {
  try {
    return toBase58(unhex(pkHex));
  } catch {
    return pkHex.slice(0, 8);
  }
};

/** Message signed by Viso/whoiam: "whoiam-connect-v1" || pk || u32le len || base || u32le len || challenge || u64le ts */
export function connectMessage(pk: Uint8Array, base: string, challenge: string, ts: number): Uint8Array {
  const parts = [enc.encode("whoiam-connect-v1"), pk];
  for (const f of [base, challenge]) {
    const b = enc.encode(f);
    parts.push(new Uint8Array(new Uint32Array([b.length]).buffer), b);
  }
  parts.push(new Uint8Array(new BigUint64Array([BigInt(ts)]).buffer));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export interface Proof {
  pk: string;
  sig: string;
  ts: number;
  challenge: string;
  base: string;
}

export interface Cert {
  base: string;
  challenge: string;
  ts: number;
  sig: string;
}

export interface StoredSession {
  persona: string; // 32-byte hex pubkey
  type: "viso" | "local";
  cert?: Cert;
}

/** Verify signature from Viso or delegated key */
export async function verifyProof(l: Proof): Promise<boolean> {
  try {
    const rawPk = unhex(l.pk);
    const rawSig = unhex(l.sig);

    // 1. Try base as given
    const msg1 = connectMessage(rawPk, l.base, l.challenge, l.ts);
    if (await ed.verifyAsync(rawSig, msg1, rawPk)) {
      return true;
    }

    // 2. Try base without trailing slash
    const baseNoSlash = l.base.replace(/\/+$/, "");
    if (baseNoSlash !== l.base) {
      const msg2 = connectMessage(rawPk, baseNoSlash, l.challenge, l.ts);
      if (await ed.verifyAsync(rawSig, msg2, rawPk)) {
        return true;
      }
    }

    // 3. Try base with trailing slash
    const baseWithSlash = l.base.endsWith("/") ? l.base : l.base + "/";
    if (baseWithSlash !== l.base) {
      const msg3 = connectMessage(rawPk, baseWithSlash, l.challenge, l.ts);
      if (await ed.verifyAsync(rawSig, msg3, rawPk)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/** Official Viso web contract on Freenet */
export const VISO_KEY = "GzHy3jnEtj26EoGqMsBpoawcY378hK9kp91rTcNYiAac";
export const WHOIAM_KEY = VISO_KEY;

export const officialViso = (): string => {
  // served by a node (any host or port): stay on it. Only outside a node (e.g. Vite on 5173) assume the default local gateway.
  const onNode = location.port === "7509" || (location.pathname ?? "").includes("/v1/contract/");
  if (location.port && !onNode) {
    return `http://127.0.0.1:7509/v1/contract/web/${VISO_KEY}/`;
  }
  return `${location.protocol}//${location.host}/v1/contract/web/${VISO_KEY}/`;
};

const LINK_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

/** Our own base URL without query parameters */
/** Where Viso sends the answer back. Same path as `canonicalBase()`: Viso swaps in the canonical host only when
 * the two paths match, else it signs this URL, node host included ("…/index.html" or a missing "/" did that). */
export const linkBase = (): string =>
  `${location.protocol}//${location.host}${appPath()}`;

/** A certificate signed for the node's own address (an old Viso, or a sign-in before the canonical base): that
 * address is published with everything it signs. */
export const certShowsHost = (c?: Cert): boolean => {
  try {
    return !!c && new URL(c.base).host !== "127.0.0.1:7509";
  } catch {
    return false;
  }
};

/** What Viso is asked to sign: the fixed default node host plus our path. The certificate is published with every
 * record and only its path matters to the contracts, so the user's own node host stays out of it. */
export const canonicalBase = (): string => `http://127.0.0.1:7509${appPath()}`;

/** The path Radica is served at (`/v1/contract/web/<key>/`): Viso delegations and the contracts are bound to it. */
/** Where the node serves the published Radica: its path is part of every contract's parameters. */
export const RADICA_APP_PATH = "/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/";

export const appPath = (): string => {
  // Radica not served by the node (the terminal chat in Node, "Open without Freenet" in the apps): the published app's
  // contracts, or it would read and write logs no one else sees
  if (typeof location === "undefined" || location.protocol === "radica:" || /^radica\.local(host)?$/.test(location.hostname))
    return RADICA_APP_PATH;
  // same app, same contracts: "…/<key>", "…/<key>/" and "…/<key>/index.html" must not become different networks
  const m = /^\/v1\/contract\/web\/[^/]+/.exec(location.pathname);
  return m ? `${m[0]}/` : location.pathname;
};

import { safeStorage, takeHandedKey } from "./storage.ts";

let appKey: Promise<Uint8Array> | undefined;

/** Persistent app key secret for delegating actions: kept by the node's identity delegate, else in page storage. */
export function getAppKeySecret(): Promise<Uint8Array> {
  return (appKey ??= (async () => {
    let own = safeStorage.getItem("radica_app_key") || safeStorage.getItem("spruce_app_key");
    if (!own || own.length !== 64) own = hex(ed.utils.randomPrivateKey());
    const skHex = (await import("./delegate.ts").then((m) => m.nodeAppKey(own), () => null)) ?? own; // the node's key wins: it survives the Viso redirect
    safeStorage.setItem("radica_app_key", skHex);
    return unhex(skHex);
  })());
}

/** Make `skHex` (Viso's shared key) this device's app key; the key it replaces is kept for reading old messages, and
 *  each River room I am in keeps the key it knows me by (it was derived from the old app key). */
async function useAppKey(skHex: string, persona: string): Promise<void> {
  const old = hex(await getAppKeySecret());
  if (old === skHex) return;
  const m = await import("./delegate.ts").catch(() => null);
  const rooms: { id?: string; river?: unknown; creator?: string; members?: string[] }[] = [];
  for (const raw of [safeStorage.getItem("freenet_private_rooms"), await m?.nodeGet(`privrooms:${persona}`)])
    try {
      rooms.push(...JSON.parse(raw || "[]"));
    } catch {}
  for (const r of rooms) {
    if (!r?.river || typeof r.id !== "string" || !r.members?.includes(persona) || safeStorage.getItem(`river_key_${r.id}`) || (await m?.nodeGet(`river-key:${r.id}`))) continue;
    const k = r.creator === persona ? hex(roomOwnerSk(unhex(old), r.id)) : old;
    safeStorage.setItem(`river_key_${r.id}`, k);
    await m?.nodePut(`river-key:${r.id}`, k);
  }
  const kept: string[] = [
    ...JSON.parse(safeStorage.getItem("radica_read_keys") || "[]"),
    ...JSON.parse((await m?.nodeGet("read-keys")) || "[]"),
  ];
  const keys = [...new Set([...kept, old])];
  safeStorage.setItem("radica_read_keys", JSON.stringify(keys));
  safeStorage.setItem("radica_app_key", skHex);
  appKey = Promise.resolve(unhex(skHex));
  await m?.nodePut("read-keys", JSON.stringify(keys));
  await m?.nodeReplaceAppKey(skHex);
}

/** Return the app public key in hex */
export async function getAppKeyPubkey(): Promise<string> {
  const sk = await getAppKeySecret();
  return hex(await ed.getPublicKeyAsync(sk));
}

/** Build Viso sign-in redirect URL */
export async function startSignIn(visoUrl: string): Promise<string> {
  const u = new URL(visoUrl);
  const isAllowedHost =
    u.host === location.host ||
    u.host === "127.0.0.1:7509" ||
    u.host === "localhost:7509";

  if (!isAllowedHost || !/^\/v[12]\/contract\/web\/[^/]+\/?$/.test(u.pathname)) {
    throw new Error(
      "Please enter the address of your Viso site on this node (e.g. http://127.0.0.1:7509/v1/contract/web/GzHy3jnEtj26EoGqMsBpoawcY378hK9kp91rTcNYiAac/)."
    );
  }
  const appKeyHex = await getAppKeyPubkey();
  let nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  let key = "";
  let epkPriv = "";
  if (!safeStorage.getItem("radica_viso_nokey")) {
    const { newEpk } = await import("./visoSeal.ts");
    const epk = newEpk(); // Viso seals the key to this one-time public key; the private half waits here for the reply
    epkPriv = epk.priv;
    safeStorage.setItem("radica_viso_epriv", epk.priv);
    nonce = epk.pub; // Viso requires the epk as the nonce: the persona's signature over the challenge then covers it
    key = `&key=v1&epk=${epk.pub}`;
  }
  const challenge = `wd1.${appKeyHex}.${nonce}`;

  safeStorage.setItem("radica_signin_pending", challenge);
  safeStorage.setItem("radica_viso_url", u.origin + u.pathname);
  if (typeof window !== "undefined") {
    const syncDelegate = import("./delegate.ts").then(async (m) => {
      await m.nodePut("signin-pending", challenge);
      if (epkPriv) await m.nodePut("viso-epriv", epkPriv);
    }, () => {});
    await Promise.race([syncDelegate, new Promise<void>((r) => setTimeout(r, 1500))]);
  }

  // key=v1: Viso hands back the app key it derives from the persona and this app, the same on every device, so
  // direct messages to me read everywhere (a Viso that does not hand it over is asked the old way next time)
  return `${u.origin}${u.pathname}?connect=v1&challenge=${challenge}&return=${encodeURIComponent(linkBase())}&base=${encodeURIComponent(canonicalBase())}${key}`;
}

/** Handle return callback from Viso */
/** Check Viso's answer and keep the session. `replayed`: the URL was the callback of a sign-in already done (a reload). */
export async function finishSignIn(q: URLSearchParams): Promise<{ persona: string; replayed: boolean }> {
  if (q.get("viso") === "denied" || q.get("whoiam") === "denied") {
    throw new Error("You chose not to share a persona in Viso.");
  }
  let pending = safeStorage.getItem("radica_signin_pending") || safeStorage.getItem("spruce_signin_pending");
  safeStorage.removeItem("radica_signin_pending");
  safeStorage.removeItem("spruce_signin_pending");
  if (!pending && typeof window !== "undefined") {
    pending = await import("./delegate.ts").then((m) => m.nodeGet("signin-pending"), () => null);
  }
  if (typeof window !== "undefined") {
    void import("./delegate.ts").then((m) => m.nodePut("signin-pending", ""), () => {});
  }

  const sharedKey = await takeHandedKey(q.get("challenge") ?? ""); // first: a replayed callback must not leave it lying around either
  const persona = q.get("pk") ?? "";
  const cert: Cert = {
    base: canonicalBase(),
    challenge: q.get("challenge") ?? "",
    ts: Number(q.get("ts")),
    sig: q.get("sig") ?? "",
  };

  // A reload replays the callback URL of a sign-in already done (the shell keeps it): that persona is signed in, no error.
  const done = (raw: string | null) => {
    try {
      const s = JSON.parse(raw ?? "");
      return s?.persona === persona && !!cert.sig && s?.cert?.sig === cert.sig;
    } catch {
      return false;
    }
  };
  if (done(safeStorage.getItem("radica_session"))) return { persona, replayed: true };
  const saved = typeof window !== "undefined"
    ? await import("./delegate.ts").then((m) => m.nodeGet("viso-session"), () => null) // page storage may be reset
    : null;
  if (done(saved)) {
    safeStorage.setItem("radica_session", saved!);
    return { persona, replayed: true };
  }

  if (!Number.isFinite(cert.ts) || Math.abs(Date.now() - cert.ts) > LINK_MAX_AGE_MS) {
    throw new Error("The sign-in request expired or system clock is out of sync. Please try again.");
  }
  const nonceOf = (c: string) => c.split(".").pop();
  // Unconditionally require a single-use matching pending challenge (prevents login CSRF even in sandboxed browsers).
  if (!pending || !/^wd1\.[0-9a-f]{64}\.[0-9a-f]+$/i.test(cert.challenge) || nonceOf(cert.challenge) !== nonceOf(pending)) {
    throw new Error("This sign-in is unknown or was already used. Please start again from the Identity panel.");
  }
  const delegated = cert.challenge.split(".")[1];
  if (sharedKey) {
    if (hex(await ed.getPublicKeyAsync(unhex(sharedKey))) !== delegated) throw new Error("The key Viso handed over does not match its signature. Please start the sign-in again.");
  } else if (delegated !== (await getAppKeyPubkey())) {
    safeStorage.setItem("radica_viso_nokey", "1"); // asked for Viso's key and got none (a Viso without key=v1, or the key was lost on the way): the old way next time
    throw new Error("Viso did not hand over the app key, or this device's key changed. Please start the sign-in again.");
  }
  let valid = await verifyProof({ ...cert, pk: persona });
  if (!valid) {
    // a Viso that predates `base` signed our own origin+path: it works, but that cert shows the node host
    cert.base = linkBase();
    valid = await verifyProof({ ...cert, pk: persona });
  }
  if (!valid) {
    throw new Error("Viso persona cryptographic signature failed to verify.");
  }

  if (sharedKey) await useAppKey(sharedKey, persona);
  const session: StoredSession = { persona, type: "viso", cert };
  safeStorage.setItem("radica_session", JSON.stringify(session));
  void import("./delegate.ts").then((m) => m.nodePut("viso-session", JSON.stringify(session))); // like local-seed: survives cleared page storage (delegate keys take no '_')
  return { persona, replayed: false };
}

/** Create or import an Ed25519 local keypair */
export async function createLocalIdentity(secretHex?: string): Promise<string> {
  const sk = secretHex?.replace(/\s/g, "").toLowerCase() || hex(ed.utils.randomPrivateKey());
  if (!/^[0-9a-f]{64}$/.test(sk)) {
    throw new Error("The private key must be exactly 64 hexadecimal characters.");
  }

  const persona = hex(await ed.getPublicKeyAsync(unhex(sk)));
  const appKeyHex = await getAppKeyPubkey();
  const cert: Cert = {
    base: canonicalBase(),
    challenge: `wd1.${appKeyHex}.${hex(crypto.getRandomValues(new Uint8Array(16)))}`,
    ts: Date.now(),
    sig: "",
  };
  cert.sig = hex(
    await ed.signAsync(
      connectMessage(unhex(persona), cert.base, cert.challenge, cert.ts),
      unhex(sk)
    )
  );

  safeStorage.setItem("radica_ed25519_seed", sk);
  await import("./delegate.ts").then((m) => Promise.all([m.nodePut("local-seed", sk), m.nodePut("viso-session", "")]), () => {}); // survives refresh, new tabs and cleared page storage
  const session: StoredSession = { persona, type: "local", cert };
  safeStorage.setItem("radica_session", JSON.stringify(session));
  return persona;
}

/** Get the secret key of the local persona (null if signed in via Viso) */
export function localIdentityKey(): string | null {
  return safeStorage.getItem("radica_ed25519_seed") || safeStorage.getItem("spruce_ed25519_seed") || null;
}

/** Get active session if any */
export function getStoredSession(): StoredSession | null {
  const raw = safeStorage.getItem("radica_session") || safeStorage.getItem("spruce_session");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

/** Sign out from current identity */
export async function signOut(): Promise<void> {
  // awaited: a restart before the node forgot the session would sign me straight back in
  await import("./delegate.ts").then(
    (m) => Promise.all([m.nodePut("local-seed", ""), m.nodePut("viso-session", ""), m.nodePut("signin-pending", ""), m.nodePut("viso-epriv", "")]),
    () => {},
  );
  safeStorage.removeItem("radica_session");
  safeStorage.removeItem("radica_ed25519_seed");
  safeStorage.removeItem("radica_signin_pending");
  safeStorage.removeItem("radica_viso_epriv");
  safeStorage.removeItem("spruce_session");
  safeStorage.removeItem("spruce_ed25519_seed");
}

/** Start Radica again from its plain address. Inside Freenet the shell page does it: reloading the sandboxed frame
 *  itself is refused ("connection refused"), and its address may still carry an old Viso callback. */
export const restart = (): void => goTo(linkBase());

/** Open external or node-shell page safely */
export const goTo = (href: string) => {
  if (window.parent !== window) {
    const targetOrigin = typeof location !== "undefined" && location.origin && location.origin !== "null" ? location.origin : "*";
    parent.postMessage({ __freenet_shell__: true, type: "navigate", href }, targetOrigin);
  } else {
    location.href = href;
  }
};
