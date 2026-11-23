# Graph Report - radica  (2026-11-23)

## Corpus Check
- 310 files · ~435,083 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 41 file(s) not represented in the graph (top: (none) 13, .wasm 13, .css 5)

## Summary
- 4883 nodes · 13340 edges · 174 communities (141 shown, 33 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 504 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `61e36bc7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- freenetMail.ts
- mediaHashOf
- lib.rs
- init
- scripts
- whoiam.ts
- 🌟 Key Features
- handle
- dependencies
- renderIcon
- FreenetClient
- postGone.ts
- freenames.ts
- vite.config.ts
- signOut
- types.ts
- UserIdentity
- river-wasm/src/lib.rs
- SafeStorage
- .process
- secretChatTransport.ts
- MainActivity
- attachCardListeners
- feedsize.ts
- articles.ts
- versionCheck.ts
- UserIdentity
- messengerChat.ts
- renderCommunitiesPage
- web.rs
- asocial.ts
- with
- CHANGELOG.md
- steps
- NotificationItem
- delta.ts
- nodeOrigin
- types.ts
- riverPointer.ts
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
- moderation.spec.ts
- package.json
- createMessengerChat
- SafeStorage
- RiverRooms
- BatchTranslator
- attester
- milestones.ts
- Radica donation contract
- merge_at
- Radica attester
- linfa.ts
- escapeHtml
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
- durable.ts
- video.ts
- Post
- riverPointer.ts
- .refresh
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
- versionCheck.ts
- Radica Issues & Task Tracker
- freetree.ts
- steps
- pow.ts
- TASK-003: Mail Contacts Management (Add & Remove Contacts)
- TASK-006: Short-Form Vertical Video & Video Channels (TikTok / YouTube)
- river-watch.py
- TASK-008: Social Audio, Podcasts & Persistent Player (Spotify / FreeTunes)
- TASK-009: Dedicated Events Calendar & RSVP System (Luma / Meetup)
- storage.ts
- CHANGELOG.md
- scripts
- rootsfx.ts
- savedPosts.ts
- InstallStep
- feedsize.ts
- conversationState.ts
- avatar.ts
- verifiedPohBadgesByAuthor
- openUserProfile
- compilerOptions
- feedlight.ts
- 🚀 Getting Started
- savedPosts.ts
- isCanonicalPost
- .logEntries
- sporeRadio.ts
- node-bridge.ts
- topPosts.test.ts
- Folio
- syncFreenetMailInbox
- TASK-004: Long-Form Articles & Decentralized Newsletters (Substack / Medium)
- TASK-007: Curated Boards & Collections (Pinterest / Are.na)
- vite.config.ts
- init
- icons.ts
- WalkieStore
- Radica: Terms of Use, Disclaimer and Privacy
- loadCustomApps
- heavyUrl
- super
- rotation
- ref_node_fs
- loadPinnedApps
- scripts
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
- `8. 📸 Moments Compression & Sandboxed Persistence Engine` --references--> `SafeStorage`  [INFERRED]
  README.md → ui/src/storage.ts
- `Requirements` --references--> `SafeStorage`  [INFERRED]
  tasks/004-long-form-articles-newsletter.md → ui/src/storage.ts
- `4. 🌐 Cryptographic Personas & Decentralized Storage` --references--> `DelegationProofV1`  [INFERRED]
  README.md → ui/src/viso.ts
- `📜 Origin & Acknowledgments` --references--> `DelegationProofV1`  [INFERRED]
  README.md → ui/src/viso.ts
- `6. 💬 P2P Direct Chat & Interactive Feeds` --references--> `fromBase58()`  [INFERRED]
  README.md → ui/src/base58.ts

## Import Cycles
- 2-file cycle: `ui/src/handles.ts -> ui/src/logfold.ts -> ui/src/handles.ts`
- 2-file cycle: `apps/desktop/src/host.rs -> apps/desktop/src/install.rs -> apps/desktop/src/host.rs`
- 3-file cycle: `ui/src/crypto.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/crypto.ts`
- 4-file cycle: `ui/src/crypto.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/riverPointer.ts -> ui/src/crypto.ts`

## Communities (174 total, 33 thin omitted)

### Community 0 - "freenetMail.ts"
Cohesion: 0.06
Nodes (51): Context & Bug Report, Requirements, Status, TASK-002: Fix Native Freemail Reply: Use Inbox Contract Token as Sender `from`, BIP39_WORDLIST, ADDRESS_CONTEXT, AFT_TIER_SPEC, AFT_TIERS (+43 more)

### Community 1 - "mediaHashOf"
Cohesion: 0.24
Nodes (12): encodeChatMediaToken(), encodeWaveformHex(), keepChatMediaUrl(), safeMimeForKind(), sealChatMedia(), sealChatMediaChunked(), sealWithKey(), sendChatAttachment() (+4 more)

### Community 2 - "lib.rs"
Cohesion: 0.05
Nodes (97): hx(), key(), prepare(), run(), STATE, main(), state(), an_author_takes_back_a_comment_with_an_empty_version() (+89 more)

### Community 3 - "init"
Cohesion: 0.09
Nodes (43): askModel(), askRaw(), ghFetch(), greenhousePass(), loadMod(), modPass(), applyHoldOutcomes(), BATCH (+35 more)

### Community 4 - "scripts"
Cohesion: 0.07
Nodes (29): author, description, keywords, license, name, scripts, app, app:messenger (+21 more)

### Community 5 - "whoiam.ts"
Cohesion: 0.09
Nodes (30): ANTE_CODE_HASH, VOTE_BITS, votePurpose(), CborValue, enumVariant(), anteCall(), code(), createPoll() (+22 more)

### Community 6 - "🌟 Key Features"
Cohesion: 0.13
Nodes (14): 10. ✉️ Radica Mail & Freenet Mail Interoperability (Post-Quantum), 12. 🔁 Reposts Without a Contract Change, 13. ⚙️ Dedicated Settings, Decluttered Rail & Wall-First Profiles, 13. 🖼️ Moments Gallery (Media Explore), 1. 🛡️ On-Device AI Moderation (Desert Ant Labs), 2. 🔒 Automated PII Redaction & Text Censorship, 3. ⏱️ Decentralized Anti-Flooding & Rate Limiting, 4. 🌐 Cryptographic Personas & Decentralized Storage (+6 more)

### Community 7 - "handle"
Cohesion: 0.18
Nodes (18): a_secret_blob_that_does_not_decrypt_is_skipped(), body(), cbor(), entering(), handle(), is_private(), key32(), msg_id() (+10 more)

### Community 8 - "dependencies"
Cohesion: 0.08
Nodes (35): @browsermt/bergamot-translator, @fontsource-variable/fraunces, @fontsource-variable/inter, freenet-blob, jsqr, @litertjs/core, @noble/curves, @noble/post-quantum (+27 more)

### Community 9 - "renderIcon"
Cohesion: 0.08
Nodes (62): generateDefaultAvatar(), maskChatMediaTokens(), playChatVoiceByHash(), safeUrl(), shortenKey(), renderIcon(), applyProfile(), attachBubbleDeleteListeners() (+54 more)

### Community 10 - "FreenetClient"
Cohesion: 0.05
Nodes (5): FreenetClient, foldCommentLikes(), foldPostDislikes(), ProfileExtraKind, setActiveSecretChatTTL()

### Community 11 - "postGone.ts"
Cohesion: 0.21
Nodes (17): maskProfanity(), BlobVideoRef, filterVideoReels(), formatBlobVideoCaption(), isVideoReelPost(), parseBlobVideoRef(), stepReelIndex(), VIDEO_BLOB_PREFIX (+9 more)

### Community 12 - "freenames.ts"
Cohesion: 0.10
Nodes (25): clearResolvedFreenames(), dec, enc, freenameInCaption(), FREENAMES_KEY, FreenameUri, ID, inflightResolutions (+17 more)

### Community 13 - "vite.config.ts"
Cohesion: 0.12
Nodes (17): a_proof_holds_for_its_identity_only_and_under_the_real_master_only(), a_sign_result_becomes_the_bundle_viso_stores(), BIND_TAG, binding_payload(), call(), cbor(), empty_requestor_is_rejected(), fixture() (+9 more)

### Community 14 - "signOut"
Cohesion: 0.14
Nodes (35): an_author_s_newer_entry_replaces_the_older_under_one_key(), delta(), Entry, entry2(), entry(), entry_msg(), entry_msg2(), forgeries_and_replays_are_rejected() (+27 more)

### Community 15 - "types.ts"
Cohesion: 0.16
Nodes (10): overlayFeed(), GONE_MESSAGE, WhyGone, whyGone(), PoWProof, mergeRoomBackup(), FeedState, GARDENER_NAME (+2 more)

### Community 16 - "UserIdentity"
Cohesion: 0.13
Nodes (6): ModerationSets, MessengerDeps, postIdWithPow(), BuildTreeGraphInput, Community, UserIdentity

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
Cohesion: 0.06
Nodes (51): issueReceipt(), append(), attesterPk, code, codeHash, connect(), feedCode, feedHash (+43 more)

### Community 23 - "feedsize.ts"
Cohesion: 0.15
Nodes (20): stageOf(), STAGES, Bloom, Branch, clamp(), curve(), [CX, GROUND], end() (+12 more)

### Community 24 - "articles.ts"
Cohesion: 0.12
Nodes (50): ARTICLE_CACHE_PREFIX, ARTICLE_DRAFTS_PREFIX, ARTICLE_PREFIX, ArticleDraft, articleDraftsKey(), articleMissingNote(), ArticlePayload, ArticleRef (+42 more)

### Community 25 - "versionCheck.ts"
Cohesion: 0.16
Nodes (11): bytesToHex, RiverCall, Anchor, enc, ownerSkCache, RiverNet, RiverRooms, RiverView (+3 more)

### Community 26 - "UserIdentity"
Cohesion: 0.09
Nodes (13): seedReadMark(), decryptWithSymmetricKey(), encryptDirectMessage(), encryptRoomKeyForPeer(), encryptWithSymmetricKey(), getCryptoKeyFromBytes(), computeRoomJoinProof(), MessengerActiveState (+5 more)

### Community 27 - "messengerChat.ts"
Cohesion: 0.04
Nodes (134): Chat, asocialCard(), compressAvatarFile(), plainMentions(), analyzeAudioBlob(), canCaptureVideoNote(), canRecordVoice(), canUseLiveMediaCapture() (+126 more)

### Community 28 - "renderCommunitiesPage"
Cohesion: 0.08
Nodes (60): fillAsocial(), fillDelta(), fillFh(), fillFreenames(), fillFreepolls(), freepollsCard(), freepollsLink(), fillFreetunes() (+52 more)

### Community 29 - "web.rs"
Cohesion: 0.06
Nodes (43): MANUAL_INSTALL_URL, ANSWER_DEADLINE, app_mode_configures_messenger_binary(), AppMode, Full, Messenger, bring_up(), BUNDLED_ORIGIN (+35 more)

### Community 30 - "asocial.ts"
Cohesion: 0.12
Nodes (30): ASOCIAL_RECORDS_CODE, ASOCIAL_RECORDS_CODE_BYTES, ASOCIAL_REPO, AsocialData, asocialLink(), asocialOwnStoreKey(), asocialOwnStoreParams(), asocialPersonHref() (+22 more)

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
Nodes (541): accentSelect, activeFilterBanner, activeFilterPrefix, activeFilterTag, addModForm, addModPubkeyInput, alerted, allCommunities (+533 more)

### Community 35 - "delta.ts"
Cohesion: 0.16
Nodes (24): hexToBytes, decodeCbor(), deltaCard(), deltaInCaption(), DeltaPage, deltaPrefixOf(), DeltaSite, DeltaUri (+16 more)

### Community 36 - "nodeOrigin"
Cohesion: 0.08
Nodes (31): chunk(), coverUrls, Fetch, fillFreetunesProfile(), fmtTime(), FREETUNES_DIR_ADMIN, FREETUNES_DIR_CODE_HASH, FREETUNES_KEY (+23 more)

### Community 37 - "types.ts"
Cohesion: 0.13
Nodes (33): closeModal(), hasOpenModal(), installModalDismiss(), openModals(), ActiveView, clearSelectedPostCard(), closeOtherPages(), findNextCardIndex() (+25 more)

### Community 38 - "riverPointer.ts"
Cohesion: 0.19
Nodes (17): Exports, loadRiver(), river(), RIVER_SITE, anchorOf(), BUNDLED_ROOM_CODE, Floor, instanceOf() (+9 more)

### Community 39 - "createMessengerChat"
Cohesion: 0.06
Nodes (51): MUST: content moderation, all 3 layers, MUST: updates tab + docs, same session, Radica — Agent Rules, Testing & verification, foldHandles(), formatHandle(), isValidHandle(), normalizeHandle() (+43 more)

### Community 40 - "Reader"
Cohesion: 0.15
Nodes (24): resolveEncPub(), roomModPass(), signPrivateRoomMessage(), aesGcmDecrypt(), aesGcmEncrypt(), computeRoomJoinProof(), connectMessage(), dec (+16 more)

### Community 41 - "secretChat.ts"
Cohesion: 0.11
Nodes (25): before, draftTranslateHtml(), initDraftTranslate(), translateKeeping(), applyAccent(), applyFullWidth(), applyTheme(), initFullWidth() (+17 more)

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
Nodes (27): AudioQueueState, AudioQueueTrack, createAudioQueueState(), enqueueInQueue(), filterFreetunesReleases(), formatAudioTime(), nextQueueIndex(), playInQueue() (+19 more)

### Community 46 - "handleJoinFromInviteUrl"
Cohesion: 0.08
Nodes (45): Device storage, Greenhouse, Linfa, Radica — domain language, 14. 🌳 Living Tree: Visual Network & Conversation Graph, freenet, foldGreenhouse(), formatSeedsForAi() (+37 more)

### Community 47 - ".applyLog"
Cohesion: 0.12
Nodes (6): dmPeerOf(), localReadMarks(), foldChat(), foldChatRead(), keepNewest(), NotificationItem

### Community 48 - "chatMedia.ts"
Cohesion: 0.06
Nodes (44): AUDIO_EXT, base64ToBytes(), blobCache, cacheKeyOf(), canvasToJpegBlob(), ChatMediaKind, decodeWaveformHex(), fetchChatMedia() (+36 more)

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
Cohesion: 0.09
Nodes (56): Mail, ArticlesPageDeps, ADDRESS_CHARS, AftTier, AftTokenAssignment, decryptFreenetMailV1(), FreenetMailIdentity, INBOX_V1_CODE_HASH (+48 more)

### Community 54 - "steps"
Cohesion: 0.07
Nodes (27): concurrency, cancel-in-progress, group, environment, runs-on, steps, name, url (+19 more)

### Community 55 - "delegate.ts"
Cohesion: 0.15
Nodes (23): api(), asBytes(), call(), chain, dec, delegateMessage(), enc, extractPayload() (+15 more)

### Community 56 - "secretChat.ts"
Cohesion: 0.10
Nodes (55): checked, checkGhostkey(), ghostkey(), GHOSTKEYS_VAULT, REFUSALS, requestGhostkeyProof(), verifiedGhostkeys(), amVouched() (+47 more)

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
Cohesion: 0.08
Nodes (50): AsocialWorkItem, addReadKeys(), commentMsg3(), decryptDirectMessage(), decryptRoomKeyFromPeer(), deleteMsg3(), enc, FEED_POW_BITS (+42 more)

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

### Community 68 - "SafeStorage"
Cohesion: 0.24
Nodes (4): isHashSafeKey(), isSensitiveStorageKey(), nativeBridge(), SafeStorage

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
Cohesion: 0.18
Nodes (12): renderMilestones(), Counts, FIRST, Metric, METRIC_LABELS, METRICS, Milestone, milestone() (+4 more)

### Community 73 - "Radica donation contract"
Cohesion: 0.33
Nodes (5): Before Base mainnet, Deploy, Deployments, Radica donation contract, Test

### Community 74 - "merge_at"
Cohesion: 0.17
Nodes (9): check(), de(), err(), Kind, kind(), merge_at(), now_ms(), RadicaLogContract (+1 more)

### Community 75 - "Radica attester"
Cohesion: 0.25
Nodes (7): AI moderation helper, CapRover, Contract sweep, FreeTunes check, Radica attester, Run, Test

### Community 76 - "linfa.ts"
Cohesion: 0.14
Nodes (17): 11. 🌱 Linfa: a Plant on Every Profile, Gain, gains(), Linfa, linfaGreenhouseWeight(), linfaOf(), MIN_TRUSTED_RECEIVED, PlantSeason (+9 more)

### Community 77 - "escapeHtml"
Cohesion: 0.05
Nodes (70): renderArticleFeedCardHtml(), renderAnteBadgeHtml(), renderPohProviderBadgesHtml(), renderPostSubMetaHtml(), renderTrustBadgeHtml(), CHAT_TOKEN_RE, chatText(), escMd() (+62 more)

### Community 78 - "fetch-translation-models.mjs"
Cohesion: 0.12
Nodes (7): wasmAsDataUrl, dest, out, pairs, registry, bin, ui

### Community 79 - "network.ts"
Cohesion: 0.06
Nodes (33): Key fact: the migration machinery already exists, CURRENT, LEGACY, limiter(), asBytes(), bgGate, codes, contractCode() (+25 more)

### Community 80 - "versionCheck.ts"
Cohesion: 0.07
Nodes (44): canonicalFieldStr(), CLAIMS_LOG, enc, judgeClaim(), logEntryMessage(), logEntryMessage2(), powBits(), RECEIPTS_LOG (+36 more)

### Community 83 - "contactCard.ts"
Cohesion: 0.26
Nodes (7): cardsKey(), contactCardText(), readContactCards(), saveContactCard(), Store, enc, pk

### Community 84 - "DesktopHost"
Cohesion: 0.14
Nodes (16): Answer, Nothing, NoVersion, Version, ask(), classify(), DesktopHost, NodeProbe (+8 more)

### Community 85 - "lanMesh.ts"
Cohesion: 0.13
Nodes (22): ContactCard, formatChatMessageSignatureMessage(), verifyAuthorSignature(), acceptHello(), acceptMeshPacket(), bridge(), Hello, HELLO_EVERY_MS (+14 more)

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

### Community 95 - "durable.ts"
Cohesion: 0.19
Nodes (7): createDurable(), durable, DURABLE_PREFIXES, DurableNode, DurableStore, isDurable(), packageKey()

### Community 96 - "video.ts"
Cohesion: 0.18
Nodes (15): mediabunny, mediabunny@^1.65.0, ChatMediaItem, ChunkProgress, isFragmentedMp4(), MAX_CHAT_FILE_BYTES, scanTimes(), ImageModerationResult (+7 more)

### Community 97 - "Post"
Cohesion: 0.27
Nodes (7): CommentEntry, CommentFilters, BuildPostCardOptions, ReelsPlayerDeps, Comment, Post, [ME, BOB, EVE]

### Community 98 - "riverPointer.ts"
Cohesion: 0.19
Nodes (22): Voter, canonicalBase(), certShowsHost(), connectMessage(), createLocalIdentity(), enc, finishSignIn(), getAppKeyPubkey() (+14 more)

### Community 100 - "renderIdentityModal"
Cohesion: 0.26
Nodes (14): cleanExcerpt(), decodeB64u(), encodeB64u(), ORTO_PATH, ORTO_SITE, ORTO_VAULT_CODE_HASH, OrtoBlog, ortoCard() (+6 more)

### Community 101 - "chat.ts"
Cohesion: 0.22
Nodes (16): clock(), command(), lastList, messagesOf(), nameOf(), printMessage(), resolvePeer(), rl (+8 more)

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
Cohesion: 0.11
Nodes (28): ASOCIAL_SITE, DELTA_WEB, AppFilter, AppGroup, appId(), ATLAS_SITE, AULA_SITE, CustomAppRecord (+20 more)

### Community 108 - "TASK-001: Responsive 13.3" Laptop Layout for Wall & Profile Modal"
Cohesion: 0.33
Nodes (5): Context, Problem Analysis, Requirements, Status, TASK-001: Responsive 13.3" Laptop Layout for Wall & Profile Modal

### Community 109 - "treeGraph.ts"
Cohesion: 0.12
Nodes (26): FT_TREE_PREFIX, ARTICLE_BOUGH, buildTreeGraph(), CATEGORY_BOUGHS, clamp(), computeNetworkTreeStage(), cut(), leafSvgPath() (+18 more)

### Community 110 - "moderation.ts"
Cohesion: 0.21
Nodes (11): @desert-ant-labs/moderator, @desert-ant-labs/moderator@^4.0.0, analyzeTextContent(), BAD_WORDS, BAD_WORDS_RE, censorTextAndPII(), getModerator(), personalDataIn() (+3 more)

### Community 111 - "versionCheck.ts"
Cohesion: 0.36
Nodes (8): handleSignOut(), check(), newNotes(), shortNote(), showReloadModal(), startVersionCheck(), restart(), signOut()

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
Cohesion: 0.16
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

### Community 121 - "storage.ts"
Cohesion: 0.14
Nodes (19): openSettingsModal(), updateNotifsSoundBtn(), getAudioContext(), isSoundEnabled(), playBufferPop(), playPopSound(), playSynthesizedPop(), preloadPopSound() (+11 more)

### Community 122 - "CHANGELOG.md"
Cohesion: 0.14
Nodes (15): Supporters, anteTierOf(), DelegationProofV1, hex(), importPohKey(), isDelegationProofShape(), parseVisoPubkeyHex(), PohBadge (+7 more)

### Community 123 - "scripts"
Cohesion: 0.11
Nodes (21): dependencies, @freenetorg/freenet-stdlib@latest, @noble/hashes@^2.4.0, devDependencies, typescript@^5.6.0, vite@^6.0.0, @freenetorg/freenet-stdlib, @noble/hashes (+13 more)

### Community 124 - "rootsfx.ts"
Cohesion: 0.17
Nodes (21): cleanHash(), dec, enc, FH_APP_PATH, FH_LIST_CODE_HASH, FH_SITE, fhLink(), FhListData (+13 more)

### Community 125 - "savedPosts.ts"
Cohesion: 0.44
Nodes (7): isSaved(), keyOf(), load(), memo, savedId(), savedPosts(), toggleSaved()

### Community 126 - "InstallStep"
Cohesion: 0.29
Nodes (6): InstallStep, Downloading, FindingRelease, Installing, Verifying, WaitingForInstaller

### Community 127 - "feedsize.ts"
Cohesion: 0.31
Nodes (8): FEED_BUDGET, FEED_SHOW, FEED_TARGET, feedBytes(), formatBytes(), oldestToFree(), postBytes(), renderFeedSize()

### Community 128 - "conversationState.ts"
Cohesion: 0.15
Nodes (18): ConversationDeps, ConversationState, createConversationState(), Delivery, formatBurnRemaining(), KeyValue, nextTtl(), READ_MARKS_KEY (+10 more)

### Community 129 - "avatar.ts"
Cohesion: 0.29
Nodes (7): avatarCache, buildDefaultAvatar(), compressPostImageFile(), svgToBase64Uri(), dataUriToBytesAndMime(), measureImageDimensions(), prepareChatImageFile()

### Community 130 - "verifiedPohBadgesByAuthor"
Cohesion: 0.10
Nodes (48): RFC-9474, bitsOf(), cat(), challengeBytes(), checkProof(), decodeProof(), enc, grind() (+40 more)

### Community 131 - "openUserProfile"
Cohesion: 0.05
Nodes (81): Feed, Status, addItemToBoard(), BOARD_PREFIX, BoardFilterOpts, BoardItem, boardPermalink(), createBoard() (+73 more)

### Community 132 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+4 more)

### Community 133 - "feedlight.ts"
Cohesion: 0.23
Nodes (10): giveUpWorker(), LightFeed, lightFeed(), lightFeedOf(), mergeFeedText(), parseInline(), PEER_POSTS, waiting (+2 more)

### Community 134 - "🚀 Getting Started"
Cohesion: 0.13
Nodes (15): 1. Installation, 2. Development Mode, 3. Contract Compilation & Testing, 4. Build Production Web Application, 5. Publish to Freenet, 6. Launch the Desktop App (Rust + Freenet node), 7. Terminal Chat, 🏗️ Architecture (+7 more)

### Community 136 - "isCanonicalPost"
Cohesion: 0.14
Nodes (15): 1. Signatures: v3 messages, length-prefixed, v2 still accepted, 2. Caps that bound size without letting spam evict real content, 3. Hex and delta fixes, 4. Rollout, 5. Carrying all data (no rollback), Context & Goal, Design, Open questions (+7 more)

### Community 137 - ".logEntries"
Cohesion: 0.06
Nodes (24): Profile extras, LogEntry, backupOwnProfileExtras(), isProfileExtraLog(), isValidLogEntry(), KVStore, latestOwnLogEntry(), mergeLoadedWalletInputs() (+16 more)

### Community 138 - "sporeRadio.ts"
Cohesion: 0.39
Nodes (6): isSporeRadioLive(), RADIO_HEARTBEATS, recordSporeRadioHeartbeat(), SPORE_REPO, sporeRadioLink(), SporeRadioRef

### Community 139 - "node-bridge.ts"
Cohesion: 0.20
Nodes (7): bus, g, HOME, LOG, shutdown(), STORE, udp

### Community 140 - "topPosts.test.ts"
Cohesion: 0.19
Nodes (8): EQUAL, FeedSort, FUTURE_SLACK_MS, postScore(), sortPosts(), Weights, WINDOW_MS, now

### Community 141 - "Folio"
Cohesion: 0.29
Nodes (6): Development, Folio, License, Limitations, Publishing, What it does

### Community 143 - "syncFreenetMailInbox"
Cohesion: 0.31
Nodes (9): takeHandedKey(), hex(), INFO, newEpk(), openEsk(), unhex(), hex(), seal() (+1 more)

### Community 144 - "TASK-004: Long-Form Articles & Decentralized Newsletters (Substack / Medium)"
Cohesion: 0.40
Nodes (4): Context & Goal, Requirements, Status, TASK-004: Long-Form Articles & Decentralized Newsletters (Substack / Medium)

### Community 145 - "TASK-007: Curated Boards & Collections (Pinterest / Are.na)"
Cohesion: 0.50
Nodes (3): Context & Goal, Requirements, TASK-007: Curated Boards & Collections (Pinterest / Are.na)

### Community 146 - "vite.config.ts"
Cohesion: 0.12
Nodes (4): UPDATES, ASSET_KEYS, BUILD, FREENET_ASSETS

### Community 147 - "init"
Cohesion: 0.06
Nodes (78): yieldToMain(), alertUnread(), amGlobalMod(), applyDashboardSlots(), bootStep(), checkCommunitiesOnNetwork(), checkMilestones(), checkUrlInviteHash() (+70 more)

### Community 148 - "icons.ts"
Cohesion: 0.50
Nodes (3): EcosystemApp, ICON_PATHS, IconName

### Community 150 - "Radica: Terms of Use, Disclaimer and Privacy"
Cohesion: 0.18
Nodes (9): 1. Software provided "as is", 2. No central service, no central moderation, 3. Your responsibility, 4. Donations and supporter badges, 5. Greenhouse, 6. Privacy, 7. Reporting illegal content, 8. Changes (+1 more)

### Community 152 - "heavyUrl"
Cohesion: 0.36
Nodes (8): closeGifPicker(), CURATED_GIFS, GifItem, openGifPicker(), isDirectUrl(), renderGrid(), safeDirectUrl(), heavyUrl()

### Community 153 - "super"
Cohesion: 0.31
Nodes (4): a_packet_on_the_port_reaches_the_page_and_an_oversized_one_does_not(), MAX_BYTES, Mesh, PORT

### Community 154 - "rotation"
Cohesion: 0.29
Nodes (4): Invitation, kick_rotation_excludes_banned_invite_subtree(), rotation(), time()

### Community 162 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, chat, cli:build, dev, e2e, prebuild, predev (+2 more)

### Community 167 - "build.rs"
Cohesion: 0.47
Nodes (4): bundle_ui(), collect(), HEAVY, main()

## Knowledge Gaps
- **65 isolated node(s):** `Binary`, `Downloading`, `FindingRelease`, `Installing`, `Verifying` (+60 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1693 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `FreenetClient` connect `FreenetClient` to `mediaHashOf`, `init`, `🌟 Key Features`, `.logEntries`, `freenames.ts`, `UserIdentity`, `secretChatTransport.ts`, `versionCheck.ts`, `UserIdentity`, `asocial.ts`, `delta.ts`, `nodeOrigin`, `createMessengerChat`, `icons.ts`, `.applyLog`, `freenet.ts`, `network.ts`, `lanMesh.ts`, `Post`, `.refresh`, `renderIdentityModal`, `media.ts`, `pow.ts`, `CHANGELOG.md`, `rootsfx.ts`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `createMessengerChat()` (e.g. with `closeMentionPopup()` and `onViewportResize()`) actually correct?**
  _`createMessengerChat()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Binary`, `Downloading`, `FindingRelease` to the rest of the system?**
  _65 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `freenetMail.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06390977443609022 - nodes in this community are weakly interconnected._
- **Why does `Decisions` connect `init` to `openUserProfile`, `feedlight.ts`, `isCanonicalPost`, `renderIcon`, `FreenetClient`, `freenames.ts`, `init`, `secretChatTransport.ts`, `messengerChat.ts`, `.shouldInterceptRequest`, `renderCommunitiesPage`, `asocial.ts`, `NotificationItem`, `createMessengerChat`, `Reader`, `delegate.ts`, `handleJoinFromInviteUrl`, `.applyLog`, `mailClient.ts`, `freenet.ts`, `linfa.ts`, `lanMesh.ts`, `.isRadicaUrl`, `Override`, `communitiesPage.ts`, `treeGraph.ts`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Should `lib.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.05001139211665528 - nodes in this community are weakly interconnected._
- **Why does `MainActivity` connect `MainActivity` to `.onShowFileChooser`, `.isRadicaUrl`, `Override`, `MainActivity.java`, `.shouldInterceptRequest`, `.onCreate`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._