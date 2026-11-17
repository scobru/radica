import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanWallets, normalizeWallet, walletUri } from "../src/wallets.ts";

const XMR = "4" + "A".repeat(94);
const ETH = "0x" + "aB".repeat(20);

test("wallets: each kind accepts its format and normalizes case where the format is case-free", () => {
  assert.equal(normalizeWallet("ln", " Me@Breez.Tips "), "me@breez.tips");
  assert.equal(normalizeWallet("xmr", XMR), XMR);
  assert.equal(normalizeWallet("xmr", XMR + "B".repeat(11)), XMR + "B".repeat(11), "integrated address");
  assert.equal(normalizeWallet("btc", "BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ"), "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq");
  assert.equal(normalizeWallet("btc", "1BoatSLRHtKNngkdXEeobR76b53LETtpyT"), "1BoatSLRHtKNngkdXEeobR76b53LETtpyT");
  assert.equal(normalizeWallet("evm", ETH), ETH);
});

test("wallets: anything that is not an address is dropped, so no link can carry it", () => {
  assert.equal(normalizeWallet("ln", "javascript:alert(1)"), null);
  assert.equal(normalizeWallet("ln", "me@localhost"), null);
  assert.equal(normalizeWallet("xmr", XMR.slice(1)), null);
  assert.equal(normalizeWallet("btc", "bc1qO0"), null);
  assert.equal(normalizeWallet("evm", "0x123"), null);
  assert.equal(normalizeWallet("evm", `${ETH}"><img src=x>`), null);
  assert.equal(normalizeWallet("evm", 42), null);
  assert.deepEqual(cleanWallets({ ln: "a@b.io", xmr: "nope", evm: ETH, junk: "x" }), { ln: "a@b.io", evm: ETH });
  assert.deepEqual(cleanWallets(null), {});
});

test("wallets: wallet app links", () => {
  assert.equal(walletUri("ln", "a@b.io"), "lightning:a@b.io");
  assert.equal(walletUri("evm", ETH), `ethereum:${ETH}`);
});
