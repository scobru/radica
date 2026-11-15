// The identity page's supporter section: the badge, redeeming a donation proof or a receipt (and following the
// attester's answer), removing it, and the public supporters wall. main.ts calls initSupporterPanel once.
import { freenet } from "./freenet.ts";
import { safeStorage } from "./storage";
import {
  verifyReceipt,
  getStoredReceipt,
  saveStoredReceipt,
  clearStoredReceipt,
  isReceiptRemoved,
  unremoveReceipts,
  RECEIPT_ISSUERS,
  supporterBadge,
  foldSupporters,
  supporterStorageKey,
  type SupporterTier,
} from "./supporter.ts";
import { checkGhostkey, requestGhostkeyProof, verifiedGhostkeys } from "./ghostkey.ts";
import { parseStoredPoh, serializeStoredPoh, verifiedPohs, verifyVisoDelegation, verifyVisoPoh, type DelegationProofV1 } from "./viso.ts";
import { hexToBytes, personaName } from "./crypto.ts";

let whoAmI: () => string | null = () => null;
let displayName: (pubkey: string) => string = (pk) => pk;
let onBadgeChange: () => void = () => {};
const ghostkeyKey = (pk: string) => `radica_ghostkey_${pk}`;
const pohKey = (pk: string) => `radica_poh_${pk}`;
const delegationKey = (pk: string) => `radica_delegation_${pk}`;

/** My GhostKey proof, if I keep one: what it says, and the Remove button. */
async function renderGhostkeyStatus() {
  const status = document.getElementById("ghostkey-status");
  const remove = document.getElementById("ghostkey-remove-btn");
  const pk = whoAmI();
  const bundle = pk && safeStorage.getItem(ghostkeyKey(pk));
  if (!status || !remove) return;
  remove.hidden = !bundle;
  if (!bundle) return void (status.textContent = "");
  try {
    const { fingerprint, info } = await checkGhostkey(bundle, pk!);
    status.textContent = `👻 Verified by GhostKey ${fingerprint}${info ? ` · ${info}` : ""}`;
  } catch (e) {
    status.textContent = `⚠️ The stored GhostKey proof does not check out: ${(e as Error).message}`;
  }
}

/** My Viso Proof-of-Personhood proof, if I keep one: what it attests, and the Remove button. */
async function renderPohStatus() {
  const status = document.getElementById("poh-status");
  const remove = document.getElementById("poh-remove-btn");
  const pk = whoAmI();
  const stored = pk ? parseStoredPoh(safeStorage.getItem(pohKey(pk))) : null;
  if (!status || !remove) return;
  remove.hidden = !stored;
  if (!stored) return void (status.textContent = "");
  let targetHex = pk!;
  let delegatedNote = "";
  if (stored.delegation) {
    const del = await verifyVisoDelegation(stored.delegation, pk!).catch(() => null);
    if (!del) {
      status.textContent = "⚠️ Stored delegated Viso PoH certificate could not be verified.";
      return;
    }
    targetHex = del.toHex;
    delegatedNote = ` · via @${del.toB58.slice(0, 10)}…`;
  }
  const badge = await verifyVisoPoh(hexToBytes(stored.proof), targetHex).catch(() => null);
  status.textContent = badge
    ? `🛡️ Verified Human (${badge.provider} · ${badge.tier} · ${badge.epoch}${delegatedNote})`
    : "⚠️ Stored Viso PoH proof could not be verified against trusted issuers.";
}

/** My linked Viso persona delegation (`DelegationProofV1`), if any. */
async function renderDelegationStatus() {
  const status = document.getElementById("delegation-status");
  const remove = document.getElementById("delegation-remove-btn");
  const pk = whoAmI();
  const raw = pk ? safeStorage.getItem(delegationKey(pk)) : null;
  if (!status || !remove) return;
  remove.hidden = !raw;
  if (!raw) return void (status.textContent = "");
  const del = await verifyVisoDelegation(raw, pk!).catch(() => null);
  status.textContent = del
    ? `🔗 Linked to active Viso persona @${personaName(del.toHex).slice(0, 12)}… (scope: ${del.scope})`
    : "⚠️ Stored delegation certificate is invalid for this persona.";
}

