// Contact card (see CONTEXT.md): my persona key, the key I decrypt with and my name as one line of text
// (`radica:c1:<pubkey>:<enc_pub>:<name>`), handed over in person (paste, QR) so a chat can start with no network: offline
// the other side has no way to read my profile, and without my enc_pub a Viso persona could not open what they send.

export interface ContactCard {
  pubkey: string;
  encPub: string;
  name: string;
}

const PREFIX = "radica:c1:";
const HEX64 = /^[0-9a-f]{64}$/;
const MAX_NAME = 64;
const cardsKey = (me: string) => `radica_contact_cards_${me}`;

export function contactCardText(c: ContactCard): string {
  return `${PREFIX}${c.pubkey}:${c.encPub}:${encodeURIComponent(c.name.slice(0, MAX_NAME))}`;
}

/** A card from pasted or scanned text, or null. */
export function parseContactCard(text: string): ContactCard | null {
  const t = text.trim();
  if (!t.startsWith(PREFIX)) return null;
  const [pubkey = "", encPub = "", rawName = ""] = t.slice(PREFIX.length).split(":");
  if (!HEX64.test(pubkey) || !HEX64.test(encPub)) return null;
  let name = "";
  try {
    name = decodeURIComponent(rawName).slice(0, MAX_NAME);
  } catch {}
  return { pubkey, encPub, name };
}

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export function readContactCards(store: Store, me: string): Record<string, ContactCard> {
  try {
    const raw = JSON.parse(store.getItem(cardsKey(me)) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

export function saveContactCard(store: Store, me: string, c: ContactCard): void {
  if (!me || c.pubkey === me) return;
  store.setItem(cardsKey(me), JSON.stringify({ ...readContactCards(store, me), [c.pubkey]: c }));
}

/** My card as a QR code (an SVG string), black on white so any camera reads it. */
export async function contactCardQrSvg(c: ContactCard): Promise<string> {
  const { renderSVG } = await import("uqr");
  return renderSVG(contactCardText(c), { ecc: "M", border: 2 });
}

/** The text of the first QR code in a photo, or null. Big photos are scaled down first: a phone camera's 12 MP is slow. */
export async function readQrFromImage(file: Blob): Promise<string | null> {
  const { default: jsQR } = await import("jsqr");
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const ctx = Object.assign(document.createElement("canvas"), { width: w, height: h }).getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return jsQR(ctx.getImageData(0, 0, w, h).data, w, h)?.data ?? null;
}
