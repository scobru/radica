import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanWallets, isMoneroPrimaryAddress, normalizeWallet, validateWalletForSave, walletUri } from "../src/wallets.ts";

const XMR = "4" + "A".repeat(94);
const XMR_SUB = "8" + "B".repeat(94);
const SP_BTC = "sp1q" + "q".repeat(112);
const ETH = "0x" + "aB".repeat(20);

test("wallets: each kind accepts its format and normalizes case where the format is case-free", () => {
  assert.equal(normalizeWallet("ln", " Me@Breez.Tips "), "me@breez.tips");
  assert.equal(normalizeWallet("xmr", XMR), XMR);
  assert.equal(normalizeWallet("xmr", XMR_SUB), XMR_SUB);
  assert.equal(normalizeWallet("xmr", XMR + "B".repeat(11)), XMR + "B".repeat(11), "integrated address");
  assert.equal(normalizeWallet("btc", "BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ"), "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq");
  assert.equal(normalizeWallet("btc", SP_BTC), SP_BTC, "BIP-352 Silent Payment address");
  assert.equal(normalizeWallet("btc", SP_BTC.toUpperCase()), SP_BTC, "Silent Payment normalizes lowercase");
  assert.equal(normalizeWallet("btc", "1BoatSLRHtKNngkdXEeobR76b53LETtpyT"), "1BoatSLRHtKNngkdXEeobR76b53LETtpyT");
  assert.equal(normalizeWallet("evm", ETH), ETH);
});

test("wallets: validateWalletForSave enforces Monero subaddress (8…) over primary (4…) while supporting Silent Payments", () => {
  assert.equal(isMoneroPrimaryAddress(XMR), true);
  assert.equal(isMoneroPrimaryAddress(XMR + "B".repeat(11)), true);
  assert.equal(isMoneroPrimaryAddress(XMR_SUB), false);

  assert.equal(validateWalletForSave("xmr", XMR_SUB), null);
  assert.match(validateWalletForSave("xmr", XMR) ?? "", /subaddress.*8…/i);
  assert.match(validateWalletForSave("xmr", XMR + "B".repeat(11)) ?? "", /subaddress.*8…/i);
  assert.match(validateWalletForSave("xmr", "8notenoughchars") ?? "", /95 characters/);
  assert.equal(validateWalletForSave("btc", SP_BTC), null);
  assert.equal(validateWalletForSave("xmr", ""), null);
});

test("wallets: anything that is not an address is dropped, so no link can carry it", () => {
  assert.equal(normalizeWallet("ln", "javascript:alert(1)"), null);
  assert.equal(normalizeWallet("ln", "me@localhost"), null);
  assert.equal(normalizeWallet("xmr", XMR.slice(1)), null);
  assert.equal(normalizeWallet("btc", "bc1qO0"), null);
  assert.equal(normalizeWallet("btc", SP_BTC.slice(0, -1)), null, "truncated Silent Payment rejected");
  assert.equal(normalizeWallet("evm", "0x123"), null);
  assert.equal(normalizeWallet("evm", `${ETH}"><img src=x>`), null);
  assert.equal(normalizeWallet("evm", 42), null);
  assert.deepEqual(cleanWallets({ ln: "a@b.io", xmr: "nope", evm: ETH, junk: "x" }), { ln: "a@b.io", evm: ETH });
  assert.deepEqual(cleanWallets(null), {});
});

test("wallets: wallet app links", () => {
  assert.equal(walletUri("ln", "a@b.io"), "lightning:a@b.io");
  assert.equal(walletUri("btc", SP_BTC), `bitcoin:${SP_BTC}`);
  assert.equal(walletUri("evm", ETH), `ethereum:${ETH}`);
});
