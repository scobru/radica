// Wallet addresses on a profile (the `wallets/<pubkey>` log): Lightning address, Monero, Bitcoin, EVM. Read from the
// network, so every address is checked by format before it is shown or put in a link.

export type WalletKind = "ln" | "xmr" | "btc" | "evm";
export type Wallets = Partial<Record<WalletKind, string>>;

export const WALLET_KINDS: { kind: WalletKind; label: string; icon: string; scheme: string; placeholder: string; re: RegExp }[] = [
  // LUD-16 lightning address (Spark, Breez, Alby, Wallet of Satoshi…)
  { kind: "ln", label: "Lightning", icon: "⚡", scheme: "lightning", placeholder: "you@walletofsatoshi.com", re: /^[a-z0-9._-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/ },
  // standard/integrated on read; Edit Profile requires an 8… subaddress (95 base58 chars) on save
  { kind: "xmr", label: "Monero", icon: "ɱ", scheme: "monero", placeholder: "8… (subaddress)", re: /^[48][1-9A-HJ-NP-Za-km-z]{94}(?:[1-9A-HJ-NP-Za-km-z]{11})?$/ },
  // Silent Payments BIP-352 (sp1q…), bech32/bech32m (bc1…), or legacy base58 (1… / 3…)
  { kind: "btc", label: "Bitcoin", icon: "₿", scheme: "bitcoin", placeholder: "sp1… (Silent Payment) or bc1…", re: /^(?:sp1q[02-9ac-hj-np-z]{112}|bc1[02-9ac-hj-np-z]{11,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/ },
  // Ethereum and every EVM chain (Base, Arbitrum, …)
  { kind: "evm", label: "Ethereum / EVM", icon: "Ξ", scheme: "ethereum", placeholder: "0x…", re: /^0x[0-9a-fA-F]{40}$/ },
];

const MONERO_PRIMARY_RE = /^4[1-9A-HJ-NP-Za-km-z]{94}(?:[1-9A-HJ-NP-Za-km-z]{11})?$/;
const MONERO_SUBADDRESS_RE = /^8[1-9A-HJ-NP-Za-km-z]{94}$/;

/** Whether `addr` is a Monero primary/integrated address (`4…`) rather than a privacy-preserving subaddress (`8…`). */
export function isMoneroPrimaryAddress(addr: unknown): boolean {
  return typeof addr === "string" && MONERO_PRIMARY_RE.test(addr.trim());
}

/** `addr` as stored for `kind` (lightning addresses and bech32/BIP-352 lower-cased), or null when it is not one. */
export function normalizeWallet(kind: WalletKind, addr: unknown): string | null {
  if (typeof addr !== "string") return null;
  let a = addr.trim();
  if (kind === "ln" || (kind === "btc" && /^(?:bc1|sp1)/i.test(a))) a = a.toLowerCase();
  const spec = WALLET_KINDS.find((w) => w.kind === kind);
  return spec && spec.re.test(a) ? a : null;
}

/** Validate a user-entered wallet address before saving; rejects Monero primary (`4…`) addresses in favor of `8…` subaddresses. */
export function validateWalletForSave(kind: WalletKind, raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (kind === "xmr") {
    if (isMoneroPrimaryAddress(trimmed)) {
      return "For privacy, use a Monero subaddress (starts with 8…) instead of your primary address (4…).";
    }
    if (!MONERO_SUBADDRESS_RE.test(trimmed)) {
      return "That is not a valid Monero subaddress (must start with 8 and be 95 characters).";
    }
    return null;
  }
  if (!normalizeWallet(kind, trimmed)) {
    const label = WALLET_KINDS.find((w) => w.kind === kind)!.label;
    return `That is not a valid ${label} address.`;
  }
  return null;
}

/** The valid addresses of `raw` (a log entry or the editor's fields); anything else is dropped. */
export function cleanWallets(raw: unknown): Wallets {
  const out: Wallets = {};
  if (!raw || typeof raw !== "object") return out;
  for (const { kind } of WALLET_KINDS) {
    const a = normalizeWallet(kind, (raw as Record<string, unknown>)[kind]);
    if (a) out[kind] = a;
  }
  return out;
}

/** The wallet app link for an address (`lightning:`, `monero:`, `bitcoin:`, `ethereum:`). */
export function walletUri(kind: WalletKind, addr: string): string {
  return `${WALLET_KINDS.find((w) => w.kind === kind)!.scheme}:${addr}`;
}
