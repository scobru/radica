# Graph Report - radica  (2026-11-23)

## Corpus Check
- 312 files · ~437,452 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 41 file(s) not represented in the graph (top: (none) 13, .wasm 13, .css 5)

## Summary
- 4912 nodes · 13395 edges · 180 communities (154 shown, 26 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 513 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e106f691`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- freenetMail.ts
- escapeHtml
- lib.rs
- init
- scripts
- freepolls.ts
- 🌟 Key Features
- handle
- dependencies
- selectPrivateRoom
- FreenetClient
- postGone.ts
- bindPostCardListeners
- vite.config.ts
- signOut
- durable.ts
- types.ts
- river-wasm/src/lib.rs
- SafeStorage
- .process
- secretChatTransport.ts
- MainActivity
- attester/src/main.js
- feedsize.ts
- articles.ts
- versionCheck.ts
- UserIdentity
- createMessengerChat
- openUserProfile
- web.rs
- asocial.ts
- with
- CHANGELOG.md
- steps
- NotificationItem
- hexToBytes
- nodeOrigin
- types.ts
- sound.ts
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
- supporterPanel.ts
- secretRatchet.ts
- secretChat.ts
- rootsfx.ts
- splitNotifs
- freenet.ts
- loadMailContacts
- treePage.ts
- package.json
- moderation.spec.ts
- package.json
- createMessengerChat
- messengerChat.ts
- RiverRooms
- BatchTranslator
- attester
- milestones.ts
- Radica donation contract
- handles.test.ts
- Radica attester
- linfa.ts
- caption.ts
- fetch-translation-models.mjs
- network.ts
- versionCheck.ts
- versionCheck.ts
- README.md
- contactCard.ts
- DesktopHost
- createArticlesPage
- supporter.ts
- Req
- walkieTalkie.ts
- resolve
- ok
- savedPosts.ts
- video.ts
- boards.ts
- riverPointer.ts
- renderMailContacts
- renderIdentityModal
- chat.ts
- media.ts
- musicPage.ts
- chatMedia.test.ts
- .isRadicaUrl
- Override
- communitiesPage.ts
- TASK-001: Responsive 13.3" Laptop Layout for Wall & Profile Modal
- treeGraph.ts
- moderation.ts
- greenhouse.ts
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
- prepareChatVideoNote
- scripts
- rootsfx.ts
- isCanonicalPost
- InstallStep
- feedsize.ts
- conversationState.ts
- avatar.ts
- verifiedPohBadgesByAuthor
- WebOfTrust
- compilerOptions
- Radica — Agent Rules
- 🚀 Getting Started
- savedPosts.ts
- DelegationProofV1
- .logEntries
- TASK-004: Long-Form Articles & Decentralized Newsletters (Substack / Medium)
- node-bridge.ts
- topPosts.test.ts
- tui.ts
- syncFreenetMailInbox
- repost.ts
- TASK-007: Curated Boards & Collections (Pinterest / Are.na)
- vite.config.ts
- finishWelcome
- river.ts
- encryptFreenetMailV1
- Radica: Terms of Use, Disclaimer and Privacy
- showScanResult
- ghostkey.ts
- super
- rotation
- heavyUrl
- Radica (Freenet Edition) 🌱
- Radica — domain language
- Folio
- scripts
- refreshSupporters
- .onShowFileChooser
- make-icons.py
- renderNotifs
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
- postGone.ts
- roots.ts

## God Nodes (most connected - your core abstractions)
1. `FreenetClient` - 283 edges
2. `escapeHtml()` - 134 edges
3. `createMessengerChat()` - 119 edges
4. `openUserProfile()` - 87 edges
5. `UserIdentity` - 85 edges
6. `renderCommunitiesPage()` - 65 edges
7. `renderTimeline()` - 61 edges
8. `bytesToHex` - 57 edges
9. `renderIcon()` - 52 edges
10. `hexToBytes` - 52 edges

## Surprising Connections (you probably didn't know these)
- `4. 🌐 Cryptographic Personas & Decentralized Storage` --references--> `DelegationProofV1`  [INFERRED]
  README.md → ui/src/viso.ts
- `6. 💬 P2P Direct Chat & Interactive Feeds` --references--> `fromBase58()`  [INFERRED]
  README.md → ui/src/base58.ts
- `8. 📸 Moments Compression & Sandboxed Persistence Engine` --references--> `SafeStorage`  [INFERRED]
  README.md → ui/src/storage.ts
- `📜 Origin & Acknowledgments` --references--> `DelegationProofV1`  [INFERRED]
  README.md → ui/src/viso.ts
- `Requirements` --references--> `SafeStorage`  [INFERRED]
  tasks/004-long-form-articles-newsletter.md → ui/src/storage.ts

## Import Cycles
- 2-file cycle: `ui/src/handles.ts -> ui/src/logfold.ts -> ui/src/handles.ts`
- 2-file cycle: `apps/desktop/src/host.rs -> apps/desktop/src/install.rs -> apps/desktop/src/host.rs`
- 3-file cycle: `ui/src/crypto.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/crypto.ts`
- 4-file cycle: `ui/src/crypto.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/riverPointer.ts -> ui/src/crypto.ts`

## Communities (180 total, 26 thin omitted)

### Community 0 - "freenetMail.ts"
Cohesion: 0.07
Nodes (44): fromBase58(), BIP39_WORDLIST, ADDRESS_CHARS, ADDRESS_CONTEXT, AFT_TIER_SPEC, AFT_TIERS, aftDayIndexInYear(), BODY_LEN (+36 more)

### Community 1 - "escapeHtml"
Cohesion: 0.07
Nodes (70): renderArticleFeedCardHtml(), asocialCard(), asocialProfileCard(), asocialWorkHref(), fillAsocial(), shortKey(), renderAnteBadgeHtml(), renderPohProviderBadgesHtml() (+62 more)

### Community 2 - "lib.rs"
Cohesion: 0.05
Nodes (97): hx(), key(), prepare(), run(), STATE, main(), state(), an_author_takes_back_a_comment_with_an_empty_version() (+89 more)

### Community 3 - "init"
Cohesion: 0.10
Nodes (40): askModel(), askRaw(), ghFetch(), greenhousePass(), loadMod(), modPass(), roomModPass(), signPrivateRoomMessage() (+32 more)

### Community 4 - "scripts"
Cohesion: 0.07
Nodes (29): author, description, keywords, license, name, scripts, app, app:messenger (+21 more)

### Community 5 - "freepolls.ts"
Cohesion: 0.11
Nodes (25): ANTE_CODE_HASH, VOTE_BITS, code(), createPoll(), enc(), fpIdentity(), FpPoll, FpQuestion (+17 more)

### Community 6 - "🌟 Key Features"
Cohesion: 0.13
Nodes (14): 10. ✉️ Radica Mail & Freenet Mail Interoperability (Post-Quantum), 12. 🔁 Reposts Without a Contract Change, 13. ⚙️ Dedicated Settings, Decluttered Rail & Wall-First Profiles, 13. 🖼️ Moments Gallery (Media Explore), 1. 🛡️ On-Device AI Moderation (Desert Ant Labs), 2. 🔒 Automated PII Redaction & Text Censorship, 3. ⏱️ Decentralized Anti-Flooding & Rate Limiting, 4. 🌐 Cryptographic Personas & Decentralized Storage (+6 more)

### Community 7 - "handle"
Cohesion: 0.18
Nodes (18): a_secret_blob_that_does_not_decrypt_is_skipped(), body(), cbor(), entering(), handle(), is_private(), key32(), msg_id() (+10 more)

### Community 8 - "dependencies"
Cohesion: 0.08
Nodes (31): @browsermt/bergamot-translator, @fontsource-variable/fraunces, @fontsource-variable/inter, freenet-blob, @litertjs/core, dependencies, @browsermt/bergamot-translator@0.4.9, @desert-ant-labs/moderator@^4.0.0 (+23 more)

### Community 9 - "selectPrivateRoom"
Cohesion: 0.05
Nodes (104): generateDefaultAvatar(), canCaptureVideoNote(), canRecordVoice(), canUseLiveMediaCapture(), chatMediaCardsHtml(), fileExtensionIcon(), playChatVoiceByHash(), safeUrl() (+96 more)

### Community 10 - "FreenetClient"
Cohesion: 0.04
Nodes (9): MUST: content moderation, all 3 layers, FreenetClient, LogEntry, ModerationSets, backupOwnProfileExtras(), isProfileExtraLog(), latestOwnLogEntry(), ProfileExtraKind (+1 more)

### Community 11 - "postGone.ts"
Cohesion: 0.20
Nodes (16): maskProfanity(), BlobVideoRef, filterVideoReels(), formatBlobVideoCaption(), isVideoReelPost(), parseBlobVideoRef(), stepReelIndex(), VIDEO_BLOB_PREFIX (+8 more)

### Community 12 - "bindPostCardListeners"
Cohesion: 0.10
Nodes (49): compressPostImageFile(), amGlobalMod(), bindPostCardListeners(), checkCommunitiesOnNetwork(), closeSinglePostModal(), copyUserWallLink(), deleteCommentFromCard(), deletePostFromCard() (+41 more)

### Community 13 - "vite.config.ts"
Cohesion: 0.12
Nodes (17): a_proof_holds_for_its_identity_only_and_under_the_real_master_only(), a_sign_result_becomes_the_bundle_viso_stores(), BIND_TAG, binding_payload(), call(), cbor(), empty_requestor_is_rejected(), fixture() (+9 more)

### Community 14 - "signOut"
Cohesion: 0.09
Nodes (44): an_author_s_newer_entry_replaces_the_older_under_one_key(), check(), de(), delta(), Entry, entry2(), entry(), entry_msg() (+36 more)

### Community 15 - "durable.ts"
Cohesion: 0.19
Nodes (7): createDurable(), durable, DURABLE_PREFIXES, DurableNode, DurableStore, isDurable(), packageKey()

### Community 16 - "types.ts"
Cohesion: 0.06
Nodes (28): ArticlesPageDeps, CommentEntry, CommentFilters, giveUpWorker(), LightFeed, lightFeed(), lightFeedAsync(), lightFeedOf() (+20 more)

### Community 17 - "river-wasm/src/lib.rs"
Cohesion: 0.04
Nodes (9): call(), fill(), open(), random_fill(), RECORD, RIVER_AUTHOR_VK, RIVER_INVITATION, ROOM_CONTRACT_APP_ID (+1 more)

### Community 18 - "SafeStorage"
Cohesion: 0.17
Nodes (9): delta_only_to_a_peer_without_it(), IMG, MAX_MEDIA, only_the_named_bytes_are_valid(), params(), RadicaMediaContract, too_big_is_refused_even_with_its_hash(), update_keeps_or_adopts_the_valid_image() (+1 more)

### Community 19 - ".process"
Cohesion: 0.09
Nodes (17): Identity, key_of(), kv_name(), kv_names_are_validated_and_namespaced(), MAX_VALUE, parse_sk(), Req, Export (+9 more)

### Community 20 - "secretChatTransport.ts"
Cohesion: 0.13
Nodes (28): getActiveSecretChatTTL(), getSecretRoomId(), addSecretChatPeer(), burnedKey(), burnSecretMessage(), editSecretMessage(), isSealedSecret(), keepPlain() (+20 more)

### Community 21 - "MainActivity"
Cohesion: 0.12
Nodes (5): MainActivity, Node, CHECKING, MISSING, STOPPED

### Community 22 - "attester/src/main.js"
Cohesion: 0.06
Nodes (54): issueReceipt(), append(), attesterPk, code, codeHash, connect(), feedCode, feedHash (+46 more)

### Community 23 - "feedsize.ts"
Cohesion: 0.15
Nodes (20): stageOf(), STAGES, Bloom, Branch, clamp(), curve(), [CX, GROUND], end() (+12 more)

### Community 24 - "articles.ts"
Cohesion: 0.14
Nodes (28): ARTICLE_CACHE_PREFIX, ARTICLE_DRAFTS_PREFIX, ARTICLE_PREFIX, ArticleDraft, articleDraftsKey(), articleMissingNote(), ArticlePayload, ArticleRef (+20 more)

### Community 25 - "versionCheck.ts"
Cohesion: 0.24
Nodes (4): bytesToHex, RiverRooms, person(), world()

### Community 26 - "UserIdentity"
Cohesion: 0.13
Nodes (8): seedReadMark(), computeRoomJoinProof(), MessengerDeps, RiverJoin, roomOwnerSk(), vkOf(), PrivateRoom, UserIdentity

### Community 27 - "createMessengerChat"
Cohesion: 0.11
Nodes (37): hasLanMesh(), setChatStatus(), createMessengerChat(), activeConvKey(), buildUnifiedConversations(), cancelActiveRecording(), cancelVnoteRec(), cancelVoiceRec() (+29 more)

### Community 28 - "openUserProfile"
Cohesion: 0.08
Nodes (62): Feed, commentsBy(), parseGreenhouseHash(), buildModerationSets(), checkUrlPostHash(), closeRailPages(), collectTreePeers(), collectTreePosts() (+54 more)

### Community 29 - "web.rs"
Cohesion: 0.06
Nodes (43): MANUAL_INSTALL_URL, ANSWER_DEADLINE, app_mode_configures_messenger_binary(), AppMode, Full, Messenger, bring_up(), BUNDLED_ORIGIN (+35 more)

### Community 30 - "asocial.ts"
Cohesion: 0.12
Nodes (28): ASOCIAL_RECORDS_CODE, ASOCIAL_RECORDS_CODE_BYTES, ASOCIAL_REPO, ASOCIAL_SITE, AsocialData, asocialLink(), asocialOwnStoreKey(), asocialOwnStoreParams() (+20 more)

### Community 31 - "with"
Cohesion: 0.05
Nodes (47): runs-on, steps, runs-on, steps, strategy, TAG_NAME, messenger_name, name (+39 more)

### Community 32 - "CHANGELOG.md"
Cohesion: 0.19
Nodes (11): CommunitySort, compare(), findCommunities(), FinderInput, FinderResult, slugOf(), createCommunityFromPage(), openCreateCommunityDialog() (+3 more)

### Community 33 - "steps"
Cohesion: 0.06
Nodes (40): BRANCH, GH_TOKEN, TITLE, VERSION, jobs, prepare, publish, name (+32 more)

### Community 34 - "NotificationItem"
Cohesion: 0.00
Nodes (527): accentSelect, activeFilterBanner, activeFilterPrefix, activeFilterTag, addModForm, addModPubkeyInput, alerted, allCommunities (+519 more)

### Community 35 - "hexToBytes"
Cohesion: 0.09
Nodes (40): hexToBytes, decodeCbor(), DELTA_WEB, deltaInCaption(), DeltaPage, deltaPrefixOf(), DeltaSite, DeltaUri (+32 more)

### Community 36 - "nodeOrigin"
Cohesion: 0.08
Nodes (34): chunk(), coverUrls, Fetch, fillFreetunesProfile(), fmtTime(), FREETUNES_DIR_ADMIN, FREETUNES_DIR_CODE_HASH, FREETUNES_KEY (+26 more)

### Community 37 - "types.ts"
Cohesion: 0.13
Nodes (33): closeModal(), hasOpenModal(), installModalDismiss(), openModals(), ActiveView, clearSelectedPostCard(), closeOtherPages(), findNextCardIndex() (+25 more)

### Community 38 - "sound.ts"
Cohesion: 0.30
Nodes (13): openSettingsModal(), updateNotifsSoundBtn(), getAudioContext(), isSoundEnabled(), playBufferPop(), playPopSound(), playSynthesizedPop(), playWalkieChirp() (+5 more)

### Community 39 - "createMessengerChat"
Cohesion: 0.08
Nodes (52): categoryDisabled(), Decisions, Moderation, normalizeSiteKey(), bodies(), canEditCommunity(), CHAT_REACTIONS, directoryWeights() (+44 more)

### Community 40 - "Reader"
Cohesion: 0.16
Nodes (21): aesGcmDecrypt(), aesGcmEncrypt(), computeRoomJoinProof(), connectMessage(), dec, decryptRoomKey(), decryptRoomKeyFromPeer(), decryptWithSymmetricKey() (+13 more)

### Community 41 - "secretChat.ts"
Cohesion: 0.15
Nodes (18): before, draftTranslateHtml(), initDraftTranslate(), translateKeeping(), setReaderLang(), availableLangs(), cachedAvail, detectLang() (+10 more)

### Community 42 - "delegate.ts"
Cohesion: 0.13
Nodes (31): baseViewBoxDims(), viewBoxFor(), applySim(), applySvgViewBoxOnly(), attachSim(), getTreeSvgEl(), handleNodeDoubleClick(), handleNodeSelect() (+23 more)

### Community 43 - "messengerLogic.ts"
Cohesion: 0.14
Nodes (14): containerOf(), CONTAINERS, isHeavy(), LIMITS, all, cfg, cfgPath, dist (+6 more)

### Community 44 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+4 more)

### Community 45 - "icons.ts"
Cohesion: 0.18
Nodes (28): AudioQueueState, AudioQueueTrack, createAudioQueueState(), enqueueInQueue(), filterFreetunesReleases(), formatAudioTime(), nextQueueIndex(), playInQueue() (+20 more)

### Community 46 - "handleJoinFromInviteUrl"
Cohesion: 0.17
Nodes (26): freenet, foldGreenhouse(), append(), commentHtml(), copyTextWithFeedback(), displayName(), focusGreenhouseSeed(), GreenhouseLinfaInfo (+18 more)

### Community 47 - ".applyLog"
Cohesion: 0.08
Nodes (8): dmPeerOf(), localReadMarks(), dedupeChat(), foldChatHides(), foldChatRead(), MessengerActiveState, ChatMessage, NotificationItem

### Community 48 - "chatMedia.ts"
Cohesion: 0.06
Nodes (64): analyzeAudioBlob(), AUDIO_EXT, base64ToBytes(), blobCache, cacheKeyOf(), ChatMediaKind, decodeWaveformHex(), defaultWaveform() (+56 more)

### Community 49 - "donation-contract/package.json"
Cohesion: 0.06
Nodes (35): path, { subtask }, { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD }, devDependencies, chai@^4.5.0, ethers@^6.17.0, hardhat@^2.29.1, @nomicfoundation/hardhat-chai-matchers@^2.1.2 (+27 more)

### Community 50 - "audio.rs"
Cohesion: 0.07
Nodes (20): base64_encode(), base64_matches_rfc4648_vectors(), downsample_to_mono_16k(), encode_wav_mono_16k(), encodes_valid_wav_header(), NativeVoiceController, push_mono_chunk(), RecCmd (+12 more)

### Community 51 - "ref_node_assert"
Cohesion: 0.09
Nodes (16): along(), Box, f(), growRoots(), rootPaths(), anchorElementInViewport(), AnchorScrollOptions, cancelAnchoredScroll() (+8 more)

### Community 52 - "mailClient.ts"
Cohesion: 0.12
Nodes (45): Mail, @noble/post-quantum, AftTier, AftTokenAssignment, decryptFreenetMailV1(), FreenetMailIdentity, INBOX_V1_CODE_HASH, initialInboxState() (+37 more)

### Community 54 - "steps"
Cohesion: 0.07
Nodes (27): concurrency, cancel-in-progress, group, environment, runs-on, steps, name, url (+19 more)

### Community 55 - "delegate.ts"
Cohesion: 0.15
Nodes (23): api(), asBytes(), call(), chain, dec, delegateMessage(), enc, extractPayload() (+15 more)

### Community 56 - "supporterPanel.ts"
Cohesion: 0.26
Nodes (21): foldSupporters(), saveStoredReceipt(), supporterBadge(), unremoveReceipts(), verifyReceipt(), adoptAttestedReceipt(), awaitAttestation(), delegationKey() (+13 more)

### Community 57 - "secretRatchet.ts"
Cohesion: 0.12
Nodes (33): @noble/curves, ad(), aead(), b64(), clearDrSessions(), dec, DR_SESSIONS_KEY, drDecrypt() (+25 more)

### Community 58 - "secretChat.ts"
Cohesion: 0.14
Nodes (24): ACTIVE_TTL_STORAGE_KEY, activeTimers, cancelMessageBurn(), chainStepsCache, clearSecretChatSession(), dec, decryptSecretMessage(), enc (+16 more)

### Community 60 - "splitNotifs"
Cohesion: 0.07
Nodes (49): a_failed_record_write_leaves_no_temporary_file(), a_failed_rewrite_of_a_record_leaves_it_whole(), a_node_answering_ends_the_wait_and_the_directory_goes_when_the_installer_exits(), a_plain_directory_is_not_a_mount_point(), an_installer_left_open_past_the_deadline_is_reported(), applications_dir(), binary_install_path(), copy_app_from() (+41 more)

### Community 61 - "freenet.ts"
Cohesion: 0.05
Nodes (72): ContactCard, addReadKeys(), commentMsg3(), decryptDirectMessage(), decryptRoomKeyFromPeer(), decryptWithSymmetricKey(), deleteMsg3(), enc (+64 more)

### Community 62 - "loadMailContacts"
Cohesion: 0.09
Nodes (37): ANONYMOUS_AUTHOR, ARTICLE_PREFIX, ArticlePayload, buildPayload(), countWords(), estimateReadingMinutes(), extractTags(), parsePayload() (+29 more)

### Community 63 - "treePage.ts"
Cohesion: 0.15
Nodes (16): 15. 🗣️ Reddit-Style Communities (`r/slug`) & Standalone Single Post View, computeHotRank(), computeNetScore(), flairInfoForPost(), formatThreadComposeCaption(), RedditFlairFilter, RedditSort, RedditViewMode (+8 more)

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

### Community 68 - "messengerChat.ts"
Cohesion: 0.09
Nodes (35): MAX_VNOTE_BYTES, MAX_VNOTE_SEC, PreparedChatMedia, VideoNoteRecorderSession, VoiceRecorderSession, ChatLayoutMode, chatTranslations, CLOCK_FMT (+27 more)

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
Cohesion: 0.12
Nodes (23): checkMilestones(), networkCounts(), paintCardDislikeButtons(), paintCardLikeButtons(), paintReactionsBy(), reactionsByHtml(), renderMilestones(), toggleDislikeFromCard() (+15 more)

### Community 73 - "Radica donation contract"
Cohesion: 0.33
Nodes (5): Before Base mainnet, Deploy, Deployments, Radica donation contract, Test

### Community 74 - "handles.test.ts"
Cohesion: 0.33
Nodes (8): foldHandles(), formatHandle(), isValidHandle(), normalizeHandle(), RESERVED_HANDLES, A, B, C

### Community 75 - "Radica attester"
Cohesion: 0.25
Nodes (7): AI moderation helper, CapRover, Contract sweep, FreeTunes check, Radica attester, Run, Test

### Community 76 - "linfa.ts"
Cohesion: 0.14
Nodes (17): 11. 🌱 Linfa: a Plant on Every Profile, Gain, gains(), Linfa, linfaGreenhouseWeight(), linfaOf(), MIN_TRUSTED_RECEIVED, PlantSeason (+9 more)

### Community 77 - "caption.ts"
Cohesion: 0.05
Nodes (63): CHAT_TOKEN_RE, chatText(), escMd(), extractCommentMedia(), isSafeUrl(), LINK_RE, linkCard(), linkify() (+55 more)

### Community 78 - "fetch-translation-models.mjs"
Cohesion: 0.10
Nodes (10): bytes, imports, wasmAsDataUrl, dest, out, pairs, registry, bin (+2 more)

### Community 79 - "network.ts"
Cohesion: 0.06
Nodes (34): Key fact: the migration machinery already exists, CURRENT, LEGACY, limiter(), compactLog(), asBytes(), bgGate, codes (+26 more)

### Community 80 - "versionCheck.ts"
Cohesion: 0.07
Nodes (44): canonicalFieldStr(), CLAIMS_LOG, enc, judgeClaim(), logEntryMessage(), logEntryMessage2(), powBits(), RECEIPTS_LOG (+36 more)

### Community 81 - "versionCheck.ts"
Cohesion: 0.36
Nodes (8): handleSignOut(), check(), newNotes(), shortNote(), showReloadModal(), startVersionCheck(), restart(), signOut()

### Community 83 - "contactCard.ts"
Cohesion: 0.19
Nodes (13): jsqr, uqr, jsqr@^1.4.0, cardsKey(), contactCardQrSvg(), contactCardText(), parseContactCard(), readContactCards() (+5 more)

### Community 84 - "DesktopHost"
Cohesion: 0.14
Nodes (16): Answer, Nothing, NoVersion, Version, ask(), classify(), DesktopHost, NodeProbe (+8 more)

### Community 85 - "createArticlesPage"
Cohesion: 0.30
Nodes (21): buildNewsletterEmail(), extractArticleTags(), parseArticleCaption(), resolveArticleCoverUri(), createArticlesPage(), collectArticlePosts(), effectiveCaptionOf(), handleDeleteArticle() (+13 more)

### Community 86 - "supporter.ts"
Cohesion: 0.18
Nodes (19): clearStoredReceipt(), dec, enc, fromBase64(), isReceiptRemoved(), issueReceipt(), parseReceiptToken(), RECEIPT_ISSUERS (+11 more)

### Community 89 - "Req"
Cohesion: 0.11
Nodes (19): Join, Req, Accept, Act, Apply, Deputies, DmSend, ExportIdentity (+11 more)

### Community 91 - "walkieTalkie.ts"
Cohesion: 0.09
Nodes (16): Chat, encodeChatMediaToken(), encodeWaveformHex(), createWalkieQueue(), MIN_PTT_SEC, nextSequentialHash(), PTT_HOLD_THRESHOLD_MS, readWalkieEnabled() (+8 more)

### Community 92 - "resolve"
Cohesion: 0.07
Nodes (37): a_manifest_signed_by_another_key_is_refused(), a_real_signed_release_manifest_verifies(), a_tampered_manifest_is_refused(), a_truncated_or_missing_signature_is_refused(), an_asset_must_match_its_checksum_and_be_listed(), asset_name(), asset_name_for(), check_manifest_version() (+29 more)

### Community 94 - "ok"
Cohesion: 0.32
Nodes (16): apply(), deputy_badges_follow_river_relevance(), direct_messages_go_both_ways(), hx(), identity_tokens_round_trip_with_river_format(), legacy_lists_earlier_room_contracts_newest_first(), ok(), one_public_link_lets_each_holder_in_as_their_own_member() (+8 more)

### Community 95 - "savedPosts.ts"
Cohesion: 0.44
Nodes (7): isSaved(), keyOf(), load(), memo, savedId(), savedPosts(), toggleSaved()

### Community 96 - "video.ts"
Cohesion: 0.21
Nodes (12): mediabunny, ChatMediaItem, ChunkProgress, MAX_CHAT_FILE_BYTES, scanTimes(), item(), MAX_VIDEO_SEC, playVideo() (+4 more)

### Community 97 - "boards.ts"
Cohesion: 0.20
Nodes (19): Status, addItemToBoard(), BOARD_PREFIX, BoardFilterOpts, BoardItem, boardPermalink(), createBoard(), CuratedBoard (+11 more)

### Community 98 - "riverPointer.ts"
Cohesion: 0.19
Nodes (24): formatLogEntryMessage(), takeHandedKey(), appPath(), canonicalBase(), certShowsHost(), connectMessage(), createLocalIdentity(), enc (+16 more)

### Community 99 - "renderMailContacts"
Cohesion: 0.20
Nodes (19): deleteMailContact(), filterMailMessages(), formatMailDate(), getContactsStorageKey(), getUnreadMailCount(), loadMailContacts(), saveMailContact(), formatMailContent() (+11 more)

### Community 100 - "renderIdentityModal"
Cohesion: 0.26
Nodes (14): cleanExcerpt(), decodeB64u(), encodeB64u(), ORTO_PATH, ORTO_SITE, ORTO_VAULT_CODE_HASH, OrtoBlog, ortoCard() (+6 more)

### Community 101 - "chat.ts"
Cohesion: 0.19
Nodes (23): clock(), command(), convs, fail(), formatted(), lastList, messagesOf(), nameOf() (+15 more)

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
Cohesion: 0.12
Nodes (26): AppFilter, AppGroup, appId(), ATLAS_SITE, AULA_SITE, CustomAppRecord, customRecordToApp(), DONATE_URL (+18 more)

### Community 108 - "TASK-001: Responsive 13.3" Laptop Layout for Wall & Profile Modal"
Cohesion: 0.33
Nodes (5): Context, Problem Analysis, Requirements, Status, TASK-001: Responsive 13.3" Laptop Layout for Wall & Profile Modal

### Community 109 - "treeGraph.ts"
Cohesion: 0.08
Nodes (37): plainMentions(), FT_TREE_PREFIX, ARTICLE_BOUGH, buildTreeGraph(), CATEGORY_BOUGHS, clamp(), computeNetworkTreeStage(), cut() (+29 more)

### Community 110 - "moderation.ts"
Cohesion: 0.20
Nodes (12): @desert-ant-labs/moderator, analyzeImageFile(), analyzeTextContent(), BAD_WORDS, BAD_WORDS_RE, censorTextAndPII(), getModerator(), ImageModerationResult (+4 more)

### Community 111 - "greenhouse.ts"
Cohesion: 0.16
Nodes (13): formatSeedsForAi(), greenhousePermalink(), greenhouseTokens(), MAX_COMMENT, parse(), SEED_DAYS, SEED_STATUSES, SeedComment (+5 more)

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
Cohesion: 0.15
Nodes (21): ANNOUNCE_POW_BITS, COMMENT_POW_BITS, countLeadingZeroBits(), createPoWChallenge(), DEFAULT_TIER0_DIFFICULTY, enc, failPowWorker(), ID_PREFIX (+13 more)

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
Cohesion: 0.13
Nodes (11): decodeBase64State(), encodeBase64State(), FORBIDDEN_PROTO_KEYS, HASH_SAFE_OPTIONAL_PREFIXES, HASH_SAFE_SOFT_PREFIXES, isHashSafeKey(), isSensitiveStorageKey(), nativeBridge() (+3 more)

### Community 122 - "prepareChatVideoNote"
Cohesion: 0.16
Nodes (15): canvasToJpegBlob(), dataUriToBytesAndMime(), measureImageDimensions(), normalizeVideoMime(), prepareChatDocFile(), prepareChatImageFile(), prepareChatVideoNote(), probeVideoFallbackMeta() (+7 more)

### Community 123 - "scripts"
Cohesion: 0.11
Nodes (21): dependencies, @freenetorg/freenet-stdlib@latest, @noble/hashes@^2.4.0, devDependencies, typescript@^5.6.0, vite@^6.0.0, @freenetorg/freenet-stdlib, @noble/hashes (+13 more)

### Community 124 - "rootsfx.ts"
Cohesion: 0.17
Nodes (21): cleanHash(), dec, enc, FH_APP_PATH, FH_LIST_CODE_HASH, FH_SITE, fhLink(), FhListData (+13 more)

### Community 125 - "isCanonicalPost"
Cohesion: 0.16
Nodes (13): 1. Signatures: v3 messages, length-prefixed, v2 still accepted, 2. Caps that bound size without letting spam evict real content, 3. Hex and delta fixes, 4. Rollout, 5. Carrying all data (no rollback), Context & Goal, Design, Open questions (+5 more)

### Community 126 - "InstallStep"
Cohesion: 0.29
Nodes (6): InstallStep, Downloading, FindingRelease, Installing, Verifying, WaitingForInstaller

### Community 127 - "feedsize.ts"
Cohesion: 0.27
Nodes (9): FEED_BUDGET, FEED_SHOW, FEED_TARGET, feedBytes(), formatBytes(), oldestToFree(), postBytes(), renderFeedSize() (+1 more)

### Community 128 - "conversationState.ts"
Cohesion: 0.13
Nodes (22): burnAtOf(), checksHtml(), ConversationDeps, ConversationState, createConversationState(), Delivery, deliveryOf(), formatBurnRemaining() (+14 more)

### Community 129 - "avatar.ts"
Cohesion: 0.50
Nodes (4): avatarCache, buildDefaultAvatar(), compressAvatarFile(), svgToBase64Uri()

### Community 130 - "verifiedPohBadgesByAuthor"
Cohesion: 0.08
Nodes (64): Supporters, RFC-9474, bitsOf(), cat(), challengeBytes(), checkProof(), decodeProof(), enc (+56 more)

### Community 131 - "WebOfTrust"
Cohesion: 0.26
Nodes (3): PostReactionEvaluation, TrustBadgeInfo, WebOfTrust

### Community 132 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+4 more)

### Community 133 - "Radica — Agent Rules"
Cohesion: 0.50
Nodes (3): MUST: updates tab + docs, same session, Radica — Agent Rules, Testing & verification

### Community 134 - "🚀 Getting Started"
Cohesion: 0.22
Nodes (9): 1. Installation, 2. Development Mode, 3. Contract Compilation & Testing, 4. Build Production Web Application, 5. Publish to Freenet, 6. Launch the Desktop App (Rust + Freenet node), 7. Terminal Chat, 🚀 Getting Started (+1 more)

### Community 136 - "DelegationProofV1"
Cohesion: 0.21
Nodes (4): DelegationProofV1, PohBadge, VerifiedDelegation, verifiedDelegations()

### Community 137 - ".logEntries"
Cohesion: 0.12
Nodes (20): Profile extras, isValidLogEntry(), KVStore, mergeLoadedWalletInputs(), PROFILE_EXTRA_LOGS, PROFILE_EXTRAS_BACKUP_PREFIX, profileExtraLogNames(), restoreOwnProfileExtras() (+12 more)

### Community 138 - "TASK-004: Long-Form Articles & Decentralized Newsletters (Substack / Medium)"
Cohesion: 0.40
Nodes (4): Context & Goal, Requirements, Status, TASK-004: Long-Form Articles & Decentralized Newsletters (Substack / Medium)

### Community 139 - "node-bridge.ts"
Cohesion: 0.16
Nodes (11): quit(), bus, g, HOME, LOG, profileSummary(), shutdown(), STORE (+3 more)

### Community 140 - "topPosts.test.ts"
Cohesion: 0.19
Nodes (8): EQUAL, FeedSort, FUTURE_SLACK_MS, postScore(), sortPosts(), Weights, WINDOW_MS, now

### Community 141 - "tui.ts"
Cohesion: 0.27
Nodes (7): cut(), startTui(), TuiConv, TuiHandlers, TuiState, width(), wrap()

### Community 143 - "syncFreenetMailInbox"
Cohesion: 0.36
Nodes (8): hex(), INFO, newEpk(), openEsk(), unhex(), hex(), seal(), un()

### Community 144 - "repost.ts"
Cohesion: 0.30
Nodes (10): hasUserReposted(), repostBody(), repostCaption(), repostCountsOf(), repostLink(), RepostRef, repostRef(), RepostView (+2 more)

### Community 145 - "TASK-007: Curated Boards & Collections (Pinterest / Are.na)"
Cohesion: 0.50
Nodes (3): Context & Goal, Requirements, TASK-007: Curated Boards & Collections (Pinterest / Are.na)

### Community 146 - "vite.config.ts"
Cohesion: 0.12
Nodes (4): UPDATES, ASSET_KEYS, BUILD, FREENET_ASSETS

### Community 147 - "finishWelcome"
Cohesion: 0.33
Nodes (6): finishWelcome(), hasDefaultName(), maybeShowWelcome(), setChatFullscreen(), welcomeDoneKey(), welcomeStep()

### Community 148 - "river.ts"
Cohesion: 0.29
Nodes (7): Exports, loadJsonWasm(), loadRiver(), river(), RIVER_SITE, ./wasm/river.wasm?url, wasm()

### Community 149 - "encryptFreenetMailV1"
Cohesion: 0.27
Nodes (9): Context & Bug Report, Requirements, Status, TASK-002: Fix Native Freemail Reply: Use Inbox Contract Token as Sender `from`, buildAftSignatureContent(), encryptFreenetMailV1(), sanitizeMailAlias(), resolveFreemailSenderAddress() (+1 more)

### Community 150 - "Radica: Terms of Use, Disclaimer and Privacy"
Cohesion: 0.22
Nodes (9): 1. Software provided "as is", 2. No central service, no central moderation, 3. Your responsibility, 4. Donations and supporter badges, 5. Greenhouse, 6. Privacy, 7. Reporting illegal content, 8. Changes (+1 more)

### Community 151 - "showScanResult"
Cohesion: 0.22
Nodes (10): blockPublishBtnForNsfw(), blockPublishBtnForUnverified(), isPostInCooldown(), resetPublishBtnState(), revokePosterUrl(), setMediaSensitive(), setMediaVerifiedSafe(), showScanResult() (+2 more)

### Community 152 - "ghostkey.ts"
Cohesion: 0.39
Nodes (8): checked, checkGhostkey(), ghostkey(), GHOSTKEYS_VAULT, REFUSALS, requestGhostkeyProof(), verifiedGhostkeys(), ./wasm/ghostkey.wasm?url

### Community 153 - "super"
Cohesion: 0.31
Nodes (4): a_packet_on_the_port_reaches_the_page_and_an_oversized_one_does_not(), MAX_BYTES, Mesh, PORT

### Community 154 - "rotation"
Cohesion: 0.29
Nodes (4): Invitation, kick_rotation_excludes_banned_invite_subtree(), rotation(), time()

### Community 158 - "heavyUrl"
Cohesion: 0.36
Nodes (8): closeGifPicker(), CURATED_GIFS, GifItem, openGifPicker(), isDirectUrl(), renderGrid(), safeDirectUrl(), heavyUrl()

### Community 159 - "Radica (Freenet Edition) 🌱"
Cohesion: 0.25
Nodes (6): 🏗️ Architecture, 📄 License, 📜 Origin & Acknowledgments, Radica (Freenet Edition) 🌱, 🔒 Security & Privacy Model, ⚖️ Terms, Disclaimer & Privacy

### Community 160 - "Radica — domain language"
Cohesion: 0.29
Nodes (6): Device storage, Greenhouse, Linfa, Radica — domain language, 14. 🌳 Living Tree: Visual Network & Conversation Graph, Seed

### Community 161 - "Folio"
Cohesion: 0.29
Nodes (6): Development, Folio, License, Limitations, Publishing, What it does

### Community 162 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, chat, cli:build, dev, e2e, prebuild, predev (+2 more)

### Community 163 - "refreshSupporters"
Cohesion: 0.60
Nodes (5): amVouched(), ghostkeyKey(), pohKey(), refreshSupporters(), getStoredReceipt()

### Community 166 - "renderNotifs"
Cohesion: 0.50
Nodes (3): notificationHasTarget(), renderNotifs(), splitNotifs()

### Community 167 - "build.rs"
Cohesion: 0.47
Nodes (4): bundle_ui(), collect(), HEAVY, main()

### Community 178 - "postGone.ts"
Cohesion: 0.60
Nodes (3): GONE_MESSAGE, WhyGone, whyGone()

### Community 179 - "roots.ts"
Cohesion: 0.60
Nodes (3): cut(), Root, rootsSvg()

## Knowledge Gaps
- **65 isolated node(s):** `Binary`, `Downloading`, `FindingRelease`, `Installing`, `Verifying` (+60 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1699 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `FreenetClient` connect `FreenetClient` to `verifiedPohBadgesByAuthor`, `🌟 Key Features`, `DelegationProofV1`, `.logEntries`, `types.ts`, `secretChatTransport.ts`, `versionCheck.ts`, `UserIdentity`, `asocial.ts`, `hexToBytes`, `nodeOrigin`, `createMessengerChat`, `icons.ts`, `.applyLog`, `chatMedia.ts`, `secretChat.ts`, `freenet.ts`, `caption.ts`, `network.ts`, `renderIdentityModal`, `media.ts`, `rootsfx.ts`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `createMessengerChat()` (e.g. with `closeMentionPopup()` and `onViewportResize()`) actually correct?**
  _`createMessengerChat()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Binary`, `Downloading`, `FindingRelease` to the rest of the system?**
  _65 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `freenetMail.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Why does `Decisions` connect `createMessengerChat` to `freenetMail.ts`, `escapeHtml`, `init`, `selectPrivateRoom`, `secretChatTransport.ts`, `createMessengerChat`, `.shouldInterceptRequest`, `openUserProfile`, `Radica — domain language`, `delegate.ts`, `handleJoinFromInviteUrl`, `mailClient.ts`, `freenet.ts`, `messengerChat.ts`, `handles.test.ts`, `linfa.ts`, `.isRadicaUrl`, `Override`, `communitiesPage.ts`, `treeGraph.ts`, `greenhouse.ts`, `isCanonicalPost`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Should `escapeHtml` be split into smaller, more focused modules?**
  _Cohesion score 0.06807511737089202 - nodes in this community are weakly interconnected._
- **Why does `SafeStorage` connect `SafeStorage` to `🌟 Key Features`, `TASK-004: Long-Form Articles & Decentralized Newsletters (Substack / Medium)`, `durable.ts`, `articles.ts`, `NotificationItem`, `hexToBytes`, `sound.ts`, `createMessengerChat`, `secretChat.ts`, `handleJoinFromInviteUrl`, `mailClient.ts`, `supporterPanel.ts`, `secretChat.ts`, `freenet.ts`, `messengerChat.ts`, `network.ts`, `supporter.ts`, `savedPosts.ts`, `boards.ts`, `riverPointer.ts`, `chat.ts`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._