/** Viso's `key=v1` sign-in hands the derived app key back sealed, never in the clear (a URL ends up in browser history):
 *  we send a one-time X25519 public key (`epk`), Viso replies `#esk=<viso_epk_hex>.<ciphertext_hex>`.
 *  X25519 ECDH -> HKDF-SHA256(salt = viso_epk || our_epk, info) -> AES-256-GCM, all-zero nonce, no AAD
 *  with the signed challenge as AAD (see docs/dapp-integration.md in scobru/viso for the wire format and a test vector). */
import { x25519 } from "@noble/curves/ed25519.js";

const INFO = new TextEncoder().encode("viso connect v1 app secret");
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));

/** A fresh one-time keypair: send `pub` as `epk`, keep `priv` until the reply arrives. */
export function newEpk(): { priv: string; pub: string } {
  const priv = x25519.utils.randomSecretKey();
  return { priv: hex(priv), pub: hex(x25519.getPublicKey(priv)) };
}

/** Decrypt Viso's `esk` reply with the private half of the `epk` we sent. `challenge` is the signed `wd1.<app key>.<nonce>`
 *  from the callback: its nonce must be our epk (so the persona's signature covers the key we sent) and it is the AEAD
 *  associated data. Throws if the reply was not sealed to that key for that sign-in. */
export async function openEsk(esk: string, privHex: string, challenge: string): Promise<string> {
  const [vEpk, ct] = esk.split(".");
  if (!/^[0-9a-f]{64}$/i.test(vEpk ?? "") || !/^[0-9a-f]{96}$/i.test(ct ?? "") || !/^[0-9a-f]{64}$/i.test(privHex)) {
    throw new Error("malformed key from Viso");
  }
  const priv = unhex(privHex);
  if (!challenge.endsWith(`.${hex(x25519.getPublicKey(priv))}`)) throw new Error("Viso answered a different request");
  const shared = x25519.getSharedSecret(priv, unhex(vEpk));
  const salt = new Uint8Array([...unhex(vEpk), ...x25519.getPublicKey(priv)]);
  const ikm = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: INFO }, ikm, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  return hex(new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(12), additionalData: new TextEncoder().encode(challenge) }, key, unhex(ct))));
}
