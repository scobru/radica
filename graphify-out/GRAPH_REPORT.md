# Graph Report - radica  (2026-11-23)

## Corpus Check
- 303 files · ~428,289 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 41 file(s) not represented in the graph (top: (none) 13, .wasm 13, .css 5)

## Summary
- 4794 nodes · 13111 edges · 178 communities (150 shown, 28 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 498 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `89fb53dc`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- freenetMail.ts
- RiverRooms
- lib.rs
- init
- scripts
- whoiam.ts
- 🌟 Key Features
- handle
- dependencies
- selectPrivateRoom
- moderation.ts
- postGone.ts
- resetPublishBtnState
- vite.config.ts
- signOut
- types.ts
- FreenetNetwork
- river-wasm/src/lib.rs
- SafeStorage
- .process
- compilerOptions
- MainActivity
- attachCardListeners
- feedsize.ts
- Contributor Covenant Code of Conduct
- versionCheck.ts
- avatar.ts
- createMessengerChat
- icons.ts
- web.rs
- asocial.ts
- with
- CHANGELOG.md
- steps
- NotificationItem
- delta.ts
- nodeOrigin
- types.ts
- hexToBytes
- createMessengerChat
- Reader
- secretChat.ts
- delegate.ts
- messengerLogic.ts
- compilerOptions
- icons.ts
- handleJoinFromInviteUrl
- .applyLog
- caption.test.ts
- donation-contract/package.json
- audio.rs
- ref_node_assert
- mailClient.ts
- steps
- delegate.ts
- secretChat.ts
- Radica — domain language
- ChatMessage
- rootsfx.ts
- splitNotifs
- freenet.ts
- loadMailContacts
- treePage.ts
- package.json
- moderation.spec.ts
- package.json
- createMessengerChat
- createArticlesPage
- RiverRooms
- BatchTranslator
- attester
- make-icons.py
- Radica donation contract
- fh.ts
- Radica attester
- linfa.ts
- verifyVisoPoh
- fetch-translation-models.mjs
- network.ts
- versionCheck.ts
- start.sh
- README.md
- supporter.ts
- DesktopHost
- orto.ts
- river-watch.py
- Req
- 🚨 Mandatory Rule: Features, Updates Tab & Documentation
- resolve
- .onCreate
- ok
- greenhouse.ts
- freetunes.test.ts
- fillFreetunes
- riverPointer.ts
- resolve
- renderIdentityModal
- messengerChat.ts
- media.ts
- musicPage.ts
- chatMedia.test.ts
- .isRadicaUrl
- Override
- communitiesPage.ts
- TASK-001: Responsive 13.3" Laptop Layout for Wall & Profile Modal
- treeGraph.ts
- sendMailMessage
- linfa.ts
- Radica Issues & Task Tracker
- freetree.ts
- steps
- pow.ts
- TASK-003: Mail Contacts Management (Add & Remove Contacts)
- TASK-006: Short-Form Vertical Video & Video Channels (TikTok / YouTube)
- TASK-007: Curated Boards & Collections (Pinterest / Are.na)
- TASK-008: Social Audio, Podcasts & Persistent Player (Spotify / FreeTunes)
- TASK-009: Dedicated Events Calendar & RSVP System (Luma / Meetup)
- mentionPicker.ts
- loadTreePage
- scripts
- rootsfx.ts
- anchorElementInViewport
- musicPage.ts
- feedsize.ts
- conversationState.ts
- communitiesPage.ts
- verifiedPohBadgesByAuthor
- boards.ts
- compilerOptions
- roots.ts
- 🚀 Getting Started
- savedPosts.ts
- ghostkey.ts
- wallets.ts
- durable.ts
- Folio
- avatar.ts
- .push
- syncFreenetMailInbox
- linfa.ts
- CHANGELOG.md
- vite.config.ts
- updateMailBadges
- init
- postGone.ts
- Radica: Terms of Use, Disclaimer and Privacy
- encryptFreenetMailV1
- renderHeader
- super
- heavyUrl
- walkieTalkie.ts
- escapeHtml
- rotation
- Req
- scripts
- refresh.ts
- .onShowFileChooser
- withTimeout
- postGone.ts
- feedbench
- radica-desktop
- radica-ghostkey
- radica-identity
- radica-log-contract
- radica-media-contract
- radica-river
- CONTAINERS
- LIMITS

## God Nodes (most connected - your core abstractions)
1. `FreenetClient` - 278 edges
2. `escapeHtml()` - 133 edges
3. `createMessengerChat()` - 114 edges
4. `openUserProfile()` - 87 edges
5. `UserIdentity` - 84 edges
6. `renderCommunitiesPage()` - 65 edges
7. `renderTimeline()` - 61 edges
8. `bytesToHex` - 56 edges
9. `hexToBytes` - 52 edges
10. `renderIcon()` - 52 edges

## Surprising Connections (you probably didn't know these)
- `What it does` --references--> `parseArticleCaption()`  [INFERRED]
  folio/README.md → ui/src/articles.ts
- `6. 💬 P2P Direct Chat & Interactive Feeds` --references--> `fromBase58()`  [INFERRED]
  README.md → ui/src/base58.ts
- `4. Rollout` --references--> `isCanonicalPost()`  [INFERRED]
  tasks/010-contract-v2-migration.md → ui/src/feedlight.ts
- `Context & Goal` --references--> `isCanonicalPost()`  [INFERRED]
  tasks/010-contract-v2-migration.md → ui/src/feedlight.ts
- `8. 📸 Moments Compression & Sandboxed Persistence Engine` --references--> `SafeStorage`  [INFERRED]
  README.md → ui/src/storage.ts

## Import Cycles
- 2-file cycle: `apps/desktop/src/host.rs -> apps/desktop/src/install.rs -> apps/desktop/src/host.rs`
- 2-file cycle: `ui/src/handles.ts -> ui/src/logfold.ts -> ui/src/handles.ts`
- 3-file cycle: `ui/src/crypto.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/crypto.ts`
- 4-file cycle: `ui/src/crypto.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/riverPointer.ts -> ui/src/crypto.ts`

## Communities (178 total, 28 thin omitted)

### Community 0 - "freenetMail.ts"
Cohesion: 0.08
Nodes (39): BIP39_WORDLIST, ADDRESS_CONTEXT, AFT_TIER_SPEC, AFT_TIERS, aftDayIndexInYear(), BODY_LEN, check2Of(), CHECK_CONTEXT (+31 more)

### Community 1 - "RiverRooms"
Cohesion: 0.17
Nodes (13): @desert-ant-labs/moderator, @desert-ant-labs/moderator@^4.0.0, filterWasmResponse(), analyzeTextContent(), BAD_WORDS, BAD_WORDS_RE, censorTextAndPII(), getModerator() (+5 more)

### Community 2 - "lib.rs"
Cohesion: 0.05
Nodes (97): hx(), key(), prepare(), run(), STATE, main(), state(), an_author_takes_back_a_comment_with_an_empty_version() (+89 more)

### Community 3 - "init"
Cohesion: 0.10
Nodes (46): askModel(), askRaw(), getEntries(), ghFetch(), globalProtectedSet(), greenhousePass(), loadMod(), modPass() (+38 more)

### Community 4 - "scripts"
Cohesion: 0.07
Nodes (28): author, description, keywords, license, name, scripts, app, app:messenger (+20 more)

### Community 5 - "whoiam.ts"
Cohesion: 0.11
Nodes (25): ANTE_CODE_HASH, VOTE_BITS, enumVariant(), anteCall(), code(), createPoll(), enc(), fpIdentity() (+17 more)

### Community 6 - "🌟 Key Features"
Cohesion: 0.13
Nodes (14): 10. ✉️ Radica Mail & Freenet Mail Interoperability (Post-Quantum), 12. 🔁 Reposts Without a Contract Change, 13. ⚙️ Dedicated Settings, Decluttered Rail & Wall-First Profiles, 13. 🖼️ Moments Gallery (Media Explore), 1. 🛡️ On-Device AI Moderation (Desert Ant Labs), 2. 🔒 Automated PII Redaction & Text Censorship, 3. ⏱️ Decentralized Anti-Flooding & Rate Limiting, 4. 🌐 Cryptographic Personas & Decentralized Storage (+6 more)

### Community 7 - "handle"
Cohesion: 0.18
Nodes (18): a_secret_blob_that_does_not_decrypt_is_skipped(), body(), cbor(), entering(), handle(), is_private(), key32(), msg_id() (+10 more)

### Community 8 - "dependencies"
Cohesion: 0.09
Nodes (29): @browsermt/bergamot-translator, @fontsource-variable/fraunces, @fontsource-variable/inter, freenet-blob, @litertjs/core, dependencies, @browsermt/bergamot-translator@0.4.9, @fontsource-variable/fraunces@^5.3.0 (+21 more)

### Community 9 - "selectPrivateRoom"
Cohesion: 0.08
Nodes (50): applyChatLayoutAttr(), applyFullWidth(), applyMaskBadWords(), attachBubbleDeleteListeners(), cancelClassicVoiceRec(), chatExcerpt(), checkUrlInviteHash(), clearActiveChat() (+42 more)

### Community 10 - "moderation.ts"
Cohesion: 0.04
Nodes (9): addReadKeys(), FreenetClient, LogEntry, backupOwnProfileExtras(), isProfileExtraLog(), latestOwnLogEntry(), ProfileExtraKind, setActiveSecretChatTTL() (+1 more)

### Community 11 - "postGone.ts"
Cohesion: 0.20
Nodes (15): BlobVideoRef, filterVideoReels(), formatBlobVideoCaption(), isVideoReelPost(), parseBlobVideoRef(), stepReelIndex(), VIDEO_BLOB_PREFIX, createReelsPlayer() (+7 more)

### Community 12 - "resetPublishBtnState"
Cohesion: 0.10
Nodes (28): clearResolvedFreenames(), dec, enc, freenameInCaption(), freenamesCard(), FreenameUri, getResolvedFreename(), ID (+20 more)

### Community 13 - "vite.config.ts"
Cohesion: 0.12
Nodes (17): a_proof_holds_for_its_identity_only_and_under_the_real_master_only(), a_sign_result_becomes_the_bundle_viso_stores(), BIND_TAG, binding_payload(), call(), cbor(), empty_requestor_is_rejected(), fixture() (+9 more)

### Community 14 - "signOut"
Cohesion: 0.09
Nodes (44): an_author_s_newer_entry_replaces_the_older_under_one_key(), check(), de(), delta(), Entry, entry2(), entry(), entry_msg() (+36 more)

### Community 15 - "types.ts"
Cohesion: 0.06
Nodes (33): 1. Signatures: v3 messages, length-prefixed, v2 still accepted, ArticlesPageDeps, CommentEntry, CommentFilters, giveUpWorker(), isCanonicalPost(), LightFeed, lightFeed() (+25 more)

### Community 16 - "FreenetNetwork"
Cohesion: 0.22
Nodes (3): FreenetNetwork, isInteractiveContract(), wsUrl()

### Community 17 - "river-wasm/src/lib.rs"
Cohesion: 0.04
Nodes (9): call(), fill(), open(), random_fill(), RECORD, RIVER_AUTHOR_VK, RIVER_INVITATION, ROOM_CONTRACT_APP_ID (+1 more)

### Community 18 - "SafeStorage"
Cohesion: 0.17
Nodes (9): delta_only_to_a_peer_without_it(), IMG, MAX_MEDIA, only_the_named_bytes_are_valid(), params(), RadicaMediaContract, too_big_is_refused_even_with_its_hash(), update_keeps_or_adopts_the_valid_image() (+1 more)

### Community 19 - ".process"
Cohesion: 0.13
Nodes (9): Identity, key_of(), kv_name(), kv_names_are_validated_and_namespaced(), MAX_VALUE, parse_sk(), run(), secrets_must_be_32_bytes_of_hex() (+1 more)

### Community 20 - "compilerOptions"
Cohesion: 0.05
Nodes (82): @noble/curves, @noble/curves@^2.4.0, ACTIVE_TTL_STORAGE_KEY, activeTimers, cancelMessageBurn(), chainStepsCache, clearSecretChatSession(), dec (+74 more)

### Community 22 - "attachCardListeners"
Cohesion: 0.06
Nodes (45): append(), attesterPk, code, codeHash, connect(), feedCode, feedHash, feedKey() (+37 more)

### Community 23 - "feedsize.ts"
Cohesion: 0.15
Nodes (20): stageOf(), STAGES, Bloom, Branch, clamp(), curve(), [CX, GROUND], end() (+12 more)

### Community 24 - "Contributor Covenant Code of Conduct"
Cohesion: 0.16
Nodes (21): ARTICLE_CACHE_PREFIX, ARTICLE_DRAFTS_PREFIX, ARTICLE_PREFIX, ArticleDraft, articleDraftsKey(), ArticlePayload, ArticleRef, cacheArticlePayload() (+13 more)

### Community 25 - "versionCheck.ts"
Cohesion: 0.26
Nodes (4): bytesToHex, RiverRooms, vkOf(), world()

### Community 26 - "avatar.ts"
Cohesion: 0.10
Nodes (14): seedReadMark(), decryptWithSymmetricKey(), encryptDirectMessage(), encryptWithSymmetricKey(), getCryptoKeyFromBytes(), readEncPubs(), computeRoomJoinProof(), MessengerActiveState (+6 more)

### Community 27 - "createMessengerChat"
Cohesion: 0.09
Nodes (50): compressAvatarFile(), playChatVoiceByHash(), hasLanMesh(), setChatStatus(), createMessengerChat(), activeConvKey(), buildUnifiedConversations(), cancelActiveRecording() (+42 more)

### Community 28 - "icons.ts"
Cohesion: 0.06
Nodes (114): Feed, fillAsocial(), nodeOrigin(), commentsBy(), fillDelta(), fillFh(), fillFreenames(), fillFreepolls() (+106 more)

### Community 29 - "web.rs"
Cohesion: 0.05
Nodes (45): VoiceEvent, Cancelled, Done, Error, Started, Tick, MANUAL_INSTALL_URL, ANSWER_DEADLINE (+37 more)

### Community 30 - "asocial.ts"
Cohesion: 0.11
Nodes (30): ASOCIAL_RECORDS_CODE, ASOCIAL_RECORDS_CODE_BYTES, ASOCIAL_REPO, ASOCIAL_SITE, AsocialData, asocialLink(), asocialOwnStoreKey(), asocialOwnStoreParams() (+22 more)

### Community 31 - "with"
Cohesion: 0.05
Nodes (46): runs-on, steps, runs-on, steps, strategy, TAG_NAME, messenger_name, name (+38 more)

### Community 32 - "CHANGELOG.md"
Cohesion: 0.19
Nodes (11): CommunitySort, compare(), findCommunities(), FinderInput, FinderResult, slugOf(), createCommunityFromPage(), openCreateCommunityDialog() (+3 more)

### Community 33 - "steps"
Cohesion: 0.06
Nodes (40): BRANCH, GH_TOKEN, TITLE, VERSION, jobs, prepare, publish, name (+32 more)

### Community 34 - "NotificationItem"
Cohesion: 0.00
Nodes (534): accentSelect, activeFilterBanner, activeFilterPrefix, activeFilterTag, addModForm, addModPubkeyInput, alerted, allCommunities (+526 more)

### Community 35 - "delta.ts"
Cohesion: 0.17
Nodes (19): decodeCbor(), deltaCard(), deltaInCaption(), DeltaPage, deltaPrefixOf(), DeltaSite, DeltaUri, pageHref() (+11 more)

### Community 36 - "nodeOrigin"
Cohesion: 0.08
Nodes (36): chunk(), coverUrls, Fetch, fillFreetunes(), fillFreetunesProfile(), fmtTime(), FREETUNES_DIR_ADMIN, FREETUNES_DIR_CODE_HASH (+28 more)

### Community 37 - "types.ts"
Cohesion: 0.13
Nodes (33): closeModal(), hasOpenModal(), installModalDismiss(), openModals(), ActiveView, clearSelectedPostCard(), closeOtherPages(), findNextCardIndex() (+25 more)

### Community 38 - "hexToBytes"
Cohesion: 0.12
Nodes (30): hexToBytes, registryKey(), zoneKey(), freetunesDirKey(), Exports, loadRiver(), river(), RIVER_SITE (+22 more)

### Community 39 - "createMessengerChat"
Cohesion: 0.06
Nodes (49): MUST: content moderation, all 3 layers, Decisions, foldHandles(), formatHandle(), isValidHandle(), normalizeHandle(), RESERVED_HANDLES, bodies() (+41 more)

### Community 40 - "Reader"
Cohesion: 0.16
Nodes (21): aesGcmDecrypt(), aesGcmEncrypt(), computeRoomJoinProof(), connectMessage(), dec, decryptRoomKey(), decryptRoomKeyFromPeer(), decryptWithSymmetricKey() (+13 more)

### Community 41 - "secretChat.ts"
Cohesion: 0.16
Nodes (17): before, draftTranslateHtml(), initDraftTranslate(), translateKeeping(), setReaderLang(), availableLangs(), cachedAvail, detectLang() (+9 more)

### Community 42 - "delegate.ts"
Cohesion: 0.13
Nodes (31): baseViewBoxDims(), viewBoxFor(), applySim(), applySvgViewBoxOnly(), attachSim(), getTreeSvgEl(), handleNodeDoubleClick(), handleNodeSelect() (+23 more)

### Community 43 - "messengerLogic.ts"
Cohesion: 0.14
Nodes (13): containerOf(), CONTAINERS, isHeavy(), LIMITS, all, cfg, cfgPath, dist (+5 more)

### Community 44 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+4 more)

### Community 45 - "icons.ts"
Cohesion: 0.19
Nodes (26): AudioQueueState, AudioQueueTrack, createAudioQueueState(), enqueueInQueue(), filterFreetunesReleases(), formatAudioTime(), nextQueueIndex(), playInQueue() (+18 more)

### Community 46 - "handleJoinFromInviteUrl"
Cohesion: 0.17
Nodes (26): freenet, foldGreenhouse(), append(), commentHtml(), copyTextWithFeedback(), displayName(), focusGreenhouseSeed(), GreenhouseLinfaInfo (+18 more)

### Community 47 - ".applyLog"
Cohesion: 0.10
Nodes (8): localReadMarks(), onMeshPacket(), dedupeChat(), foldChat(), foldChatRead(), isDmEntry(), keepNewest(), NotificationItem

### Community 48 - "caption.test.ts"
Cohesion: 0.05
Nodes (69): mediabunny, compressPostImageFile(), analyzeAudioBlob(), AUDIO_EXT, base64ToBytes(), blobCache, canvasToJpegBlob(), ChatMediaItem (+61 more)

### Community 49 - "donation-contract/package.json"
Cohesion: 0.06
Nodes (35): path, { subtask }, { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD }, devDependencies, chai@^4.5.0, ethers@^6.17.0, hardhat@^2.29.1, @nomicfoundation/hardhat-chai-matchers@^2.1.2 (+27 more)

### Community 50 - "audio.rs"
Cohesion: 0.08
Nodes (14): base64_encode(), base64_matches_rfc4648_vectors(), downsample_to_mono_16k(), encode_wav_mono_16k(), encodes_valid_wav_header(), NativeVoiceController, push_mono_chunk(), RecCmd (+6 more)

### Community 51 - "ref_node_assert"
Cohesion: 0.09
Nodes (10): bytes, imports, CURRENT, LEGACY, anchorElementInViewport(), AnchorScrollOptions, cancelAnchoredScroll(), [ME, BOB, EVE] (+2 more)

### Community 52 - "mailClient.ts"
Cohesion: 0.14
Nodes (32): @noble/post-quantum, ADDRESS_CHARS, AftTier, AftTokenAssignment, decryptFreenetMailV1(), FreenetMailIdentity, INBOX_V1_CODE_HASH, TOKEN_RECORD_V1_CODE_HASH (+24 more)

### Community 54 - "steps"
Cohesion: 0.07
Nodes (27): concurrency, cancel-in-progress, group, environment, runs-on, steps, name, url (+19 more)

### Community 55 - "delegate.ts"
Cohesion: 0.15
Nodes (23): api(), asBytes(), call(), chain, dec, delegateMessage(), enc, extractPayload() (+15 more)

### Community 56 - "secretChat.ts"
Cohesion: 0.21
Nodes (26): amVouched(), ghostkeyKey(), pohKey(), refreshSupporters(), foldSupporters(), getStoredReceipt(), saveStoredReceipt(), supporterBadge() (+18 more)

### Community 57 - "Radica — domain language"
Cohesion: 0.29
Nodes (6): Device storage, Greenhouse, Linfa, Radica — domain language, 14. 🌳 Living Tree: Visual Network & Conversation Graph, Seed

### Community 58 - "ChatMessage"
Cohesion: 0.17
Nodes (11): 2. Caps that bound size without letting spam evict real content, 3. Hex and delta fixes, 4. Rollout, 5. Carrying all data (no rollback), Context & Goal, Design, Open questions, Status (+3 more)

### Community 59 - "rootsfx.ts"
Cohesion: 0.29
Nodes (6): cborEncode(), CborValue, Reader, readValue(), writeHead(), writeValue()

### Community 60 - "splitNotifs"
Cohesion: 0.06
Nodes (55): InstallStep, Downloading, FindingRelease, Installing, Verifying, WaitingForInstaller, a_failed_record_write_leaves_no_temporary_file(), a_failed_rewrite_of_a_record_leaves_it_whole() (+47 more)

### Community 61 - "freenet.ts"
Cohesion: 0.05
Nodes (65): dmPeerOf(), commentMsg3(), decryptDirectMessage(), decryptRoomKeyFromPeer(), deleteMsg3(), enc, encryptRoomKeyForPeer(), FEED_POW_BITS (+57 more)

### Community 62 - "loadMailContacts"
Cohesion: 0.09
Nodes (37): ANONYMOUS_AUTHOR, ARTICLE_PREFIX, ArticlePayload, buildPayload(), countWords(), estimateReadingMinutes(), extractTags(), parsePayload() (+29 more)

### Community 63 - "treePage.ts"
Cohesion: 0.20
Nodes (13): 15. 🗣️ Reddit-Style Communities (`r/slug`) & Standalone Single Post View, computeHotRank(), computeNetScore(), flairInfoForPost(), formatThreadComposeCaption(), RedditFlairFilter, RedditSort, RedditViewMode (+5 more)

### Community 64 - "package.json"
Cohesion: 0.15
Nodes (15): dependencies, @semaphore-protocol/core@^4.14.5, viem@^2.57.14, devDependencies, vite@^6.4.5, viem, vite, name (+7 more)

### Community 65 - "moderation.spec.ts"
Cohesion: 0.08
Nodes (3): @playwright/test, makeMeAModerator(), receive()

### Community 66 - "package.json"
Cohesion: 0.16
Nodes (15): dependencies, @freenetorg/freenet-stdlib@^0.4.0, @noble/ed25519@^2.3.0, @noble/hashes@^2.4.0, viem@^2.57.14, @freenetorg/freenet-stdlib, @noble/ed25519, @noble/hashes (+7 more)

### Community 67 - "createMessengerChat"
Cohesion: 0.18
Nodes (24): anteProof(), bitsOf(), cat(), cbor(), challengeBytes(), enc, grind(), head() (+16 more)

### Community 68 - "createArticlesPage"
Cohesion: 0.22
Nodes (28): articleMissingNote(), buildNewsletterEmail(), countWords(), estimateReadingMinutes(), extractArticleTags(), getCachedArticlePayload(), parseArticleCaption(), parseArticlePayload() (+20 more)

### Community 69 - "RiverRooms"
Cohesion: 0.20
Nodes (18): canon(), FREETREE_PATH, FREETREE_REPO, FREETREE_SITE, FREETREE_URL_RE, freetreeCard(), freetreeDataName(), freetreeHref() (+10 more)

### Community 70 - "BatchTranslator"
Cohesion: 0.20
Nodes (3): @browsermt/bergamot-translator/translator.js, BatchTranslator, TranslatorBacking

### Community 71 - "attester"
Cohesion: 0.10
Nodes (21): build, depends_on, environment, network_mode, restart, volumes, context, dockerfile (+13 more)

### Community 73 - "Radica donation contract"
Cohesion: 0.33
Nodes (5): Before Base mainnet, Deploy, Deployments, Radica donation contract, Test

### Community 74 - "fh.ts"
Cohesion: 0.22
Nodes (10): blockPublishBtnForNsfw(), blockPublishBtnForUnverified(), isPostInCooldown(), resetPublishBtnState(), revokePosterUrl(), setMediaSensitive(), setMediaVerifiedSafe(), showScanResult() (+2 more)

### Community 75 - "Radica attester"
Cohesion: 0.25
Nodes (7): AI moderation helper, CapRover, Contract sweep, FreeTunes check, Radica attester, Run, Test

### Community 76 - "linfa.ts"
Cohesion: 0.14
Nodes (17): 11. 🌱 Linfa: a Plant on Every Profile, Gain, gains(), Linfa, linfaGreenhouseWeight(), linfaOf(), MIN_TRUSTED_RECEIVED, PlantSeason (+9 more)

### Community 77 - "verifyVisoPoh"
Cohesion: 0.21
Nodes (14): decodeProof(), asBytes(), asNumber(), asString(), cborDecode(), mapGet(), DelegationProofV1, PohBadge (+6 more)

### Community 78 - "fetch-translation-models.mjs"
Cohesion: 0.20
Nodes (4): dest, out, pairs, registry

### Community 79 - "network.ts"
Cohesion: 0.14
Nodes (13): limiter(), codes, dec, enc, fgGate, keyCache, IDLE_PROBE_MS, nextDelay() (+5 more)

### Community 80 - "versionCheck.ts"
Cohesion: 0.11
Nodes (29): CHAIN_ID, DEPLOY_BLOCK, ETH_FAUCET_URL, FAUCET_URL, GROUPS, RPC_URLS, SEMAPHORE, SUPPORT (+21 more)

### Community 83 - "supporter.ts"
Cohesion: 0.19
Nodes (19): clearStoredReceipt(), dec, enc, fromBase64(), isReceiptRemoved(), issueReceipt(), parseReceiptToken(), RECEIPT_ISSUERS (+11 more)

### Community 84 - "DesktopHost"
Cohesion: 0.14
Nodes (16): Answer, Nothing, NoVersion, Version, ask(), classify(), DesktopHost, NodeProbe (+8 more)

### Community 85 - "orto.ts"
Cohesion: 0.12
Nodes (18): canonicalFieldStr(), CLAIMS_LOG, enc, issueReceipt(), judgeClaim(), logEntryMessage(), logEntryMessage2(), powBits() (+10 more)

### Community 86 - "river-watch.py"
Cohesion: 0.21
Nodes (6): fetch_latest_river_rev(), ours(), replace_one(), single_line(), validate_room_record(), verify_blake3()

### Community 89 - "Req"
Cohesion: 0.11
Nodes (19): Join, Req, Accept, Act, Apply, Deputies, DmSend, ExportIdentity (+11 more)

### Community 91 - "🚨 Mandatory Rule: Features, Updates Tab & Documentation"
Cohesion: 0.50
Nodes (3): MUST: updates tab + docs, same session, Radica — Agent Rules, Testing & verification

### Community 92 - "resolve"
Cohesion: 0.07
Nodes (37): a_manifest_signed_by_another_key_is_refused(), a_real_signed_release_manifest_verifies(), a_tampered_manifest_is_refused(), a_truncated_or_missing_signature_is_refused(), an_asset_must_match_its_checksum_and_be_listed(), asset_name(), asset_name_for(), check_manifest_version() (+29 more)

### Community 93 - ".onCreate"
Cohesion: 0.12
Nodes (5): Client, Node, CHECKING, MISSING, STOPPED

### Community 94 - "ok"
Cohesion: 0.32
Nodes (16): apply(), deputy_badges_follow_river_relevance(), direct_messages_go_both_ways(), hx(), identity_tokens_round_trip_with_river_format(), legacy_lists_earlier_room_contracts_newest_first(), ok(), one_public_link_lets_each_holder_in_as_their_own_member() (+8 more)

### Community 95 - "greenhouse.ts"
Cohesion: 0.16
Nodes (13): formatSeedsForAi(), greenhousePermalink(), greenhouseTokens(), MAX_COMMENT, parse(), SEED_DAYS, SEED_STATUSES, SeedComment (+5 more)

### Community 96 - "freetunes.test.ts"
Cohesion: 0.26
Nodes (15): bitsOf(), cat(), challengeBytes(), checkProof(), enc, grind(), makeProof(), Proof (+7 more)

### Community 97 - "fillFreetunes"
Cohesion: 0.39
Nodes (7): isSporeRadioLive(), RADIO_HEARTBEATS, recordSporeRadioHeartbeat(), SPORE_REPO, sporeRadioCard(), sporeRadioLink(), SporeRadioRef

### Community 98 - "riverPointer.ts"
Cohesion: 0.18
Nodes (24): getIdentity(), Voter, takeHandedKey(), canonicalBase(), certShowsHost(), connectMessage(), createLocalIdentity(), enc (+16 more)

### Community 99 - "resolve"
Cohesion: 0.52
Nodes (5): along(), Box, f(), growRoots(), rootPaths()

### Community 100 - "renderIdentityModal"
Cohesion: 0.26
Nodes (14): cleanExcerpt(), decodeB64u(), encodeB64u(), ORTO_PATH, ORTO_SITE, ORTO_VAULT_CODE_HASH, OrtoBlog, ortoCard() (+6 more)

### Community 101 - "messengerChat.ts"
Cohesion: 0.09
Nodes (41): asocialCard(), plainMentions(), renderChatText(), chatMediaCardsHtml(), fileExtensionIcon(), formatBytes(), MAX_VNOTE_BYTES, summarizeChatMediaText() (+33 more)

### Community 102 - "media.ts"
Cohesion: 0.27
Nodes (9): mediaObserver, dataUrlBytes(), inflight, keepMedia(), MEDIA_PREFIX, mediaUrl(), urls, bytes (+1 more)

### Community 103 - "musicPage.ts"
Cohesion: 0.19
Nodes (14): FREEHOLE_PATH, FREEHOLE_REPO, FREEHOLE_SITE, FREEHOLE_URL_RE, freeholeCard(), freeholeHref(), freeholeLink(), FreeHoleRef (+6 more)

### Community 104 - "chatMedia.test.ts"
Cohesion: 0.07
Nodes (42): a_command_that_hangs_is_killed_at_the_deadline(), a_leftover_user_unit_beside_a_system_unit_gets_a_way_out(), a_process_left_holding_stderr_does_not_hold_up_run(), a_registered_service_is_just_started(), a_registered_service_that_fails_is_reported_never_registered_again(), a_stopped_system_service_is_left_to_the_administrator(), a_suggested_command_survives_any_path(), BIN (+34 more)

### Community 107 - "communitiesPage.ts"
Cohesion: 0.11
Nodes (29): DELTA_WEB, AppFilter, AppGroup, appId(), ATLAS_SITE, AULA_SITE, CustomAppRecord, customRecordToApp() (+21 more)

### Community 108 - "TASK-001: Responsive 13.3" Laptop Layout for Wall & Profile Modal"
Cohesion: 0.33
Nodes (5): Context, Problem Analysis, Requirements, Status, TASK-001: Responsive 13.3" Laptop Layout for Wall & Profile Modal

### Community 109 - "treeGraph.ts"
Cohesion: 0.08
Nodes (37): FT_TREE_PREFIX, shortenKey(), ARTICLE_BOUGH, buildTreeGraph(), CATEGORY_BOUGHS, clamp(), computeNetworkTreeStage(), cut() (+29 more)

### Community 110 - "sendMailMessage"
Cohesion: 0.24
Nodes (15): bytesEqual(), deleteMailContact(), getContactsStorageKey(), getRecipientSuggestions(), isValidMailAddress(), loadAftAssignments(), loadMailContacts(), normalizeMailAddress() (+7 more)

### Community 111 - "linfa.ts"
Cohesion: 0.40
Nodes (4): Context & Goal, Requirements, Status, TASK-004: Long-Form Articles & Decentralized Newsletters (Substack / Medium)

### Community 112 - "Radica Issues & Task Tracker"
Cohesion: 0.29
Nodes (6): Already Covered, Planned (`TODO`), Radica Issues & Task Tracker, 🌐 Social Hub Coverage & Expansion Roadmap, 📋 Task Index, 🎯 Task Status Legend

### Community 113 - "freetree.ts"
Cohesion: 0.40
Nodes (4): Context & Goal, Requirements, Status, TASK-005: Multi-Channel Community Spaces (Discord)

### Community 114 - "steps"
Cohesion: 0.14
Nodes (13): jobs, test, name, on, name, run, uses, with (+5 more)

### Community 115 - "pow.ts"
Cohesion: 0.18
Nodes (19): COMMENT_POW_BITS, countLeadingZeroBits(), createPoWChallenge(), DEFAULT_TIER0_DIFFICULTY, enc, failPowWorker(), ID_PREFIX, POST_POW_BITS (+11 more)

### Community 116 - "TASK-003: Mail Contacts Management (Add & Remove Contacts)"
Cohesion: 0.33
Nodes (5): Context & Request, Requirements, Status, TASK-003: Mail Contacts Management (Add & Remove Contacts), MailFolder

### Community 117 - "TASK-006: Short-Form Vertical Video & Video Channels (TikTok / YouTube)"
Cohesion: 0.40
Nodes (4): Context & Goal, Requirements, Status, TASK-006: Short-Form Vertical Video & Video Channels (TikTok / YouTube)

### Community 118 - "TASK-007: Curated Boards & Collections (Pinterest / Are.na)"
Cohesion: 0.50
Nodes (3): Context & Goal, Requirements, TASK-007: Curated Boards & Collections (Pinterest / Are.na)

### Community 119 - "TASK-008: Social Audio, Podcasts & Persistent Player (Spotify / FreeTunes)"
Cohesion: 0.40
Nodes (4): Context & Goal, Requirements, Status, TASK-008: Social Audio, Podcasts & Persistent Player (Spotify / FreeTunes)

### Community 120 - "TASK-009: Dedicated Events Calendar & RSVP System (Luma / Meetup)"
Cohesion: 0.40
Nodes (4): Context & Goal, Requirements, Status, TASK-009: Dedicated Events Calendar & RSVP System (Luma / Meetup)

### Community 121 - "mentionPicker.ts"
Cohesion: 0.13
Nodes (11): decodeBase64State(), encodeBase64State(), FORBIDDEN_PROTO_KEYS, HASH_SAFE_OPTIONAL_PREFIXES, HASH_SAFE_SOFT_PREFIXES, isHashSafeKey(), isSensitiveStorageKey(), nativeBridge() (+3 more)

### Community 122 - "loadTreePage"
Cohesion: 0.07
Nodes (28): checkMilestones(), collectTreePeers(), collectTreePosts(), getWebOfTrust(), isKnownSender(), loadTreePage(), markSeen(), networkCounts() (+20 more)

### Community 123 - "scripts"
Cohesion: 0.11
Nodes (21): dependencies, @freenetorg/freenet-stdlib@latest, @noble/hashes@^2.4.0, devDependencies, typescript@^5.6.0, vite@^6.0.0, @freenetorg/freenet-stdlib, @noble/hashes (+13 more)

### Community 124 - "rootsfx.ts"
Cohesion: 0.17
Nodes (20): cleanHash(), dec, enc, FH_APP_PATH, FH_LIST_CODE_HASH, FH_REPO, FH_SITE, fhLink() (+12 more)

### Community 125 - "anchorElementInViewport"
Cohesion: 0.19
Nodes (8): EQUAL, FeedSort, FUTURE_SLACK_MS, postScore(), sortPosts(), Weights, WINDOW_MS, now

### Community 126 - "musicPage.ts"
Cohesion: 0.19
Nodes (7): createDurable(), durable, DURABLE_PREFIXES, DurableNode, DurableStore, isDurable(), packageKey()

### Community 127 - "feedsize.ts"
Cohesion: 0.31
Nodes (8): FEED_BUDGET, FEED_SHOW, FEED_TARGET, feedBytes(), formatBytes(), oldestToFree(), postBytes(), renderFeedSize()

### Community 128 - "conversationState.ts"
Cohesion: 0.13
Nodes (20): ConversationDeps, ConversationState, createConversationState(), Delivery, formatBurnRemaining(), KeyValue, nextTtl(), READ_MARKS_KEY (+12 more)

### Community 129 - "communitiesPage.ts"
Cohesion: 0.33
Nodes (11): openSettingsModal(), updateNotifsSoundBtn(), getAudioContext(), isSoundEnabled(), playBufferPop(), playPopSound(), playSynthesizedPop(), preloadPopSound() (+3 more)

### Community 130 - "verifiedPohBadgesByAuthor"
Cohesion: 0.11
Nodes (33): Supporters, RFC-9474, AnteTier, anteTierOf(), cat(), checkedDelegations, checkedPohEntries, CheckedPohEntry (+25 more)

### Community 131 - "boards.ts"
Cohesion: 0.13
Nodes (27): Status, addItemToBoard(), BOARD_PREFIX, BoardFilterOpts, BoardItem, boardPermalink(), createBoard(), CuratedBoard (+19 more)

### Community 132 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+4 more)

### Community 133 - "roots.ts"
Cohesion: 0.44
Nodes (7): isSaved(), keyOf(), load(), memo, savedId(), savedPosts(), toggleSaved()

### Community 134 - "🚀 Getting Started"
Cohesion: 0.14
Nodes (14): 1. Installation, 2. Development Mode, 3. Contract Compilation & Testing, 4. Build Production Web Application, 5. Publish to Freenet, 6. Launch the Desktop App (Rust + Freenet node), 🏗️ Architecture, 🚀 Getting Started (+6 more)

### Community 136 - "ghostkey.ts"
Cohesion: 0.40
Nodes (5): attachMentionPicker(), namesToKeys(), Person, picked, withMentionKeys()

### Community 137 - "wallets.ts"
Cohesion: 0.12
Nodes (21): Profile extras, isValidLogEntry(), KVStore, mergeLoadedWalletInputs(), PROFILE_EXTRA_LOGS, PROFILE_EXTRAS_BACKUP_PREFIX, profileExtraLogNames(), restoreOwnProfileExtras() (+13 more)

### Community 138 - "durable.ts"
Cohesion: 0.36
Nodes (8): handleSignOut(), check(), newNotes(), shortNote(), showReloadModal(), startVersionCheck(), restart(), signOut()

### Community 139 - "Folio"
Cohesion: 0.29
Nodes (6): Development, Folio, License, Limitations, Publishing, What it does

### Community 140 - "avatar.ts"
Cohesion: 0.67
Nodes (3): avatarCache, buildDefaultAvatar(), svgToBase64Uri()

### Community 141 - ".push"
Cohesion: 0.23
Nodes (7): Key fact: the migration machinery already exists, bgGate, contractCode(), ContractId, contractKey(), partsOf(), toU8()

### Community 143 - "syncFreenetMailInbox"
Cohesion: 0.36
Nodes (8): hex(), INFO, newEpk(), openEsk(), unhex(), hex(), seal(), un()

### Community 144 - "linfa.ts"
Cohesion: 0.13
Nodes (25): cacheKeyOf(), fillChatMedia(), formatMediaDuration(), hydrateVnoteCard(), keepChatMediaUrl(), loadInPlayer(), observeLazyPoster(), pauseAllOtherMedia() (+17 more)

### Community 145 - "CHANGELOG.md"
Cohesion: 0.29
Nodes (10): Mail, fromBase58(), toBase58(), deriveContractInstanceFromJsonParams(), deriveInboxContract(), deriveTokenRecordContractAddress(), initialInboxState(), unversionedWasm() (+2 more)

### Community 146 - "vite.config.ts"
Cohesion: 0.13
Nodes (4): UPDATES, ASSET_KEYS, BUILD, FREENET_ASSETS

### Community 147 - "updateMailBadges"
Cohesion: 0.23
Nodes (13): filterMailMessages(), formatMailDate(), getUnreadMailCount(), formatMailContent(), getOrDeriveFmailIdentity(), openMailComposer(), openMailModal(), openMailTokensModal() (+5 more)

### Community 148 - "init"
Cohesion: 0.06
Nodes (59): generateDefaultAvatar(), yieldToMain(), alertUnread(), applyAccent(), applyDashboardSlots(), applyProfile(), applyTheme(), bootStep() (+51 more)

### Community 149 - "postGone.ts"
Cohesion: 0.31
Nodes (10): checked, checkGhostkey(), ghostkey(), GHOSTKEYS_VAULT, REFUSALS, requestGhostkeyProof(), verifiedGhostkeys(), loadJsonWasm() (+2 more)

### Community 150 - "Radica: Terms of Use, Disclaimer and Privacy"
Cohesion: 0.18
Nodes (9): 1. Software provided "as is", 2. No central service, no central moderation, 3. Your responsibility, 4. Donations and supporter badges, 5. Greenhouse, 6. Privacy, 7. Reporting illegal content, 8. Changes (+1 more)

### Community 151 - "encryptFreenetMailV1"
Cohesion: 0.27
Nodes (9): Context & Bug Report, Requirements, Status, TASK-002: Fix Native Freemail Reply: Use Inbox Contract Token as Sender `from`, buildAftSignatureContent(), encryptFreenetMailV1(), sanitizeMailAlias(), resolveFreemailSenderAddress() (+1 more)

### Community 152 - "renderHeader"
Cohesion: 0.29
Nodes (10): canCaptureVideoNote(), canRecordVoice(), canUseLiveMediaCapture(), getNativeVoiceBridge(), hasNativeVoiceBridge(), isTouchMobileDevice(), renderHeader(), syncComposerButtons() (+2 more)

### Community 153 - "super"
Cohesion: 0.31
Nodes (4): a_packet_on_the_port_reaches_the_page_and_an_oversized_one_does_not(), MAX_BYTES, Mesh, PORT

### Community 154 - "heavyUrl"
Cohesion: 0.36
Nodes (8): closeGifPicker(), CURATED_GIFS, GifItem, openGifPicker(), isDirectUrl(), renderGrid(), safeDirectUrl(), heavyUrl()

### Community 158 - "walkieTalkie.ts"
Cohesion: 0.07
Nodes (22): Chat, decodeWaveformHex(), encodeChatMediaToken(), encodeWaveformHex(), parseChatMedia(), parseMatchedToken(), revokeChatMediaInText(), processClassicVideoNote() (+14 more)

### Community 159 - "escapeHtml"
Cohesion: 0.06
Nodes (65): renderArticleFeedCardHtml(), renderAnteBadgeHtml(), renderPohProviderBadgesHtml(), renderPostSubMetaHtml(), renderTrustBadgeHtml(), renderBoardSummaryCardHtml(), CHAT_TOKEN_RE, chatText() (+57 more)

### Community 160 - "rotation"
Cohesion: 0.29
Nodes (4): Invitation, kick_rotation_excludes_banned_invite_subtree(), rotation(), time()

### Community 161 - "Req"
Cohesion: 0.25
Nodes (8): Req, Export, Get, Init, Pubkey, Put, Replace, Sign

### Community 162 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, e2e, prebuild, predev, preview, test

### Community 163 - "refresh.ts"
Cohesion: 0.39
Nodes (6): changeOf(), LIVE_RECHECK_MS, REFRESH_EVERY_MS, shouldFetch(), Update, base

### Community 166 - "postGone.ts"
Cohesion: 0.60
Nodes (3): GONE_MESSAGE, WhyGone, whyGone()

## Knowledge Gaps
- **64 isolated node(s):** `CHECKING`, `MISSING`, `STOPPED`, `radica-desktop`, `Started` (+59 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1665 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `FreenetClient` connect `moderation.ts` to `verifiedPohBadgesByAuthor`, `🌟 Key Features`, `wallets.ts`, `resetPublishBtnState`, `.push`, `types.ts`, `FreenetNetwork`, `CHANGELOG.md`, `compilerOptions`, `versionCheck.ts`, `avatar.ts`, `asocial.ts`, `delta.ts`, `nodeOrigin`, `withTimeout`, `createMessengerChat`, `icons.ts`, `.applyLog`, `caption.test.ts`, `freenet.ts`, `verifyVisoPoh`, `riverPointer.ts`, `renderIdentityModal`, `rootsfx.ts`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `createMessengerChat()` (e.g. with `closeMentionPopup()` and `onViewportResize()`) actually correct?**
  _`createMessengerChat()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `CHECKING`, `MISSING`, `STOPPED` to the rest of the system?**
  _64 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `freenetMail.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07716701902748414 - nodes in this community are weakly interconnected._
- **Why does `Decisions` connect `createMessengerChat` to `init`, `boards.ts`, `wallets.ts`, `moderation.ts`, `resetPublishBtnState`, `types.ts`, `CHANGELOG.md`, `init`, `.shouldInterceptRequest`, `icons.ts`, `createMessengerChat`, `NotificationItem`, `delegate.ts`, `handleJoinFromInviteUrl`, `.applyLog`, `Radica — domain language`, `freenet.ts`, `linfa.ts`, `greenhouse.ts`, `messengerChat.ts`, `.isRadicaUrl`, `Override`, `communitiesPage.ts`, `treeGraph.ts`, `sendMailMessage`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Should `lib.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.05001139211665528 - nodes in this community are weakly interconnected._
- **Why does `MainActivity` connect `MainActivity` to `.onShowFileChooser`, `.isRadicaUrl`, `Override`, `MainActivity.java`, `.shouldInterceptRequest`, `.onCreate`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._