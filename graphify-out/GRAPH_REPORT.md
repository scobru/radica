# Graph Report - radica  (2026-11-23)

## Corpus Check
- 305 files · ~431,117 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 41 file(s) not represented in the graph (top: (none) 13, .wasm 13, .css 5)

## Summary
- 4829 nodes · 13194 edges · 182 communities (147 shown, 35 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 501 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ed2e2548`
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
- escapeHtml
- FreenetClient
- postGone.ts
- freenames.ts
- vite.config.ts
- signOut
- feedlight.ts
- caption.ts
- river-wasm/src/lib.rs
- SafeStorage
- .process
- secretChatTransport.ts
- MainActivity
- attachCardListeners
- feedsize.ts
- Contributor Covenant Code of Conduct
- versionCheck.ts
- UserIdentity
- messengerChat.ts
- renderTimeline
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
- chatMedia.ts
- donation-contract/package.json
- audio.rs
- ref_node_assert
- mailClient.ts
- steps
- delegate.ts
- secretChat.ts
- secretRatchet.ts
- secretChat.ts
- rootsfx.ts
- splitNotifs
- freenet.ts
- loadMailContacts
- treePage.ts
- package.json
- @playwright/test
- package.json
- createMessengerChat
- createArticlesPage
- RiverRooms
- BatchTranslator
- attester
- milestones.ts
- Radica donation contract
- fh.ts
- Radica attester
- linfa.ts
- openUserProfile
- fetch-translation-models.mjs
- network.ts
- versionCheck.ts
- start.sh
- README.md
- contactCard.ts
- DesktopHost
- lanMesh.ts
- treeGraph.test.ts
- Req
- WalkieQueueController
- resolve
- ok
- core.test.js
- ref_noble_hashes
- fillFreetunes
- riverPointer.ts
- devDependencies
- renderIdentityModal
- merge_at
- media.ts
- musicPage.ts
- chatMedia.test.ts
- .isRadicaUrl
- Override
- communitiesPage.ts
- TASK-001: Responsive 13.3" Laptop Layout for Wall & Profile Modal
- treeGraph.ts
- types.ts
- WebOfTrust
- Radica Issues & Task Tracker
- freetree.ts
- steps
- pow.ts
- TASK-003: Mail Contacts Management (Add & Remove Contacts)
- TASK-006: Short-Form Vertical Video & Video Channels (TikTok / YouTube)
- river-watch.py
- TASK-008: Social Audio, Podcasts & Persistent Player (Spotify / FreeTunes)
- TASK-009: Dedicated Events Calendar & RSVP System (Luma / Meetup)
- SafeStorage
- CHANGELOG.md
- scripts
- rootsfx.ts
- mailClient.test.ts
- InstallStep
- feedsize.ts
- conversationState.ts
- encryptFreenetMailV1
- verifiedPohBadgesByAuthor
- boards.ts
- compilerOptions
- openPostLink
- 🚀 Getting Started
- savedPosts.ts
- finishWelcome
- profileExtras.ts
- mentionPicker.ts
- Folio
- topPosts.test.ts
- avatar.ts
- syncFreenetMailInbox
- setDashboardSlots
- postGone.ts
- vite.config.ts
- updateMailBadges
- reapplyDurablePreferences
- Radica — Agent Rules
- Radica: Terms of Use, Disclaimer and Privacy
- DelegationProofV1
- heavyUrl
- super
- rotation
- syncMobileViewport
- repost.ts
- updateChatPinBtnUI
- loadCustomApps
- scripts
- loadPinnedApps
- .onShowFileChooser
- make-icons.py
- build.rs
- feedbench
- radica-desktop
- radica-ghostkey
- radica-identity
- radica-log-contract
- radica-media-contract
- radica-river
- CONTAINERS
- LIMITS
- openClassicReactPicker
- flushDeferredTimelineRender
- fillWalletInputs
- stageMediaFile

## God Nodes (most connected - your core abstractions)
1. `FreenetClient` - 280 edges
2. `escapeHtml()` - 133 edges
3. `createMessengerChat()` - 118 edges
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
- `15. 🗣️ Reddit-Style Communities (`r/slug`) & Standalone Single Post View` --references--> `computeNetScore()`  [INFERRED]
  README.md → ui/src/communitiesPage.ts
- `8. 📸 Moments Compression & Sandboxed Persistence Engine` --references--> `SafeStorage`  [INFERRED]
  README.md → ui/src/storage.ts
- `4. 🌐 Cryptographic Personas & Decentralized Storage` --references--> `DelegationProofV1`  [INFERRED]
  README.md → ui/src/viso.ts

## Import Cycles
- 2-file cycle: `apps/desktop/src/host.rs -> apps/desktop/src/install.rs -> apps/desktop/src/host.rs`
- 2-file cycle: `ui/src/handles.ts -> ui/src/logfold.ts -> ui/src/handles.ts`
- 3-file cycle: `ui/src/crypto.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/crypto.ts`
- 4-file cycle: `ui/src/crypto.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/riverPointer.ts -> ui/src/crypto.ts`

## Communities (182 total, 35 thin omitted)

### Community 0 - "freenetMail.ts"
Cohesion: 0.08
Nodes (41): @noble/post-quantum, ADDRESS_CONTEXT, AFT_TIER_SPEC, AFT_TIERS, aftDayIndexInYear(), BODY_LEN, check2Of(), CHECK_CONTEXT (+33 more)

### Community 1 - "RiverRooms"
Cohesion: 0.17
Nodes (14): @desert-ant-labs/moderator, @desert-ant-labs/moderator@^4.0.0, filterWasmResponse(), analyzeImageFile(), analyzeTextContent(), BAD_WORDS, BAD_WORDS_RE, censorTextAndPII() (+6 more)

### Community 2 - "lib.rs"
Cohesion: 0.05
Nodes (97): hx(), key(), prepare(), run(), STATE, main(), state(), an_author_takes_back_a_comment_with_an_empty_version() (+89 more)

### Community 3 - "init"
Cohesion: 0.11
Nodes (41): askModel(), askRaw(), getEntries(), globalProtectedSet(), greenhousePass(), modPass(), resolveHeldOutcomes(), roomModPass() (+33 more)

### Community 4 - "scripts"
Cohesion: 0.07
Nodes (28): author, description, keywords, license, name, scripts, app, app:messenger (+20 more)

### Community 5 - "whoiam.ts"
Cohesion: 0.09
Nodes (29): ANTE_CODE_HASH, VOTE_BITS, enumVariant(), getIdentity(), anteCall(), code(), createPoll(), enc() (+21 more)

### Community 6 - "🌟 Key Features"
Cohesion: 0.12
Nodes (15): 10. ✉️ Radica Mail & Freenet Mail Interoperability (Post-Quantum), 12. 🔁 Reposts Without a Contract Change, 13. ⚙️ Dedicated Settings, Decluttered Rail & Wall-First Profiles, 13. 🖼️ Moments Gallery (Media Explore), 15. 🗣️ Reddit-Style Communities (`r/slug`) & Standalone Single Post View, 1. 🛡️ On-Device AI Moderation (Desert Ant Labs), 2. 🔒 Automated PII Redaction & Text Censorship, 3. ⏱️ Decentralized Anti-Flooding & Rate Limiting (+7 more)

### Community 7 - "handle"
Cohesion: 0.18
Nodes (18): a_secret_blob_that_does_not_decrypt_is_skipped(), body(), cbor(), entering(), handle(), is_private(), key32(), msg_id() (+10 more)

### Community 8 - "dependencies"
Cohesion: 0.10
Nodes (27): @browsermt/bergamot-translator, @fontsource-variable/fraunces, @fontsource-variable/inter, freenet-blob, jsqr, @litertjs/core, uqr, dependencies (+19 more)

### Community 9 - "escapeHtml"
Cohesion: 0.08
Nodes (77): renderArticleFeedCardHtml(), asocialCard(), asocialProfileCard(), asocialWorkHref(), shortKey(), generateDefaultAvatar(), renderBoardSummaryCardHtml(), canRecordVoice() (+69 more)

### Community 10 - "FreenetClient"
Cohesion: 0.04
Nodes (7): MUST: content moderation, all 3 layers, ContactCard, FreenetClient, backupOwnProfileExtras(), latestOwnLogEntry(), ProfileExtraKind, Community

### Community 11 - "postGone.ts"
Cohesion: 0.19
Nodes (18): maskProfanity(), BlobVideoRef, filterVideoReels(), formatBlobVideoCaption(), isVideoReelPost(), parseBlobVideoRef(), stepReelIndex(), VIDEO_BLOB_PREFIX (+10 more)

### Community 12 - "freenames.ts"
Cohesion: 0.10
Nodes (28): clearResolvedFreenames(), dec, enc, freenameInCaption(), freenamesCard(), FreenameUri, getResolvedFreename(), ID (+20 more)

### Community 13 - "vite.config.ts"
Cohesion: 0.12
Nodes (17): a_proof_holds_for_its_identity_only_and_under_the_real_master_only(), a_sign_result_becomes_the_bundle_viso_stores(), BIND_TAG, binding_payload(), call(), cbor(), empty_requestor_is_rejected(), fixture() (+9 more)

### Community 14 - "signOut"
Cohesion: 0.14
Nodes (35): an_author_s_newer_entry_replaces_the_older_under_one_key(), delta(), Entry, entry2(), entry(), entry_msg(), entry_msg2(), forgeries_and_replays_are_rejected() (+27 more)

### Community 15 - "feedlight.ts"
Cohesion: 0.08
Nodes (26): 1. Signatures: v3 messages, length-prefixed, v2 still accepted, 2. Caps that bound size without letting spam evict real content, 3. Hex and delta fixes, 4. Rollout, 5. Carrying all data (no rollback), Context & Goal, Design, Open questions (+18 more)

### Community 16 - "caption.ts"
Cohesion: 0.12
Nodes (31): CHAT_TOKEN_RE, chatText(), escMd(), extractCommentMedia(), isSafeUrl(), LINK_RE, linkCard(), linkify() (+23 more)

### Community 17 - "river-wasm/src/lib.rs"
Cohesion: 0.04
Nodes (9): call(), fill(), open(), random_fill(), RECORD, RIVER_AUTHOR_VK, RIVER_INVITATION, ROOM_CONTRACT_APP_ID (+1 more)

### Community 18 - "SafeStorage"
Cohesion: 0.16
Nodes (9): delta_only_to_a_peer_without_it(), IMG, MAX_MEDIA, only_the_named_bytes_are_valid(), params(), RadicaMediaContract, too_big_is_refused_even_with_its_hash(), update_keeps_or_adopts_the_valid_image() (+1 more)

### Community 19 - ".process"
Cohesion: 0.09
Nodes (17): Identity, key_of(), kv_name(), kv_names_are_validated_and_namespaced(), MAX_VALUE, parse_sk(), Req, Export (+9 more)

### Community 20 - "secretChatTransport.ts"
Cohesion: 0.13
Nodes (29): cancelMessageBurn(), getActiveSecretChatTTL(), getSecretRoomId(), addSecretChatPeer(), burnedKey(), burnSecretMessage(), editSecretMessage(), isSealedSecret() (+21 more)

### Community 21 - "MainActivity"
Cohesion: 0.12
Nodes (5): MainActivity, Node, CHECKING, MISSING, STOPPED

### Community 22 - "attachCardListeners"
Cohesion: 0.05
Nodes (50): append(), attesterPk, code, codeHash, connect(), feedCode, feedHash, feedKey() (+42 more)

### Community 23 - "feedsize.ts"
Cohesion: 0.15
Nodes (20): stageOf(), STAGES, Bloom, Branch, clamp(), curve(), [CX, GROUND], end() (+12 more)

### Community 24 - "Contributor Covenant Code of Conduct"
Cohesion: 0.16
Nodes (22): ARTICLE_CACHE_PREFIX, ARTICLE_DRAFTS_PREFIX, ARTICLE_PREFIX, ArticleDraft, articleDraftsKey(), ArticlePayload, ArticleRef, buildNewsletterEmail() (+14 more)

### Community 25 - "versionCheck.ts"
Cohesion: 0.26
Nodes (4): bytesToHex, RiverRooms, vkOf(), world()

### Community 26 - "UserIdentity"
Cohesion: 0.10
Nodes (10): seedReadMark(), computeRoomJoinProof(), MessengerActiveState, MessengerDeps, UnifiedConversation, RiverJoin, roomOwnerSk(), ChatMessage (+2 more)

### Community 27 - "messengerChat.ts"
Cohesion: 0.04
Nodes (95): Chat, plainMentions(), encodeChatMediaToken(), encodeWaveformHex(), formatBytes(), playChatVoiceByHash(), summarizeChatMediaText(), contactCardQrSvg() (+87 more)

### Community 28 - "renderTimeline"
Cohesion: 0.05
Nodes (90): Feed, maskChatMediaTokens(), commentsBy(), yieldToMain(), alertUnread(), amGlobalMod(), bindPostCardListeners(), checkCommunitiesOnNetwork() (+82 more)

### Community 29 - "web.rs"
Cohesion: 0.06
Nodes (43): MANUAL_INSTALL_URL, ANSWER_DEADLINE, app_mode_configures_messenger_binary(), AppMode, Full, Messenger, bring_up(), BUNDLED_ORIGIN (+35 more)

### Community 30 - "asocial.ts"
Cohesion: 0.12
Nodes (26): ASOCIAL_RECORDS_CODE, ASOCIAL_RECORDS_CODE_BYTES, ASOCIAL_REPO, AsocialData, asocialLink(), asocialOwnStoreKey(), asocialOwnStoreParams(), asocialPersonHref() (+18 more)

### Community 31 - "with"
Cohesion: 0.05
Nodes (47): runs-on, steps, runs-on, steps, strategy, TAG_NAME, messenger_name, name (+39 more)

### Community 32 - "CHANGELOG.md"
Cohesion: 0.26
Nodes (8): CommunitySort, compare(), findCommunities(), FinderInput, FinderResult, slugOf(), all, find()

### Community 33 - "steps"
Cohesion: 0.06
Nodes (40): BRANCH, GH_TOKEN, TITLE, VERSION, jobs, prepare, publish, name (+32 more)

### Community 34 - "NotificationItem"
Cohesion: 0.00
Nodes (543): accentSelect, activeFilterBanner, activeFilterPrefix, activeFilterTag, addModForm, addModPubkeyInput, alerted, allCommunities (+535 more)

### Community 35 - "delta.ts"
Cohesion: 0.17
Nodes (19): decodeCbor(), deltaCard(), deltaInCaption(), DeltaPage, deltaPrefixOf(), DeltaSite, DeltaUri, pageHref() (+11 more)

### Community 36 - "nodeOrigin"
Cohesion: 0.08
Nodes (31): chunk(), coverUrls, Fetch, fillFreetunesProfile(), fmtTime(), FREETUNES_DIR_ADMIN, FREETUNES_DIR_CODE_HASH, FREETUNES_KEY (+23 more)

### Community 37 - "types.ts"
Cohesion: 0.13
Nodes (33): closeModal(), hasOpenModal(), installModalDismiss(), openModals(), ActiveView, clearSelectedPostCard(), closeOtherPages(), findNextCardIndex() (+25 more)

### Community 38 - "hexToBytes"
Cohesion: 0.12
Nodes (29): hexToBytes, registryKey(), zoneKey(), freetunesDirKey(), Exports, loadRiver(), river(), RIVER_SITE (+21 more)

### Community 39 - "createMessengerChat"
Cohesion: 0.07
Nodes (60): GENESIS, foldHandles(), formatHandle(), isValidHandle(), normalizeHandle(), RESERVED_HANDLES, bodies(), canEditCommunity() (+52 more)

### Community 40 - "Reader"
Cohesion: 0.15
Nodes (22): signPrivateRoomMessage(), aesGcmDecrypt(), aesGcmEncrypt(), computeRoomJoinProof(), connectMessage(), dec, decryptRoomKey(), decryptRoomKeyFromPeer() (+14 more)

### Community 41 - "secretChat.ts"
Cohesion: 0.18
Nodes (18): before, draftTranslateHtml(), initDraftTranslate(), translateKeeping(), setReaderLang(), translatePostFromCard(), availableLangs(), cachedAvail (+10 more)

### Community 42 - "delegate.ts"
Cohesion: 0.12
Nodes (32): baseViewBoxDims(), TreeGraphModel, TreeViewMode, applySim(), applySvgViewBoxOnly(), attachSim(), getTreeSvgEl(), handleNodeDoubleClick() (+24 more)

### Community 43 - "messengerLogic.ts"
Cohesion: 0.14
Nodes (13): containerOf(), CONTAINERS, isHeavy(), LIMITS, all, cfg, cfgPath, dist (+5 more)

### Community 44 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+4 more)

### Community 45 - "icons.ts"
Cohesion: 0.18
Nodes (27): AudioQueueState, AudioQueueTrack, createAudioQueueState(), enqueueInQueue(), filterFreetunesReleases(), formatAudioTime(), nextQueueIndex(), playInQueue() (+19 more)

### Community 46 - "handleJoinFromInviteUrl"
Cohesion: 0.08
Nodes (46): Device storage, Greenhouse, Linfa, Radica — domain language, 14. 🌳 Living Tree: Visual Network & Conversation Graph, freenet, foldGreenhouse(), formatSeedsForAi() (+38 more)

### Community 47 - ".applyLog"
Cohesion: 0.10
Nodes (4): dmPeerOf(), localReadMarks(), setActiveSecretChatTTL(), NotificationItem

### Community 48 - "chatMedia.ts"
Cohesion: 0.04
Nodes (97): mediabunny, analyzeAudioBlob(), AUDIO_EXT, base64ToBytes(), blobCache, cacheKeyOf(), canCaptureVideoNote(), canUseLiveMediaCapture() (+89 more)

### Community 49 - "donation-contract/package.json"
Cohesion: 0.06
Nodes (35): path, { subtask }, { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD }, devDependencies, chai@^4.5.0, ethers@^6.17.0, hardhat@^2.29.1, @nomicfoundation/hardhat-chai-matchers@^2.1.2 (+27 more)

### Community 50 - "audio.rs"
Cohesion: 0.07
Nodes (20): base64_encode(), base64_matches_rfc4648_vectors(), downsample_to_mono_16k(), encode_wav_mono_16k(), encodes_valid_wav_header(), NativeVoiceController, push_mono_chunk(), RecCmd (+12 more)

### Community 51 - "ref_node_assert"
Cohesion: 0.09
Nodes (14): splitNotifs(), cut(), Root, rootsSvg(), along(), Box, f(), growRoots() (+6 more)

### Community 52 - "mailClient.ts"
Cohesion: 0.12
Nodes (27): BIP39_WORDLIST, ADDRESS_CHARS, AftTier, AftTokenAssignment, FreenetMailIdentity, TOKEN_RECORD_V1_CODE_HASH, BLOCKED_KEY(), blockedMailSenders() (+19 more)

### Community 54 - "steps"
Cohesion: 0.07
Nodes (27): concurrency, cancel-in-progress, group, environment, runs-on, steps, name, url (+19 more)

### Community 55 - "delegate.ts"
Cohesion: 0.15
Nodes (23): api(), asBytes(), call(), chain, dec, delegateMessage(), enc, extractPayload() (+15 more)

### Community 56 - "secretChat.ts"
Cohesion: 0.10
Nodes (54): checked, checkGhostkey(), ghostkey(), GHOSTKEYS_VAULT, REFUSALS, requestGhostkeyProof(), verifiedGhostkeys(), amVouched() (+46 more)

### Community 57 - "secretRatchet.ts"
Cohesion: 0.13
Nodes (31): ad(), aead(), b64(), clearDrSessions(), dec, DR_SESSIONS_KEY, drDecrypt(), drEncrypt() (+23 more)

### Community 58 - "secretChat.ts"
Cohesion: 0.16
Nodes (23): ACTIVE_TTL_STORAGE_KEY, activeTimers, chainStepsCache, clearSecretChatSession(), dec, decryptSecretMessage(), enc, encryptSecretMessage() (+15 more)

### Community 60 - "splitNotifs"
Cohesion: 0.07
Nodes (49): a_failed_record_write_leaves_no_temporary_file(), a_failed_rewrite_of_a_record_leaves_it_whole(), a_node_answering_ends_the_wait_and_the_directory_goes_when_the_installer_exits(), a_plain_directory_is_not_a_mount_point(), an_installer_left_open_past_the_deadline_is_reported(), applications_dir(), binary_install_path(), copy_app_from() (+41 more)

### Community 61 - "freenet.ts"
Cohesion: 0.09
Nodes (45): addReadKeys(), commentMsg3(), decryptDirectMessage(), decryptRoomKeyFromPeer(), decryptWithSymmetricKey(), deleteMsg3(), enc, encryptDirectMessage() (+37 more)

### Community 62 - "loadMailContacts"
Cohesion: 0.09
Nodes (37): ANONYMOUS_AUTHOR, ARTICLE_PREFIX, ArticlePayload, buildPayload(), countWords(), estimateReadingMinutes(), extractTags(), parsePayload() (+29 more)

### Community 63 - "treePage.ts"
Cohesion: 0.22
Nodes (12): computeHotRank(), computeNetScore(), flairInfoForPost(), formatThreadComposeCaption(), RedditFlairFilter, RedditSort, RedditViewMode, sortRedditThreads() (+4 more)

### Community 64 - "package.json"
Cohesion: 0.15
Nodes (15): dependencies, @semaphore-protocol/core@^4.14.5, viem@^2.57.14, devDependencies, vite@^6.4.5, viem, vite, name (+7 more)

### Community 65 - "@playwright/test"
Cohesion: 0.10
Nodes (3): @playwright/test, makeMeAModerator(), receive()

### Community 66 - "package.json"
Cohesion: 0.16
Nodes (15): dependencies, @freenetorg/freenet-stdlib@^0.4.0, @noble/ed25519@^2.3.0, @noble/hashes@^2.4.0, viem@^2.57.14, @freenetorg/freenet-stdlib, @noble/ed25519, @noble/hashes (+7 more)

### Community 67 - "createMessengerChat"
Cohesion: 0.18
Nodes (24): anteProof(), bitsOf(), cat(), cbor(), challengeBytes(), enc, grind(), head() (+16 more)

### Community 68 - "createArticlesPage"
Cohesion: 0.23
Nodes (27): articleMissingNote(), countWords(), estimateReadingMinutes(), extractArticleTags(), getCachedArticlePayload(), parseArticleCaption(), parseArticlePayload(), resolveArticleCoverUri() (+19 more)

### Community 69 - "RiverRooms"
Cohesion: 0.20
Nodes (18): canon(), FREETREE_PATH, FREETREE_REPO, FREETREE_SITE, FREETREE_URL_RE, freetreeCard(), freetreeDataName(), freetreeHref() (+10 more)

### Community 70 - "BatchTranslator"
Cohesion: 0.20
Nodes (3): @browsermt/bergamot-translator/translator.js, BatchTranslator, TranslatorBacking

### Community 71 - "attester"
Cohesion: 0.10
Nodes (21): build, depends_on, environment, network_mode, restart, volumes, context, dockerfile (+13 more)

### Community 72 - "milestones.ts"
Cohesion: 0.20
Nodes (10): Counts, FIRST, Metric, METRIC_LABELS, METRICS, Milestone, milestone(), nextUp() (+2 more)

### Community 73 - "Radica donation contract"
Cohesion: 0.33
Nodes (5): Before Base mainnet, Deploy, Deployments, Radica donation contract, Test

### Community 74 - "fh.ts"
Cohesion: 0.25
Nodes (9): blockPublishBtnForUnverified(), isPostInCooldown(), resetPublishBtnState(), revokePosterUrl(), setMediaSensitive(), setMediaVerifiedSafe(), showScanResult(), stageVideo() (+1 more)

### Community 75 - "Radica attester"
Cohesion: 0.25
Nodes (7): AI moderation helper, CapRover, Contract sweep, FreeTunes check, Radica attester, Run, Test

### Community 76 - "linfa.ts"
Cohesion: 0.14
Nodes (17): 11. 🌱 Linfa: a Plant on Every Profile, Gain, gains(), Linfa, linfaGreenhouseWeight(), linfaOf(), MIN_TRUSTED_RECEIVED, PlantSeason (+9 more)

### Community 77 - "openUserProfile"
Cohesion: 0.08
Nodes (70): fillAsocial(), compressPostImageFile(), nodeOrigin(), fillDelta(), fillFh(), fillFreenames(), fillFreepolls(), freepollsCard() (+62 more)

### Community 78 - "fetch-translation-models.mjs"
Cohesion: 0.22
Nodes (4): dest, out, pairs, registry

### Community 79 - "network.ts"
Cohesion: 0.06
Nodes (33): Key fact: the migration machinery already exists, CURRENT, LEGACY, limiter(), asBytes(), bgGate, codes, contractCode() (+25 more)

### Community 80 - "versionCheck.ts"
Cohesion: 0.11
Nodes (29): CHAIN_ID, DEPLOY_BLOCK, ETH_FAUCET_URL, FAUCET_URL, GROUPS, RPC_URLS, SEMAPHORE, SUPPORT (+21 more)

### Community 83 - "contactCard.ts"
Cohesion: 0.27
Nodes (6): cardsKey(), readContactCards(), saveContactCard(), Store, enc, pk

### Community 84 - "DesktopHost"
Cohesion: 0.14
Nodes (16): Answer, Nothing, NoVersion, Version, ask(), classify(), DesktopHost, NodeProbe (+8 more)

### Community 85 - "lanMesh.ts"
Cohesion: 0.23
Nodes (12): formatChatMessageSignatureMessage(), acceptMeshPacket(), bridge(), MESH_MAX_BYTES, MeshBridge, meshPacket(), meshSend(), onMeshPacket() (+4 more)

### Community 86 - "treeGraph.test.ts"
Cohesion: 0.18
Nodes (9): TreePeerInput, TreePageDeps, ALICE, BOB, COMM, ME, PEERS, POSTS (+1 more)

### Community 89 - "Req"
Cohesion: 0.11
Nodes (19): Join, Req, Accept, Act, Apply, Deputies, DmSend, ExportIdentity (+11 more)

### Community 92 - "resolve"
Cohesion: 0.07
Nodes (37): a_manifest_signed_by_another_key_is_refused(), a_real_signed_release_manifest_verifies(), a_tampered_manifest_is_refused(), a_truncated_or_missing_signature_is_refused(), an_asset_must_match_its_checksum_and_be_listed(), asset_name(), asset_name_for(), check_manifest_version() (+29 more)

### Community 94 - "ok"
Cohesion: 0.32
Nodes (16): apply(), deputy_badges_follow_river_relevance(), direct_messages_go_both_ways(), hx(), identity_tokens_round_trip_with_river_format(), legacy_lists_earlier_room_contracts_newest_first(), ok(), one_public_link_lets_each_holder_in_as_their_own_member() (+8 more)

### Community 95 - "core.test.js"
Cohesion: 0.12
Nodes (19): canonicalFieldStr(), CLAIMS_LOG, enc, issueReceipt(), judgeClaim(), logEntryMessage(), logEntryMessage2(), powBits() (+11 more)

### Community 96 - "ref_noble_hashes"
Cohesion: 0.22
Nodes (4): bytes, imports, loadJsonWasm(), wasm()

### Community 97 - "fillFreetunes"
Cohesion: 0.39
Nodes (7): isSporeRadioLive(), RADIO_HEARTBEATS, recordSporeRadioHeartbeat(), SPORE_REPO, sporeRadioCard(), sporeRadioLink(), SporeRadioRef

### Community 98 - "riverPointer.ts"
Cohesion: 0.21
Nodes (22): verifyAuthorSignature(), takeHandedKey(), appPath(), canonicalBase(), certShowsHost(), connectMessage(), createLocalIdentity(), enc (+14 more)

### Community 99 - "devDependencies"
Cohesion: 0.33
Nodes (6): devDependencies, @playwright/test@^1.63.0, typescript@^5.6.0, vite@^6.0.0, typescript, vite

### Community 100 - "renderIdentityModal"
Cohesion: 0.26
Nodes (14): cleanExcerpt(), decodeB64u(), encodeB64u(), ORTO_PATH, ORTO_SITE, ORTO_VAULT_CODE_HASH, OrtoBlog, ortoCard() (+6 more)

### Community 101 - "merge_at"
Cohesion: 0.17
Nodes (9): check(), de(), err(), Kind, kind(), merge_at(), now_ms(), RadicaLogContract (+1 more)

### Community 102 - "media.ts"
Cohesion: 0.23
Nodes (10): mediaObserver, dataUrlBytes(), inflight, keepMedia(), MEDIA_PREFIX, mediaUrl(), urls, videoPosterUrl() (+2 more)

### Community 103 - "musicPage.ts"
Cohesion: 0.19
Nodes (14): FREEHOLE_PATH, FREEHOLE_REPO, FREEHOLE_SITE, FREEHOLE_URL_RE, freeholeCard(), freeholeHref(), freeholeLink(), FreeHoleRef (+6 more)

### Community 104 - "chatMedia.test.ts"
Cohesion: 0.07
Nodes (42): a_command_that_hangs_is_killed_at_the_deadline(), a_leftover_user_unit_beside_a_system_unit_gets_a_way_out(), a_process_left_holding_stderr_does_not_hold_up_run(), a_registered_service_is_just_started(), a_registered_service_that_fails_is_reported_never_registered_again(), a_stopped_system_service_is_left_to_the_administrator(), a_suggested_command_survives_any_path(), BIN (+34 more)

### Community 107 - "communitiesPage.ts"
Cohesion: 0.09
Nodes (33): Decisions, ASOCIAL_SITE, DELTA_WEB, AppFilter, AppGroup, appId(), ATLAS_SITE, AULA_SITE (+25 more)

### Community 108 - "TASK-001: Responsive 13.3" Laptop Layout for Wall & Profile Modal"
Cohesion: 0.33
Nodes (5): Context, Problem Analysis, Requirements, Status, TASK-001: Responsive 13.3" Laptop Layout for Wall & Profile Modal

### Community 109 - "treeGraph.ts"
Cohesion: 0.13
Nodes (26): FT_TREE_PREFIX, ARTICLE_BOUGH, buildTreeGraph(), BuildTreeGraphInput, CATEGORY_BOUGHS, clamp(), computeNetworkTreeStage(), cut() (+18 more)

### Community 110 - "types.ts"
Cohesion: 0.08
Nodes (19): ArticlesPageDeps, CommentEntry, CommentFilters, grindNonce(), powBits(), BuildPostCardOptions, postIdWithPow(), PoWProof (+11 more)

### Community 111 - "WebOfTrust"
Cohesion: 0.18
Nodes (7): renderAnteBadgeHtml(), renderPohProviderBadgesHtml(), renderPostSubMetaHtml(), renderTrustBadgeHtml(), PostReactionEvaluation, TrustBadgeInfo, WebOfTrust

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

### Community 118 - "river-watch.py"
Cohesion: 0.21
Nodes (6): fetch_latest_river_rev(), ours(), replace_one(), single_line(), validate_room_record(), verify_blake3()

### Community 119 - "TASK-008: Social Audio, Podcasts & Persistent Player (Spotify / FreeTunes)"
Cohesion: 0.40
Nodes (4): Context & Goal, Requirements, Status, TASK-008: Social Audio, Podcasts & Persistent Player (Spotify / FreeTunes)

### Community 120 - "TASK-009: Dedicated Events Calendar & RSVP System (Luma / Meetup)"
Cohesion: 0.40
Nodes (4): Context & Goal, Requirements, Status, TASK-009: Dedicated Events Calendar & RSVP System (Luma / Meetup)

### Community 121 - "SafeStorage"
Cohesion: 0.05
Nodes (41): Context & Goal, Requirements, Status, TASK-004: Long-Form Articles & Decentralized Newsletters (Substack / Medium), createDurable(), durable, DURABLE_PREFIXES, DurableNode (+33 more)

### Community 122 - "CHANGELOG.md"
Cohesion: 0.32
Nodes (13): Mail, fromBase58(), toBase58(), deriveContractInstanceFromJsonParams(), deriveInboxContract(), deriveTokenRecordContractAddress(), initialInboxState(), unversionedWasm() (+5 more)

### Community 123 - "scripts"
Cohesion: 0.11
Nodes (21): dependencies, @freenetorg/freenet-stdlib@latest, @noble/hashes@^2.4.0, devDependencies, typescript@^5.6.0, vite@^6.0.0, @freenetorg/freenet-stdlib, @noble/hashes (+13 more)

### Community 124 - "rootsfx.ts"
Cohesion: 0.17
Nodes (21): cleanHash(), dec, enc, FH_APP_PATH, FH_LIST_CODE_HASH, FH_SITE, fhLink(), FhListData (+13 more)

### Community 125 - "mailClient.test.ts"
Cohesion: 0.27
Nodes (13): sanitizeMailAlias(), bytesEqual(), getRecipientSuggestions(), isValidMailAddress(), loadAftAssignments(), normalizeMailAddress(), parseFmailContactInput(), resolveFreemailSenderAddress() (+5 more)

### Community 126 - "InstallStep"
Cohesion: 0.29
Nodes (6): InstallStep, Downloading, FindingRelease, Installing, Verifying, WaitingForInstaller

### Community 127 - "feedsize.ts"
Cohesion: 0.31
Nodes (8): FEED_BUDGET, FEED_SHOW, FEED_TARGET, feedBytes(), formatBytes(), oldestToFree(), postBytes(), renderFeedSize()

### Community 128 - "conversationState.ts"
Cohesion: 0.15
Nodes (18): ConversationDeps, ConversationState, createConversationState(), Delivery, formatBurnRemaining(), KeyValue, nextTtl(), READ_MARKS_KEY (+10 more)

### Community 129 - "encryptFreenetMailV1"
Cohesion: 0.38
Nodes (6): Context & Bug Report, Requirements, Status, TASK-002: Fix Native Freemail Reply: Use Inbox Contract Token as Sender `from`, buildAftSignatureContent(), encryptFreenetMailV1()

### Community 130 - "verifiedPohBadgesByAuthor"
Cohesion: 0.09
Nodes (59): Supporters, RFC-9474, bitsOf(), cat(), challengeBytes(), checkProof(), decodeProof(), enc (+51 more)

### Community 131 - "boards.ts"
Cohesion: 0.15
Nodes (22): Context & Goal, Requirements, Status, TASK-007: Curated Boards & Collections (Pinterest / Are.na), addItemToBoard(), BOARD_PREFIX, BoardFilterOpts, BoardItem (+14 more)

### Community 132 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+4 more)

### Community 133 - "openPostLink"
Cohesion: 0.33
Nodes (7): checkUrlInviteHash(), handleFreenameLink(), handleJoinFromInviteUrl(), openExternalViaNative(), openPostLink(), riverCodeIn(), goTo()

### Community 134 - "🚀 Getting Started"
Cohesion: 0.14
Nodes (14): 1. Installation, 2. Development Mode, 3. Contract Compilation & Testing, 4. Build Production Web Application, 5. Publish to Freenet, 6. Launch the Desktop App (Rust + Freenet node), 🏗️ Architecture, 🚀 Getting Started (+6 more)

### Community 136 - "finishWelcome"
Cohesion: 0.33
Nodes (6): finishWelcome(), hasDefaultName(), maybeShowWelcome(), setChatFullscreen(), welcomeDoneKey(), welcomeStep()

### Community 137 - "profileExtras.ts"
Cohesion: 0.13
Nodes (20): Profile extras, isProfileExtraLog(), isValidLogEntry(), KVStore, mergeLoadedWalletInputs(), PROFILE_EXTRA_LOGS, PROFILE_EXTRAS_BACKUP_PREFIX, profileExtraLogNames() (+12 more)

### Community 138 - "mentionPicker.ts"
Cohesion: 0.40
Nodes (5): attachMentionPicker(), namesToKeys(), Person, picked, withMentionKeys()

### Community 139 - "Folio"
Cohesion: 0.29
Nodes (6): Development, Folio, License, Limitations, Publishing, What it does

### Community 140 - "topPosts.test.ts"
Cohesion: 0.19
Nodes (8): EQUAL, FeedSort, FUTURE_SLACK_MS, postScore(), sortPosts(), Weights, WINDOW_MS, now

### Community 141 - "avatar.ts"
Cohesion: 0.50
Nodes (4): avatarCache, buildDefaultAvatar(), compressAvatarFile(), svgToBase64Uri()

### Community 143 - "syncFreenetMailInbox"
Cohesion: 0.29
Nodes (10): @noble/curves, @noble/curves@^2.4.0, hex(), INFO, newEpk(), openEsk(), unhex(), hex() (+2 more)

### Community 144 - "setDashboardSlots"
Cohesion: 0.40
Nodes (5): applyDashboardSlots(), dashboardSlotsKey(), loadDashboardSlots(), paintDashboardSlotSelects(), setDashboardSlots()

### Community 145 - "postGone.ts"
Cohesion: 0.60
Nodes (3): GONE_MESSAGE, WhyGone, whyGone()

### Community 146 - "vite.config.ts"
Cohesion: 0.10
Nodes (12): handleSignOut(), UPDATES, check(), newNotes(), shortNote(), showReloadModal(), startVersionCheck(), restart() (+4 more)

### Community 147 - "updateMailBadges"
Cohesion: 0.20
Nodes (19): deleteMailContact(), filterMailMessages(), formatMailDate(), getContactsStorageKey(), getUnreadMailCount(), loadMailContacts(), saveMailContact(), formatMailContent() (+11 more)

### Community 148 - "reapplyDurablePreferences"
Cohesion: 0.25
Nodes (8): applyAccent(), applyFullWidth(), applyTheme(), initFullWidth(), initTheme(), reapplyDurablePreferences(), setFullWidth(), setThemeChoice()

### Community 149 - "Radica — Agent Rules"
Cohesion: 0.50
Nodes (3): MUST: updates tab + docs, same session, Radica — Agent Rules, Testing & verification

### Community 150 - "Radica: Terms of Use, Disclaimer and Privacy"
Cohesion: 0.18
Nodes (9): 1. Software provided "as is", 2. No central service, no central moderation, 3. Your responsibility, 4. Donations and supporter badges, 5. Greenhouse, 6. Privacy, 7. Reporting illegal content, 8. Changes (+1 more)

### Community 151 - "DelegationProofV1"
Cohesion: 0.15
Nodes (6): DelegationProofV1, isDelegationProofShape(), PohBadge, PohLogEntry, VerifiedDelegation, verifiedDelegations()

### Community 152 - "heavyUrl"
Cohesion: 0.36
Nodes (8): closeGifPicker(), CURATED_GIFS, GifItem, openGifPicker(), isDirectUrl(), renderGrid(), safeDirectUrl(), heavyUrl()

### Community 153 - "super"
Cohesion: 0.31
Nodes (4): a_packet_on_the_port_reaches_the_page_and_an_oversized_one_does_not(), MAX_BYTES, Mesh, PORT

### Community 154 - "rotation"
Cohesion: 0.29
Nodes (4): Invitation, kick_rotation_excludes_banned_invite_subtree(), rotation(), time()

### Community 158 - "syncMobileViewport"
Cohesion: 0.50
Nodes (4): applyTextSize(), isMobileTextEntry(), scheduleSyncMobileViewport(), syncMobileViewport()

### Community 159 - "repost.ts"
Cohesion: 0.29
Nodes (12): stageRepost(), hasUserReposted(), repostBody(), repostCaption(), repostCard(), repostCountsOf(), repostLink(), RepostRef (+4 more)

### Community 160 - "updateChatPinBtnUI"
Cohesion: 0.67
Nodes (3): getActiveChatConvKey(), getPinnedSet(), updateChatPinBtnUI()

### Community 162 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, e2e, prebuild, predev, preview, test

### Community 167 - "build.rs"
Cohesion: 0.47
Nodes (4): bundle_ui(), collect(), HEAVY, main()

## Knowledge Gaps
- **65 isolated node(s):** `CHECKING`, `MISSING`, `STOPPED`, `radica-desktop`, `Started` (+60 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1674 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `FreenetClient` connect `FreenetClient` to `init`, `🌟 Key Features`, `profileExtras.ts`, `freenames.ts`, `feedlight.ts`, `secretChatTransport.ts`, `DelegationProofV1`, `versionCheck.ts`, `UserIdentity`, `asocial.ts`, `delta.ts`, `nodeOrigin`, `createMessengerChat`, `icons.ts`, `.applyLog`, `chatMedia.ts`, `freenet.ts`, `network.ts`, `renderIdentityModal`, `media.ts`, `communitiesPage.ts`, `types.ts`, `rootsfx.ts`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `createMessengerChat()` (e.g. with `closeMentionPopup()` and `onViewportResize()`) actually correct?**
  _`createMessengerChat()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `CHECKING`, `MISSING`, `STOPPED` to the rest of the system?**
  _65 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `freenetMail.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07575757575757576 - nodes in this community are weakly interconnected._
- **Why does `Decisions` connect `communitiesPage.ts` to `init`, `openPostLink`, `escapeHtml`, `FreenetClient`, `feedlight.ts`, `messengerChat.ts`, `.shouldInterceptRequest`, `renderTimeline`, `syncMobileViewport`, `createMessengerChat`, `delegate.ts`, `handleJoinFromInviteUrl`, `freenet.ts`, `linfa.ts`, `openUserProfile`, `riverPointer.ts`, `.isRadicaUrl`, `Override`, `treeGraph.ts`, `CHANGELOG.md`, `mailClient.test.ts`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Should `lib.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.05001139211665528 - nodes in this community are weakly interconnected._
- **Why does `MainActivity` connect `MainActivity` to `.onShowFileChooser`, `.isRadicaUrl`, `Override`, `MainActivity.java`, `.shouldInterceptRequest`, `.onCreate`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._