/** Redraw the badge and the wall (before initSupporterPanel: nobody signed in, so the badge is hidden). */
export function renderSupporterStatus() {
  void renderGhostkeyStatus();
  void renderPohStatus();
  void renderDelegationStatus();
  const badgeCard = document.getElementById("supporter-active-badge-card");
  const badgeLabel = document.getElementById("supporter-active-badge-label");
  const badgeDetails = document.getElementById("supporter-active-details");

  const pubkey = whoAmI();
  if (!pubkey) {
    if (badgeCard) badgeCard.style.display = "none";
    return;
  }

  const receipt = getStoredReceipt(pubkey);
  if (receipt && badgeCard && badgeLabel && badgeDetails) {
    const badge = supporterBadge(receipt);
    badgeCard.style.display = "block";
    badgeLabel.textContent = `${badge.icon} ${badge.label}`;
    badgeLabel.className = `identity-badge ${badge.badgeClass}`;
    badgeDetails.textContent = badge.description;
  } else if (badgeCard) {
    badgeCard.style.display = "none";
  }

  if (!receipt) void adoptAttestedReceipt();
  const toggle = document.getElementById("supporter-public-toggle") as HTMLInputElement | null;
  if (toggle) toggle.checked = !!freenet.supporterTokens().find((t) => t.author === pubkey)?.token;
  void renderSupporterWall();
}

/** Take a receipt the attester bot published for me, once it verifies against a trusted issuer. */
async function adoptAttestedReceipt(): Promise<boolean> {
  const me = whoAmI();
  if (!me || getStoredReceipt(me)) return false;
  for (const token of freenet.supporterReceiptsFor(me)) {
    if (isReceiptRemoved(token, me)) continue; // removed by the reader: not brought back
    try {
      await verifyReceipt(token, me);
      saveStoredReceipt(token, me);
      renderSupporterStatus();
      return true;
    } catch {} // signed by a key Radica does not trust: ignore
  }
  return false;
}

/** Watch the attester's answer to a proof sent at `since`: progress every check, then the badge or the reason it refused. */
function awaitAttestation(msg: HTMLElement, since: number) {
  const me = whoAmI()!; // a proof is only sent signed in
  let checks = 0;
  const stop = (text: string, color: string) => {
    clearInterval(timer);
    msg.textContent = text;
    msg.style.color = color;
  };
  const tick = async () => {
    checks++;
    await freenet.refreshLog("supporter-receipts", true).catch(() => {});
    if (getStoredReceipt(me) || (await adoptAttestedReceipt())) return stop("Donation verified! Supporter badge activated 🌱", "var(--primary)");
    // a minute of slack for clocks that differ between this device and the attester
    const no = freenet.supporterRejectionsFor(me, RECEIPT_ISSUERS).filter((r) => r.ts >= since - 60_000).at(-1);
    if (no) return stop(`The attester could not verify this proof: ${no.reason}.`, "var(--danger)");
    const sec = Math.round((Date.now() - since) / 1000);
    if (sec > 15 * 60) return stop("No answer from the attester after 15 minutes. Your proof stays published: the badge appears by itself once verified.", "var(--text-muted)");
    msg.textContent = `⏳ Proof sent. Waiting for the attester to check it on-chain… ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} elapsed, ${checks} check${checks > 1 ? "s" : ""}`;
  };
  const timer = setInterval(tick, 15_000);
  void tick();
}

async function renderSupporterWall() {
  const wall = document.getElementById("supporter-wall");
  if (!wall) return;
  await freenet.refreshLog("supporters");
  const byTier = await foldSupporters(freenet.supporterTokens());
  const rows = (["oak", "root", "sprout"] as SupporterTier[])
    .filter((t) => byTier[t].length)
    .map((t) => {
      const row = document.createElement("div");
      row.style.marginBottom = "4px";
      const icon = { oak: "🌳", root: "🌿", sprout: "🌱" }[t];
      row.textContent = `${icon} ${t[0].toUpperCase()}${t.slice(1)}: ${byTier[t].map(displayName).join(", ")}`;
      return row;
    });
  await freenet.refreshLog("ghostkeys");
  await freenet.refreshLog("poh");
  const ghosts = await verifiedGhostkeys(freenet.ghostkeyBundles()).catch(() => [] as string[]);
  if (ghosts.length) {
    const row = document.createElement("div");
    row.style.marginBottom = "4px";
    row.textContent = `👻 GhostKey: ${ghosts.map(displayName).join(", ")}`;
    rows.push(row);
  }
  const humans = await verifiedPohs(freenet.pohProofs()).catch(() => [] as string[]);
  if (humans.length) {
    const row = document.createElement("div");
    row.style.marginBottom = "4px";
    row.textContent = `🛡️ Verified Human (Viso PoH): ${humans.map(displayName).join(", ")}`;
    rows.push(row);
  }
  wall.replaceChildren(...rows);
  if (!rows.length) wall.textContent = "No public supporters yet. Be the first!";
}

