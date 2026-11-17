// Wallet addresses on a profile (the `wallets/<pubkey>` log): Lightning address, Monero, Bitcoin, EVM. Read from the
// network, so every address is checked by format before it is shown or put in a link.

export type WalletKind = "ln" | "xmr" | "btc" | "evm";
export type Wallets = Partial<Record<WalletKind, string>>;

export const WALLET_KINDS: { kind: WalletKind; label: string; icon: string; scheme: string; placeholder: string; re: RegExp }[] = [
  // LUD-16 lightning address (Spark, Breez, Alby, Wallet of Satoshi…)
  { kind: "ln", label: "Lightning", icon: "⚡", scheme: "lightning", placeholder: "you@walletofsatoshi.com", re: /^[a-z0-9._-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/ },
  // standard (95) or integrated (106) base58 address
  { kind: "xmr", label: "Monero", icon: "ɱ", scheme: "monero", placeholder: "4…", re: /^[48][1-9A-HJ-NP-Za-km-z]{94}(?:[1-9A-HJ-NP-Za-km-z]{11})?$/ },
  // bech32/bech32m (bc1…) or legacy base58 (1… / 3…)
  { kind: "btc", label: "Bitcoin", icon: "₿", scheme: "bitcoin", placeholder: "bc1…", re: /^(?:bc1[02-9ac-hj-np-z]{11,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/ },
  // Ethereum and every EVM chain (Base, Arbitrum, …)
  { kind: "evm", label: "Ethereum / EVM", icon: "Ξ", scheme: "ethereum", placeholder: "0x…", re: /^0x[0-9a-fA-F]{40}$/ },
];

/** `addr` as stored for `kind` (lightning addresses and bech32 lower-cased), or null when it is not one. */
export function normalizeWallet(kind: WalletKind, addr: unknown): string | null {
  if (typeof addr !== "string") return null;
  let a = addr.trim();
  if (kind === "ln" || (kind === "btc" && /^bc1/i.test(a))) a = a.toLowerCase();
  const spec = WALLET_KINDS.find((w) => w.kind === kind);
  return spec && spec.re.test(a) ? a : null;
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
