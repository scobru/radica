# Radica (Freenet Edition) 🌱

[![Freenet](https://img.shields.io/badge/Network-Freenet-22c55e.svg)](https://freenet.org)
[![Live on Freenet](https://img.shields.io/badge/Freenet%20dApp-Ex88TLL48HQ...-blueviolet.svg)](http://127.0.0.1:7509/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Contract](https://img.shields.io/badge/Contract-Rust%20%7C%20WASM-orange.svg)](contract/)
[![Storage](https://img.shields.io/badge/Storage-freenet--blob%20(Reed--Solomon)-blue.svg)](https://github.com/scobru/freenet-blob)
[![AI Moderation](https://img.shields.io/badge/AI%20Moderation-Desert%20Ant%20Labs-6366f1.svg)](https://desertant.com)

**New to Freenet?** The [Radica website](https://scobru.github.io/radica/) explains how to install Freenet, open Radica and make your identity.

Radica (Freenet Edition) is a **100% decentralized, serverless, and peer-to-peer social media platform** built on **[Freenet](https://freenet.org)**.

> 🌐 **Permanent Freenet Web App Address:**  
> `http://127.0.0.1:7509/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/`

This repository is an architectural rewrite. The legacy Node.js/Express and MongoDB backend has been entirely replaced with cryptographically verifiable **WebAssembly state contracts**, **Ed25519 client-side cryptography**, **on-device AI image moderation via Desert Ant Labs**, and an **anti-flooding engine**.

---

## 🌟 Key Features

### 1. 🛡️ On-Device AI Moderation (Desert Ant Labs)
- **Zero-Tolerance Visual Moderation**: Integrated [`@desert-ant-labs/moderator`](https://desertant.com/models/moderator/) running WebAssembly and [LiteRT.js](https://www.npmjs.com/package/@litertjs/core) directly in the client.
- **Client-Side Blocking**: Evaluates images on-device before upload. Any media detected as adult, sensitive, or explicit is immediately blocked from publication (`Publishing Prohibited`).
- **No Cloud Telemetry or Leakage**: Image scanning executes entirely in the user's browser sandbox, protecting user privacy.

### 2. 🔒 Automated PII Redaction & Text Censorship
- **Automatic Sensitive Data Masking**: Post captions, comments, and chat messages are scanned on-device for Personally Identifiable Information (PII) and automatically redacted before publishing:
  - 💳 Credit Card numbers ➔ `[💳 CARD DATA REDACTED]`
  - 🏦 European & Italian IBANs ➔ `[🏦 IBAN REDACTED]`
  - 🪪 Tax IDs & Codici Fiscali ➔ `[🪪 TAX ID REDACTED]`
  - 📧 Email addresses ➔ `[📧 EMAIL REDACTED]`
  - 📱 Phone numbers ➔ `[📱 PHONE NUMBER REDACTED]`
- **Profanity & Hate Speech Filtering**: Inappropriate language, insults, and hate speech (Italian and English) are masked with asterisks (`*****`).
- **Transparent User Feedback**: Users are notified with an informative alert detailing which categories of sensitive data or language were redacted prior to publishing.

### 3. ⏱️ Decentralized Anti-Flooding & Rate Limiting
- **15-Second Post Cooldown**: Enforces a minimum interval between posts with an active, real-time button countdown (`⏳ Cooldown (15s)`).
- **Sliding-Window Rate Limit**: Prevents automated scripts from flooding the network by limiting publication to a maximum of **3 posts per 60-second window**.
- **Duplicate Post Detection**: Normalized duplicate checking prevents posting the exact same content repeatedly.
- **Comment & Chat Throttling**: 4-second cooldown between comments and 2-second cooldown between chat messages to ensure timeline and room readability.

### 4. 🌐 Cryptographic Personas & Decentralized Storage
- **Passwordless Identity**: Personas are derived client-side using Ed25519 keypairs. Public keys serve as unique addresses (`@pubkey...`).
- **Cryptographically Signed State**: Every post, like, comment, and community interaction is signed by the author's private key.
- **Join-Semilattice WASM Contract**: The Rust smart contract (`radica_contract.wasm`) guarantees idempotent delta merges, conflict resolution, and deterministic state convergence across all Freenet peers.

### 5. 🏛️ Decentralized Communities (`r/slug`)
- **Permissionless Community Creation**: Any persona can establish a community and automatically becomes its **Founder & Root Moderator**.
- **Moderator Hierarchy**: Founders can promote members to moderators and demote them. Root founders cannot be demoted.
- **Content Moderation Actions**: Community moderators have cryptographic authority to remove posts from their community feeds.
- **Radica's Moderators**: the maintainer names moderators for the public timeline. Everything they do (remove a post or comment, ban a person, hide an offensive community) is a signed entry on their public blocklist, hidden for whoever follows Radica's moderation and shown again by whoever stops. Nothing can be deleted from Freenet. A Moderation page ranks public reports by who made them: people the moderator trusts count, fresh keys do not. See the in-app Guide: "Against spam and bots".

### 6. 💬 P2P Direct Chat & Interactive Feeds
- **Private & Community Chat**: Deterministic room address derivation for 1-on-1 private messaging and community chatrooms.
- **End-to-End Encrypted Private Rooms**: Symmetric room keys (AES-256-GCM) encrypted for each member via X25519 ECDH, shareable via zero-knowledge invite fragment links (`#join_room=...`).
- **Interactive `#Hashtags` & Live Search**: Automatic hashtag tokenization, live keyword filtering, and category sorting (Thoughts, Moments, Events).
- **Dual Runtime**: Runs as a progressive Web App via Vite or as an Electron desktop application.

### 7. 🎨 Offline SVG Identicons & Custom Avatar Upload
- **100% Offline Deterministic Avatars**: Generates vibrant, unique SVG identicons derived mathematically from each persona's Ed25519 public key. Eliminates external CDN dependencies (e.g. Dicebear) that fail in air-gapped or sandboxed Freenet environments.
- **Client-Side Image Upload & Compression**: Upload profile photos directly from local device. Automatically center-cropped and compressed via HTML5 Canvas to 80x80 JPEG (~2 KB) to fit within decentralized state limits.
- **Aspect-Ratio Protected UI**: Strict 1:1 circular display rules preventing image distortion or oval stretching.

### 8. 📸 Moments Compression & Sandboxed Persistence Engine
- **Automatic High-Res Downscaling**: Uploaded Moment photos are automatically compressed client-side (max 360px, JPEG quality 0.58), transforming 5-10 MB camera files into lightweight ~2.5-3.8 KB payloads.
- **Freenet Shell Hash Persistence (`SafeStorage`)**: Survives sandboxed opaque-origin reloads where browser `localStorage` throws `SecurityError`. Syncs encrypted state to parent shell hash strictly under Freenet's 8,192-char truncation limit.
- **Resilient Feed Trimming**: Keeps identity, profile, and recent posts/Moments fully persistent across `F5` and `Ctrl+F5` hard reloads without state corruption.

### 9. 🌱 Anonymous Supporter Badges (ZK proofs on Base)
- **Donate without a middleman**: the [donate page](https://scobru.github.io/radica/donate/) takes USDC on Base and sends it straight to the treasury through `RadicaSupport`, a contract with no owner and no admin function: nobody can change its rules or touch the funds.
- **Zero-knowledge tiers**: each donation adds the donor's [Semaphore](https://semaphore.pse.dev) identity commitment to the group of its tier (🌱 Sprout $1+, 🌿 Root $50+, 🌳 Oak $250+). The donor then proves "I am an Oak supporter", bound to their Radica key, without revealing which wallet paid. A nullifier stops one donation from backing two identities.
- **Automatic attester**: a bot (`attester/`, Freenet node + Node.js in one container) reads proofs from a Freenet log, checks them on-chain, and publishes signed receipts; Radica picks the receipt up and shows the badge. No human in the loop, and every proof stays public so anyone can re-check the bot.
- **Trusted issuers**: Radica accepts receipts from any key in `RECEIPT_ISSUERS` (the attester, plus backups), so no single key is required, and a leaked key is simply removed.
- **Opt-in supporters wall**: supporters can appear on the public Community supporters list, grouped by tier; every client verifies each receipt before showing it.

### 10. ✉️ Freenet Mail Interoperability (Post-Quantum)
- **Zero Lock-In Email**: Every Radica persona deterministically derives a decentralized post-quantum email identity compatible with the official [`freenet/mail`](https://github.com/freenet/mail) application:
  - 🔑 **Post-Quantum Crypto**: ML-KEM-768 for encrypted message decapsulation and ML-DSA-65 for signing and verification.
  - 📋 **Universal Recovery Key**: Export official `fmail-key-1:<base58>` recovery keys or JSON backups (`identity-backup-v2.json`) directly from Identity & Key Management.
  - 🌐 **Cross-App Sync**: Users can import their recovery key into the native Freenet Mail Dioxus client and access the exact same inbox contract on the decentralized network.

---

## 🏗️ Architecture

```
radica/
├── contract/                    # Freenet WASM State Contract (Rust)
│   ├── Cargo.toml               # freenet-stdlib 0.8, ed25519-dalek, blake3
│   └── src/
│       └── lib.rs               # FeedState, idempotence, delta computation & unit tests
├── ui/                          # Client-Side Application (Vite + TypeScript)
│   ├── src/
│   │   ├── crypto.ts            # Ed25519 signatures, X25519 ECDH + AES-256-GCM E2EE
│   │   ├── avatar.ts            # Deterministic SVG identicons & client-side Canvas compression
│   │   ├── storage.ts           # SafeStorage parent shell hash sync & persistence engine
│   │   ├── whoiam.ts            # Viso / Whoiam decentralized SSO identity bridge
│   │   ├── moderation.ts        # Desert Ant Labs WASM loader & text/PII censorship
│   │   ├── freenetMail.ts       # Freenet Mail post-quantum seeds & recovery key codec
│   │   ├── freenet.ts           # Freenet client, P2P broadcast channel & room key cache
│   │   ├── types.ts             # Contract state & delta interface declarations
│   │   ├── icons.ts             # SVG icon definitions & helpers
│   │   ├── style.css            # Dark mode, glassmorphism & responsive typography
│   │   └── main.ts              # Timeline, anti-flood controller & community management
│   ├── vite.config.ts           # Vite config with WASM support and dev peer sync
│   └── package.json
├── donation-contract/           # RadicaSupport.sol (Hardhat): USDC donations -> Semaphore tier groups, on Base
├── donate-app/                  # Static donate page (Vite + viem + Semaphore), published to GitHub Pages
├── attester/                    # Bot: verifies ZK donation proofs on-chain, issues supporter receipts (Docker / CapRover)
├── electron.js                  # Desktop container loading local UI bundle
└── package.json                 # Monorepo development scripts
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18+ (tested on Node v20/v22/v26)
- **Rust toolchain** with `wasm32-unknown-unknown` target:
  ```bash
  rustup target add wasm32-unknown-unknown
  ```

---

### 1. Installation

Clone the repository and install root and UI dependencies:

```bash
git clone https://github.com/scobru/radica.git
cd radica
npm install
npm --prefix ui install
```

---

### 2. Development Mode

Start the Vite development server:

```bash
npm run dev
```

Open your browser at `http://localhost:5173`. The development server includes a built-in multi-client WebSocket peer relay, allowing you to test real-time interactions across regular and incognito tabs simultaneously.

---

### 3. Contract Compilation & Testing

Execute the contract unit tests (validates idempotent delta merges and cryptographic signatures):

```bash
npm run test:contract
```

Compile the contract to WebAssembly release:

```bash
npm run build:contract
```

The compiled WASM artifact is generated at:
`contract/target/wasm32-unknown-unknown/release/radica_contract.wasm`

`media-contract/` (built into `ui/src/wasm/media.wasm`) holds one image per contract, keyed by the BLAKE3 hash of its bytes; a post names it as `media_uri = "radica-media:<hash>"`. Rebuild it only when you must: a new build leaves every image at its old key (see `ui/src/legacy.ts`).

A new contract build moves every feed and log to a new key. When you replace `ui/src/wasm/contract.wasm` or `ui/src/wasm/log.wasm`, move the old hash into `LEGACY` in `ui/src/legacy.ts` and put the new one in `CURRENT` (the UI tests fail until you do). Clients then find data left under the old build and carry it forward.

---

### 4. Build Production Web Application

Compile TypeScript and build the optimized production web assets:

```bash
npm run build:ui
```

---

### 5. Publish to Freenet

Needs [`fdev`](https://github.com/freenet/freenet-core) and a running node. The first time, create the signing key (its name decides the app address): `fdev website init radica`.

```bash
npm run freenet:build     # production build in ui/dist
npm run freenet:publish   # build + publish as a new website (first time)
npm run freenet:update    # build + publish a new version at the same address
```

The image filter (its wasm, runtime and model) and the stock GIFs are ~75 MB that almost never change, so they live in a second web container, `radica-assets`, and a Radica update uploads only the app (~1.5 MB instead of ~30 MB). Once:

```bash
fdev website init radica-assets
npm run freenet:assets:publish   # prints the radica-assets contract key
```

Put that key in `ui/freenet-assets.json` (`"key"`), commit it, then publish Radica as usual. `freenet:update` refuses to publish when the heavy files changed (e.g. after upgrading the moderator package): run `npm run freenet:assets:update` first. With no key the app ships every file itself, as before.

**Post translation** runs on the reader's device with [Bergamot](https://browser.mt/) (Mozilla's Firefox Translations engine): its engine is in `radica-assets`, and each language's models (to and from English, ~44 MB) are a web container of their own, `radica-lang-<code>`, published once. Languages: `it es de fr pt` (English is the pivot).

```bash
npm run freenet:lang -- it --publish   # download, verify and publish radica-lang-it; prints its contract key
```

Add each key to `ui/freenet-assets.json` under `"langs"` (e.g. `"langs": { "it": "<key>" }`), commit, and run `npm run freenet:update`. A language without a key is simply not offered. For dev, `npm run freenet:lang -- it` (no `--publish`) downloads the models into `ui/translation-models/`, which the dev server serves.

---

### 6. Launch the Desktop App (Rust + Freenet node)

The desktop app under `apps/` (`apps/desktop`) is Radica web in a native window, so it does what the web does from one codebase, plus the Freenet node underneath. On launch it probes port `7509`, auto-starts an installed Freenet service, or downloads and Ed25519-verifies the official Freenet release, then opens Radica web from the node in a [wry](https://github.com/tauri-apps/wry) window (WebView2 on Windows, WebKit on macOS and Linux; Linux builds need `libwebkit2gtk-4.1-dev`). Links to other sites open in the system browser. It lives in its own Cargo workspace so desktop dependencies never alter WASM contract or delegate hashes.:

**Android** (`apps/android`): Radica web in a WebView over the Freenet node that [Freenet Android Node](https://github.com/HostFat/freenet-android-node) (community app by HostFat, unofficial) runs on the phone. When no node answers, the app says whether that app is missing (with where to get it) or installed but stopped (with a button to open it), and opens Radica by itself once the node is up.

Builds for Windows (x86_64), Linux (x86_64, needs WebKitGTK 4.1 installed) and macOS (Apple Silicon and Intel, unsigned `Radica.app`) and Android (debug-signed APK) come from `.github/workflows/desktop.yml`: every run keeps them as artifacts, and a `v*` tag attaches them to its GitHub release. Radica's version lives in the root `package.json`: the desktop app (`apps/Cargo.toml`, checked by a test), the Android app and the macOS bundle carry it, and a release tag must be `v` plus that version (for example `v1.0.0`) or its build fails.

```bash
npm run app        # cargo run --manifest-path apps/Cargo.toml -p radica-desktop
npm run test:app   # Freenet installer/probe tests
```

---

## 🔒 Security & Privacy Model

- **No Remote Telemetry**: Zero external tracking, analytics, or third-party cookies.
- **On-Device Artificial Intelligence**: Visual content moderation and text redaction execute entirely on the user's hardware via WebAssembly.
- **Cryptographic Non-Repudiation**: State transitions require valid Ed25519 signatures corresponding to the author's public key.
- **Sybil & Flood Mitigation**: Cooldown timers, sliding-window limits, and duplicate checking prevent client-side network spam.
- **Unlinkable Donations**: Supporter badges come from zero-knowledge proofs: neither the attester nor anyone else can tell which wallet a badge belongs to. Receipts carry no transaction hash and only the day they were issued. Anonymity grows with the number of donors in a tier.

---

## 📜 Origin & Acknowledgments

- **Upstream Repository**: [dan-divy/spruce](https://github.com/dan-divy/spruce)
- **Author & Maintainer**: [Francesco Bruno (scobru)](https://github.com/scobru/radica)
- **Decentralized Network**: [Freenet Project](https://freenet.org)
- **Decentralized Identity Provider**: [Viso (scobru/viso)](https://github.com/scobru/viso) (Freenet persona delegation & cryptographic sign-in)
- **Freenet dApp Architecture**: [Freenet River](https://github.com/freenet/river) (WASM state contract patterns & P2P sync reference)
- **Freenet Companion Ecosystem**:
  - [FreeTunes](https://github.com/scobru/freetunes) (Decentralized music player & releases)
  - [FreePolls](https://github.com/scobru/freepolls) (Anonymous polls in posts & chat)
  - [FreeNames](https://github.com/scobru/freenames) (Decentralized names and resolver)
  - [Orto](https://github.com/scobru/orto) (Encrypted organizer & blog vault)
  - [Fisherman's Horizon](https://github.com/scobru/FH) (Curated Freenet bookmark lists)
  - [FreeHole](https://github.com/scobru/freehole) (Decentralized file transfer via Freenet chunk contracts with Reed-Solomon redundancy)
  - [Freetree](https://github.com/scobru/freetree) (Decentralized Linktree for Freenet & Delta)
  - [freenet-blob](https://github.com/scobru/freenet-blob) (Fault-tolerant blob storage with Reed-Solomon FEC & auto-healing)
- **On-Device AI Engine**: [Desert Ant Labs](https://desertant.com)

---

## ⚖️ Terms, Disclaimer & Privacy

Radica is experimental software provided **as is**, without warranty. It has no servers and no central moderation: users are responsible for what they publish. Donations are voluntary gifts, not purchases or investments. See [TERMS.md](TERMS.md) for the full Terms of Use, Disclaimer and Privacy notes.

## 📄 License

This project is licensed under the [MIT License](LICENSE).

Exception: `river-wasm/` (built into `ui/src/wasm/river.wasm`) links [river-core](https://github.com/freenet/river) and is licensed under the LGPL-3.0, like River. `ui/src/wasm/river_room_contract.wasm` is River's own room contract, copied unchanged from River's repository (the commit `river-wasm` pins); private rooms are created under it. It is a separate, replaceable module: rebuild it from `river-wasm/` with `cargo build --manifest-path river-wasm/Cargo.toml --target wasm32-unknown-unknown --release` and copy `river-wasm/target/wasm32-unknown-unknown/release/radica_river.wasm` over `ui/src/wasm/river.wasm`.