/** Wire the section's buttons (once). */
export function initSupporterPanel(deps: {
  whoAmI: () => string | null;
  displayName: (pubkey: string) => string;
  openLink: (this: HTMLAnchorElement, e: Event) => void;
  /** Badges changed (a GhostKey proof added or removed): redraw who is trusted. */
  onBadgeChange?: () => void;
}): void {
  whoAmI = deps.whoAmI;
  displayName = deps.displayName;
  onBadgeChange = deps.onBadgeChange ?? onBadgeChange;
  document.getElementById("ghostkey-get-link")?.addEventListener("click", deps.openLink);

  document.getElementById("ghostkey-verify-btn")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const msg = document.getElementById("ghostkey-msg");
    const pk = whoAmI();
    if (!pk || !msg) return;
    btn.disabled = true;
    msg.style.color = "var(--text-muted)";
    msg.textContent = "Asking your GhostKey… Freenet may ask you to allow Radica.";
    try {
      // a GhostKey already linked to this persona in Viso serves as it is; otherwise the node's ghostkeys delegate signs
      let bundle = await freenet.visoGhostkey(pk);
      if (bundle) await checkGhostkey(bundle, pk).catch(() => (bundle = null));
      bundle ??= await requestGhostkeyProof(pk);
      safeStorage.setItem(ghostkeyKey(pk), bundle);
      await freenet.setGhostkey(bundle);
      msg.style.color = "var(--primary)";
      msg.textContent = "👻 Done: your GhostKey vouches for this identity.";
      onBadgeChange();
      void renderGhostkeyStatus();
      void renderSupporterWall();
    } catch (err) {
      msg.style.color = "var(--danger)";
      msg.textContent = (err as Error).message || String(err);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("ghostkey-remove-btn")?.addEventListener("click", async () => {
    const pk = whoAmI();
    if (!pk || !confirm("Remove your GhostKey badge? Its proof is taken back from the public list too.")) return;
    safeStorage.removeItem(ghostkeyKey(pk));
    await freenet.setGhostkey(null).catch(() => {});
    onBadgeChange();
    void renderGhostkeyStatus();
    void renderSupporterWall();
  });

  document.getElementById("poh-verify-btn")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const msg = document.getElementById("poh-msg");
    const pk = whoAmI();
    if (!pk || !msg) return;
    btn.disabled = true;
    msg.style.color = "var(--text-muted)";
    msg.textContent = "Checking your Viso Proof-of-Personhood slot…";
    try {
      const resolved = await freenet.visoPohResolved(pk);
      if (!resolved) throw new Error("No GitHub Proof-of-Personhood found on your Viso persona (or linked delegate) yet.");
      safeStorage.setItem(pohKey(pk), serializeStoredPoh(resolved.proofHex, resolved.delegation));
      await freenet.setPohProof(resolved.proofHex, resolved.delegation ?? null);
      msg.style.color = "var(--primary)";
      msg.textContent = `🛡️ Verified Human (${resolved.badge.provider} · ${resolved.badge.tier}) badge activated.`;
      onBadgeChange();
      void renderPohStatus();
      void renderSupporterWall();
    } catch (err) {
      msg.style.color = "var(--danger)";
      msg.textContent = (err as Error).message || String(err);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("poh-remove-btn")?.addEventListener("click", async () => {
    const pk = whoAmI();
    if (!pk || !confirm("Remove your Verified Human badge from Radica? Your Viso identity slot stays unchanged.")) return;
    safeStorage.removeItem(pohKey(pk));
    await freenet.setPohProof(null).catch(() => {});
    onBadgeChange();
    void renderPohStatus();
    void renderSupporterWall();
  });

  document.getElementById("delegation-link-btn")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const input = document.getElementById("delegation-proof-input") as HTMLTextAreaElement | null;
    const msg = document.getElementById("delegation-msg");
    const pk = whoAmI();
    if (!pk || !input || !msg) return;
    const raw = input.value.trim();
    if (!raw) {
      msg.style.color = "var(--danger)";
      msg.textContent = "Paste the DelegationProofV1 JSON from Viso first.";
      return;
    }
    btn.disabled = true;
    msg.style.color = "var(--text-muted)";
    msg.textContent = "Verifying signatures & checking active Viso persona…";
    try {
      const verified = await verifyVisoDelegation(raw, pk);
      if (!verified) throw new Error("Invalid DelegationProofV1, mismatched source key, or unsupported scope.");
      const proofObj = JSON.parse(raw) as DelegationProofV1;
      safeStorage.setItem(delegationKey(pk), JSON.stringify(proofObj));
      await freenet.setDelegationProof(proofObj);
      input.value = "";
      const resolved = await freenet.visoPohResolved(pk);
      if (resolved) {
        safeStorage.setItem(pohKey(pk), serializeStoredPoh(resolved.proofHex, resolved.delegation ?? proofObj));
        await freenet.setPohProof(resolved.proofHex, resolved.delegation ?? proofObj);
        msg.style.color = "var(--primary)";
        msg.textContent = `🔗 Linked to @${personaName(verified.toHex).slice(0, 10)}… & activated ${resolved.badge.provider} PoH badge!`;
      } else {
        msg.style.color = "var(--primary)";
        msg.textContent = `🔗 Linked to @${personaName(verified.toHex).slice(0, 10)}… (no PoH slot found on target yet — click Sync once linked in Viso).`;
      }
      onBadgeChange();
      void renderDelegationStatus();
      void renderPohStatus();
      void renderSupporterWall();
    } catch (err) {
      msg.style.color = "var(--danger)";
      msg.textContent = (err as Error).message || String(err);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("delegation-remove-btn")?.addEventListener("click", async () => {
    const pk = whoAmI();
    if (!pk || !confirm("Unlink your delegated Viso persona from Radica?")) return;
    safeStorage.removeItem(delegationKey(pk));
    await freenet.setDelegationProof(null).catch(() => {});
    const storedPoh = parseStoredPoh(safeStorage.getItem(pohKey(pk)));
    if (storedPoh?.delegation) {
      safeStorage.removeItem(pohKey(pk));
      await freenet.setPohProof(null).catch(() => {});
    }
    onBadgeChange();
    void renderDelegationStatus();
    void renderPohStatus();
    void renderSupporterWall();
  });
  document.getElementById("supporter-public-toggle")?.addEventListener("change", async (e) => {
    const toggle = e.target as HTMLInputElement;
    const pubkey = whoAmI();
    const token = pubkey && safeStorage.getItem(supporterStorageKey(pubkey));
    if (!token) return;
    toggle.disabled = true;
    try {
      await freenet.setSupporterPublic(toggle.checked ? token : null);
      await renderSupporterWall();
    } catch (err) {
      toggle.checked = !toggle.checked;
      alert((err as Error).message || "Could not update the supporters wall.");
    } finally {
      toggle.disabled = false;
    }
  });

  document.getElementById("supporter-donate-link")?.addEventListener("click", deps.openLink); // inside Freenet's sandbox a plain link may not open

  document.getElementById("redeem-receipt-btn")?.addEventListener("click", async () => {
    const input = document.getElementById("redeem-receipt-input") as HTMLInputElement | null;
    const msg = document.getElementById("redeem-receipt-msg");
    const pubkey = whoAmI();
    if (!input || !msg || !pubkey) return;

    const token = input.value.trim();
    if (!token) {
      msg.textContent = "Please paste a receipt token.";
      msg.style.color = "var(--danger)";
      return;
    }

    if (token.startsWith("RADICA-ZK-V1:")) {
      try {
        await freenet.submitSupporterClaim(token);
        unremoveReceipts(pubkey); // a badge removed before comes back with its old receipt
        input.value = "";
        msg.style.color = "var(--text-muted)";
        awaitAttestation(msg, Date.now());
      } catch (err) {
        msg.textContent = (err as Error).message || "Could not publish the proof.";
        msg.style.color = "var(--danger)";
      }
      return;
    }

    try {
      msg.textContent = "Verifying receipt...";
      msg.style.color = "var(--text-muted)";
      const receipt = await verifyReceipt(token, pubkey);
      saveStoredReceipt(token, pubkey);
      input.value = "";
      msg.textContent = `Verified! Activated ${supporterBadge(receipt).label} 🌱`;
      msg.style.color = "var(--primary)";
      renderSupporterStatus();
    } catch (err) {
      msg.textContent = (err as Error).message || "Verification failed.";
      msg.style.color = "var(--danger)";
    }
  });

  document.getElementById("supporter-clear-btn")?.addEventListener("click", () => {
    const pubkey = whoAmI();
    if (pubkey && confirm("Remove this supporter receipt from this device?")) {
      clearStoredReceipt(pubkey, freenet.supporterReceiptsFor(pubkey));
      if (freenet.supporterTokens().find((t) => t.author === pubkey)?.token) void freenet.setSupporterPublic(null);
      renderSupporterStatus();
    }
  });
}
