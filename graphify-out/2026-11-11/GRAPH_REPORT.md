# Graph Report - radica  (2026-11-11)

## Corpus Check
- 241 files · ~734,446 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2751 nodes · 7365 edges · 99 communities (88 shown, 11 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 102 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a07a0896`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_main.ts|main.ts]]
- [[_COMMUNITY_RiverRooms|RiverRooms]]
- [[_COMMUNITY_lib.rs|lib.rs]]
- [[_COMMUNITY_init|init]]
- [[_COMMUNITY_scripts|scripts]]
- [[_COMMUNITY_whoiam.ts|whoiam.ts]]
- [[_COMMUNITY_🚀 Getting Started|🚀 Getting Started]]
- [[_COMMUNITY_lib.rs|lib.rs]]
- [[_COMMUNITY_dependencies|dependencies]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_moderation.ts|moderation.ts]]
- [[_COMMUNITY_SafeStorage|SafeStorage]]
- [[_COMMUNITY_resetPublishBtnState|resetPublishBtnState]]
- [[_COMMUNITY_vite.config.ts|vite.config.ts]]
- [[_COMMUNITY_signOut|signOut]]
- [[_COMMUNITY_delta.ts|delta.ts]]
- [[_COMMUNITY_feature_request|feature_request.md]]
- [[_COMMUNITY_WHOIAM_KEY|WHOIAM_KEY]]
- [[_COMMUNITY_SafeStorage|SafeStorage]]
- [[_COMMUNITY_.process|.process]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_caption.ts|caption.ts]]
- [[_COMMUNITY_attachCardListeners|attachCardListeners]]
- [[_COMMUNITY_feedsize.ts|feedsize.ts]]
- [[_COMMUNITY_Contributor Covenant Code of Conduct|Contributor Covenant Code of Conduct]]
- [[_COMMUNITY_versionCheck.ts|versionCheck.ts]]
- [[_COMMUNITY_avatar.ts|avatar.ts]]
- [[_COMMUNITY_fetch-moderation-model.mjs|fetch-moderation-model.mjs]]
- [[_COMMUNITY_icons.ts|icons.ts]]
- [[_COMMUNITY_showProfilePage|showProfilePage]]
- [[_COMMUNITY_freenet.ts|freenet.ts]]
- [[_COMMUNITY_updates.ts|updates.ts]]
- [[_COMMUNITY_CHANGELOG|CHANGELOG.md]]
- [[_COMMUNITY_NotificationItem|NotificationItem]]
- [[_COMMUNITY_secretChat.ts|secretChat.ts]]
- [[_COMMUNITY_nodeOrigin|nodeOrigin]]
- [[_COMMUNITY_types.ts|types.ts]]
- [[_COMMUNITY_FREETUNES_KEY|FREETUNES_KEY]]
- [[_COMMUNITY_createMessengerChat|createMessengerChat]]
- [[_COMMUNITY_Reader|Reader]]
- [[_COMMUNITY_versionCheck.ts|versionCheck.ts]]
- [[_COMMUNITY_delegate.ts|delegate.ts]]
- [[_COMMUNITY_messengerLogic.ts|messengerLogic.ts]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_icons.ts|icons.ts]]
- [[_COMMUNITY_handleJoinFromInviteUrl|handleJoinFromInviteUrl]]
- [[_COMMUNITY_rootsfx.ts|rootsfx.ts]]
- [[_COMMUNITY_caption.test.ts|caption.test.ts]]
- [[_COMMUNITY_createMessengerChat|createMessengerChat]]
- [[_COMMUNITY_createMessengerChat|createMessengerChat]]
- [[_COMMUNITY_templateNesting.test.ts|templateNesting.test.ts]]
- [[_COMMUNITY_avatar.ts|avatar.ts]]
- [[_COMMUNITY_parseChatMedia|parseChatMedia]]
- [[_COMMUNITY_secretChat.ts|secretChat.ts]]
- [[_COMMUNITY_Radica — domain language|Radica — domain language]]
- [[_COMMUNITY_feedlight.ts|feedlight.ts]]
- [[_COMMUNITY_rootsfx.ts|rootsfx.ts]]
- [[_COMMUNITY_splitNotifs|splitNotifs]]
- [[_COMMUNITY_durable.ts|durable.ts]]
- [[_COMMUNITY_translate.ts|translate.ts]]
- [[_COMMUNITY_fillChatMedia|fillChatMedia]]
- [[_COMMUNITY_package.json|package.json]]
- [[_COMMUNITY_moderation.spec.ts|moderation.spec.ts]]
- [[_COMMUNITY_package.json|package.json]]
- [[_COMMUNITY_pow.ts|pow.ts]]
- [[_COMMUNITY_verify.js|verify.js]]
- [[_COMMUNITY_.notifyListeners|.notifyListeners]]
- [[_COMMUNITY_BatchTranslator|BatchTranslator]]
- [[_COMMUNITY_resolve|resolve]]
- [[_COMMUNITY_Radica donation contract|Radica donation contract]]
- [[_COMMUNITY_delegate.ts|delegate.ts]]
- [[_COMMUNITY_Radica attester|Radica attester]]
- [[_COMMUNITY_RadicaSupport.test.js|RadicaSupport.test.js]]
- [[_COMMUNITY_hardhat.config.js|hardhat.config.js]]
- [[_COMMUNITY_fetch-translation-models.mjs|fetch-translation-models.mjs]]
- [[_COMMUNITY_versionCheck.ts|versionCheck.ts]]
- [[_COMMUNITY_start.sh|start.sh]]
- [[_COMMUNITY_README|README.md]]
- [[_COMMUNITY_types.ts|types.ts]]
- [[_COMMUNITY_maybeShowWelcome|maybeShowWelcome]]
- [[_COMMUNITY_🚨 Mandatory Rule Features, Updates Tab & Documentation|🚨 Mandatory Rule: Features, Updates Tab & Documentation]]
- [[_COMMUNITY_resolve|resolve]]
- [[_COMMUNITY_fh.ts|fh.ts]]
- [[_COMMUNITY_riverPointer.ts|riverPointer.ts]]
- [[_COMMUNITY_WORMHOLE_PATH|WORMHOLE_PATH]]
- [[_COMMUNITY_wormholeHref|wormholeHref]]
- [[_COMMUNITY_roots.ts|roots.ts]]
- [[_COMMUNITY_media.ts|media.ts]]

## God Nodes (most connected - your core abstractions)
1. `FreenetClient` - 245 edges
2. `renderTimeline()` - 85 edges
3. `UserIdentity` - 79 edges
4. `escapeHtml()` - 63 edges
5. `openUserProfile()` - 40 edges
6. `PrivateRoom` - 39 edges
7. `initCardListeners()` - 38 edges
8. `RiverRooms` - 36 edges
9. `ChatMessage` - 35 edges
10. `getAuthorDisplayName()` - 34 edges

## Surprising Connections (you probably didn't know these)
- `connect()` --indirect_call--> `api()`  [INFERRED]
  attester/src/main.js → ui/src/delegate.ts
- `Entry` --references--> `Cert`  [EXTRACTED]
  log-contract/src/lib.rs → ui/src/whoiam.ts
- `fillFreeHole()` --indirect_call--> `code()`  [INFERRED]
  ui/src/wormhole.ts → ui/src/freepolls.ts
- `start_binary()` --calls--> `installed_by_river()`  [INFERRED]
  apps/desktop/src/host.rs → apps/desktop/src/install.rs
- `what_answers_on_the_port_decides_the_state()` --calls--> `Version`  [INFERRED]
  apps/desktop/src/host.rs → apps/desktop/src/release.rs

## Import Cycles
- 3-file cycle: `ui/src/crypto.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/crypto.ts`
- 4-file cycle: `ui/src/crypto.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/riverPointer.ts -> ui/src/crypto.ts`
- 4-file cycle: `ui/src/crypto.ts -> ui/src/types.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/crypto.ts`
- 5-file cycle: `ui/src/crypto.ts -> ui/src/types.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/riverPointer.ts -> ui/src/crypto.ts`

## Communities (99 total, 11 thin omitted)

### Community 0 - "main.ts"
Cohesion: 0.01
Nodes (326): accentSelect, activeFilterBanner, activeFilterTag, addModForm, addModPubkeyInput, alerted, allCommunities, allPrivateRooms (+318 more)

### Community 1 - "RiverRooms"
Cohesion: 0.19
Nodes (21): addReadKeys(), decryptRoomKeyFromPeer(), decryptWithSymmetricKey(), enc, formatCommentSignatureMessage(), formatCommunitySignatureMessage(), formatDeleteSignatureMessage(), formatFollowingSignatureMessage() (+13 more)

### Community 2 - "lib.rs"
Cohesion: 0.09
Nodes (72): BTreeSet, main(), SigningKey, state(), an_author_takes_back_a_comment_with_an_empty_version(), check_comment(), check_post(), Comment (+64 more)

### Community 3 - "init"
Cohesion: 0.31
Nodes (9): plainMentions(), measureImageDimensions(), normalizeAudioMime(), prepareChatAudioFile(), prepareChatDocFile(), prepareChatImageFile(), handleClassicDropFiles(), setClassicStagedMedia() (+1 more)

### Community 4 - "scripts"
Cohesion: 0.08
Nodes (23): author, description, keywords, license, name, scripts, app, build (+15 more)

### Community 5 - "whoiam.ts"
Cohesion: 0.06
Nodes (62): CHAT_TOKEN_RE, chatText(), escMd(), extractCommentMedia(), isSafeUrl(), LINK_RE, linkCard(), linkify() (+54 more)

### Community 6 - "🚀 Getting Started"
Cohesion: 0.05
Nodes (34): 10. ✉️ Freenet Mail Interoperability (Post-Quantum), 1. Installation, 1. 🛡️ On-Device AI Moderation (Desert Ant Labs), 2. 🔒 Automated PII Redaction & Text Censorship, 2. Development Mode, 3. Contract Compilation & Testing, 3. ⏱️ Decentralized Anti-Flooding & Rate Limiting, 4. Build Production Web Application (+26 more)

### Community 7 - "lib.rs"
Cohesion: 0.09
Nodes (62): AuthorizedEncryptedSecretForMember, AuthorizedMember, ChatRoomParametersV1, ChatRoomStateV1, ChatRoomStateV1Delta, MessageId, a_secret_blob_that_does_not_decrypt_is_skipped(), apply() (+54 more)

### Community 8 - "dependencies"
Cohesion: 0.07
Nodes (28): dependencies, @browsermt/bergamot-translator, @desert-ant-labs/moderator, @fontsource-variable/fraunces, @fontsource-variable/inter, freenet-blob, @freenetorg/freenet-stdlib, @litertjs/core (+20 more)

### Community 10 - "moderation.ts"
Cohesion: 0.06
Nodes (7): FreenetClient, MessengerActiveState, UnifiedConversation, postIdWithPow(), Community, Post, ProfileInfo

### Community 11 - "SafeStorage"
Cohesion: 0.08
Nodes (77): fillAsocial(), generateDefaultAvatar(), nodeOrigin(), deltaCard(), fillDelta(), pageHref(), escapeHtml(), safeUrl() (+69 more)

### Community 12 - "resetPublishBtnState"
Cohesion: 0.25
Nodes (9): blockPublishBtnForUnverified(), isPostInCooldown(), resetPublishBtnState(), revokePosterUrl(), setMediaSensitive(), setMediaVerifiedSafe(), showScanResult(), stageVideo() (+1 more)

### Community 13 - "vite.config.ts"
Cohesion: 0.18
Nodes (24): a_proof_holds_for_its_identity_only_and_under_the_real_master_only(), a_sign_result_becomes_the_bundle_viso_stores(), binding_payload(), call(), cbor(), fixture(), handle(), key32() (+16 more)

### Community 14 - "signOut"
Cohesion: 0.13
Nodes (35): an_author_s_newer_entry_replaces_the_older_under_one_key(), check(), de(), delta(), Entry, entry_msg(), err(), LogState (+27 more)

### Community 15 - "delta.ts"
Cohesion: 0.22
Nodes (8): EQUAL, FeedSort, isFuture(), postScore(), sortPosts(), Weights, WINDOW_MS, now

### Community 16 - "feature_request.md"
Cohesion: 0.08
Nodes (26): CURRENT, LEGACY, limiter(), asBytes(), bgGate, codes, contractCode(), ContractId (+18 more)

### Community 18 - "SafeStorage"
Cohesion: 0.17
Nodes (18): delta_only_to_a_peer_without_it(), only_the_named_bytes_are_valid(), params(), RadicaMediaContract, ContractError, ContractInterface, Parameters, RelatedContracts (+10 more)

### Community 19 - ".process"
Cohesion: 0.14
Nodes (20): Identity, key_of(), kv_name(), parse_sk(), Req, Option, Parameters, Result (+12 more)

### Community 20 - "compilerOptions"
Cohesion: 0.07
Nodes (61): burnAtOf(), checksHtml(), ConversationDeps, createConversationState(), Delivery, deliveryOf(), dmPeerOf(), KeyValue (+53 more)

### Community 21 - "caption.ts"
Cohesion: 0.12
Nodes (19): Activity, Chrome, Client, MainActivity, Node, Bundle, FileChooserParams, FrameLayout (+11 more)

### Community 22 - "attachCardListeners"
Cohesion: 0.05
Nodes (64): enc, issueReceipt(), judgeClaim(), logEntryMessage(), SCOPE_FIELD, signEntry(), CFG, donor (+56 more)

### Community 23 - "feedsize.ts"
Cohesion: 0.10
Nodes (39): applyMaskBadWords(), cacheCard(), deleteCommentFromCard(), deletePostFromCard(), findFeedScrollAnchor(), globalRemove(), initCardListeners(), modDeleteFromCard() (+31 more)

### Community 24 - "Contributor Covenant Code of Conduct"
Cohesion: 0.20
Nodes (19): keepChatMediaUrl(), resolveChatMediaUrl(), sealChatMedia(), sealChatMediaChunked(), sealWithKey(), sendChatAttachment(), uploadChatMedia(), mediaHashOf() (+11 more)

### Community 25 - "versionCheck.ts"
Cohesion: 0.22
Nodes (17): check2Of(), createIdentityBackupJson(), decodeRecoveryKey(), deriveMailAddress(), deriveMailIdentity(), deriveMailSeeds(), downloadIdentityBackup(), enc (+9 more)

### Community 26 - "avatar.ts"
Cohesion: 0.06
Nodes (38): yieldToMain(), applyFullWidth(), applyTheme(), bootStep(), checkUrlInviteHash(), checkUrlPostHash(), closeRailPages(), draftKey() (+30 more)

### Community 28 - "icons.ts"
Cohesion: 0.06
Nodes (60): bitsOf(), cat(), challengeBytes(), checkProof(), decodeProof(), enc, grind(), makeProof() (+52 more)

### Community 29 - "showProfilePage"
Cohesion: 0.06
Nodes (67): a_command_that_hangs_is_killed_at_the_deadline(), a_leftover_user_unit_beside_a_system_unit_gets_a_way_out(), a_process_left_holding_stderr_does_not_hold_up_run(), a_registered_service_is_just_started(), a_registered_service_that_fails_is_reported_never_registered_again(), a_stopped_system_service_is_left_to_the_administrator(), a_suggested_command_survives_any_path(), Answer (+59 more)

### Community 30 - "freenet.ts"
Cohesion: 0.07
Nodes (28): isHeavy(), all, cfg, cfgPath, copy(), dist, fingerprint, hash (+20 more)

### Community 31 - "updates.ts"
Cohesion: 0.07
Nodes (65): renderChatText(), freenet, checked, checkGhostkey(), ghostkey(), REFUSALS, requestGhostkeyProof(), verifiedGhostkeys() (+57 more)

### Community 32 - "CHANGELOG.md"
Cohesion: 0.17
Nodes (16): FEED_TARGET, feedBytes(), formatBytes(), oldestToFree(), postBytes(), reconcile(), reconcileItems(), renderFeedSize() (+8 more)

### Community 34 - "NotificationItem"
Cohesion: 0.16
Nodes (22): api(), asBytes(), call(), chain, dec, delegateMessage(), enc, extractPayload() (+14 more)

### Community 35 - "secretChat.ts"
Cohesion: 0.13
Nodes (18): closeGifPicker(), CURATED_GIFS, GifItem, openGifPicker(), heavyUrl(), heavyUrlFor(), analyzeImageFile(), analyzeTextContent() (+10 more)

### Community 36 - "nodeOrigin"
Cohesion: 0.09
Nodes (35): chunk(), coverUrls, Fetch, fillFreetunes(), fillFreetunesProfile(), fmtTime(), freetunesAllReleaseRefs(), freetunesArtistHref() (+27 more)

### Community 37 - "types.ts"
Cohesion: 0.14
Nodes (32): closeModal(), hasOpenModal(), installModalDismiss(), openModals(), ActiveView, clearSelectedPostCard(), closeOtherPages(), findNextCardIndex() (+24 more)

### Community 39 - "createMessengerChat"
Cohesion: 0.11
Nodes (37): bodies(), CHAT_REACTIONS, compactLog(), dedupeChat(), directoryWeights(), DM_ENTRY_TYPES, enc, entryJson (+29 more)

### Community 40 - "Reader"
Cohesion: 0.34
Nodes (11): cleanExcerpt(), decodeB64u(), encodeB64u(), OrtoBlog, ortoCard(), ortoInCaption(), OrtoPost, ortoPostHref() (+3 more)

### Community 42 - "delegate.ts"
Cohesion: 0.23
Nodes (3): RiverNet, RiverRooms, vkOf()

### Community 43 - "messengerLogic.ts"
Cohesion: 0.19
Nodes (17): decodeCbor(), deltaInCaption(), DeltaPage, deltaPrefixOf(), DeltaSite, DeltaUri, parseDeltaUri(), parseSite() (+9 more)

### Community 44 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+4 more)

### Community 45 - "icons.ts"
Cohesion: 0.10
Nodes (33): alertUnread(), amGlobalMod(), amVouched(), checkCommunitiesOnNetwork(), formatTimeAgo(), getWebOfTrust(), ghostkeyKey(), hiddenCommunityIds() (+25 more)

### Community 46 - "handleJoinFromInviteUrl"
Cohesion: 0.22
Nodes (4): encryptDirectMessage(), encryptWithSymmetricKey(), formatChatMessageSignatureMessage(), room()

### Community 47 - "rootsfx.ts"
Cohesion: 0.15
Nodes (14): checkMilestones(), networkCounts(), renderMilestones(), Counts, countsOf(), FIRST, Metric, METRIC_LABELS (+6 more)

### Community 48 - "caption.test.ts"
Cohesion: 0.22
Nodes (21): getIdentity(), takeHandedKey(), appPath(), canonicalBase(), certShowsHost(), connectMessage(), createLocalIdentity(), enc (+13 more)

### Community 49 - "createMessengerChat"
Cohesion: 0.12
Nodes (16): devDependencies, chai, ethers, hardhat, @nomicfoundation/hardhat-chai-matchers, @nomicfoundation/hardhat-ethers, @nomicfoundation/hardhat-verify, @openzeppelin/contracts (+8 more)

### Community 50 - "createMessengerChat"
Cohesion: 0.07
Nodes (52): ASOCIAL_RECORDS_CODE_BYTES, asocialCard(), AsocialData, asocialLink(), asocialOwnStoreKey(), asocialOwnStoreParams(), asocialPersonHref(), asocialPersonOf() (+44 more)

### Community 54 - "avatar.ts"
Cohesion: 0.40
Nodes (4): avatarCache, buildDefaultAvatar(), compressAvatarFile(), svgToBase64Uri()

### Community 55 - "parseChatMedia"
Cohesion: 0.09
Nodes (41): compressPostImageFile(), analyzeAudioBlob(), AUDIO_EXT, blobCache, cacheKeyOf(), chatMediaCardsHtml(), ChatMediaItem, ChatMediaKind (+33 more)

### Community 56 - "secretChat.ts"
Cohesion: 0.10
Nodes (26): PreparedChatMedia, ConversationState, ICON_PATHS, IconName, ChatLayoutMode, chatTranslations, CLOCK_FMT, formatClock() (+18 more)

### Community 57 - "Radica — domain language"
Cohesion: 0.33
Nodes (5): Chat, Decisions, Device storage, Radica — domain language, Supporters

### Community 58 - "feedlight.ts"
Cohesion: 0.15
Nodes (10): giveUpWorker(), lightFeed, lightFeedAsync(), lightFeedOf(), mergeFeedText(), parseInline(), waiting, overlayFeed() (+2 more)

### Community 59 - "rootsfx.ts"
Cohesion: 0.22
Nodes (16): countLeadingZeroBits(), createPoWChallenge(), enc, failPowWorker(), ID_PREFIX, POST_POW_SINCE, postHasPow(), postPowCache (+8 more)

### Community 60 - "splitNotifs"
Cohesion: 0.09
Nodes (54): a_failed_rewrite_of_a_record_leaves_it_whole(), a_node_answering_ends_the_wait_and_the_directory_goes_when_the_installer_exits(), an_installer_left_open_past_the_deadline_is_reported(), applications_dir(), binary_install_path(), copy_app_from(), copy_tree(), extract_freenet() (+46 more)

### Community 61 - "durable.ts"
Cohesion: 0.20
Nodes (4): decodeBase64State(), encodeBase64State(), SafeStorage, utf8Enc

### Community 62 - "translate.ts"
Cohesion: 0.16
Nodes (18): files(), before, draftTranslateHtml(), initDraftTranslate(), translateKeeping(), setReaderLang(), availableLangs(), cachedAvail (+10 more)

### Community 63 - "fillChatMedia"
Cohesion: 0.19
Nodes (4): decryptDirectMessage(), getSharedKey(), readEncPubs(), ChatMessage

### Community 64 - "package.json"
Cohesion: 0.15
Nodes (12): dependencies, @semaphore-protocol/core, viem, devDependencies, vite, name, private, scripts (+4 more)

### Community 66 - "package.json"
Cohesion: 0.17
Nodes (11): dependencies, @freenetorg/freenet-stdlib, @noble/ed25519, @noble/hashes, viem, name, private, scripts (+3 more)

### Community 67 - "pow.ts"
Cohesion: 0.19
Nodes (7): createDurable(), durable, DURABLE_PREFIXES, DurableNode, DurableStore, isDurable(), packageKey()

### Community 68 - "verify.js"
Cohesion: 0.24
Nodes (6): ADDRESSES, DEPLOYED, { ethers, network }, { TREASURY, ADDRESSES }, hre, { TREASURY, ADDRESSES, DEPLOYED }

### Community 69 - ".notifyListeners"
Cohesion: 0.15
Nodes (6): seedReadMark(), encryptRoomKeyForPeer(), RiverJoin, roomOwnerSk(), PrivateRoom, UserIdentity

### Community 70 - "BatchTranslator"
Cohesion: 0.20
Nodes (3): BatchTranslator, @browsermt/bergamot-translator/translator.js, TranslatorBacking

### Community 72 - "resolve"
Cohesion: 0.22
Nodes (4): unprovenComment(), PostReactionEvaluation, TrustBadgeInfo, WebOfTrust

### Community 73 - "Radica donation contract"
Cohesion: 0.33
Nodes (5): Before Base mainnet, Deploy, Deployments, Radica donation contract, Test

### Community 74 - "delegate.ts"
Cohesion: 0.27
Nodes (9): CommunitySort, compare(), findCommunities(), FinderInput, FinderResult, slugOf(), all, comm() (+1 more)

### Community 75 - "Radica attester"
Cohesion: 0.33
Nodes (5): AI moderation helper, CapRover, Radica attester, Run, Test

### Community 76 - "RadicaSupport.test.js"
Cohesion: 0.40
Nodes (3): { ethers }, { expect }, Tier

### Community 77 - "hardhat.config.js"
Cohesion: 0.50
Nodes (3): path, { subtask }, { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD }

### Community 78 - "fetch-translation-models.mjs"
Cohesion: 0.50
Nodes (3): out, pairs, registry

### Community 80 - "versionCheck.ts"
Cohesion: 0.42
Nodes (9): updateNotifsSoundBtn(), getAudioContext(), isSoundEnabled(), playBufferPop(), playPopSound(), playSynthesizedPop(), preloadPopSound(), setSoundEnabled() (+1 more)

### Community 85 - "types.ts"
Cohesion: 0.22
Nodes (8): PoWProof, mergeRoomBackup(), AI_REPORTERS, Comment, Like, PostCategory, RADICA_DEFAULT_MODS, RoomState

### Community 89 - "maybeShowWelcome"
Cohesion: 0.29
Nodes (7): finishWelcome(), hasDefaultName(), isJoined(), maybeShowWelcome(), renderWelcomeSuggestions(), welcomeDoneKey(), welcomeStep()

### Community 91 - "🚨 Mandatory Rule: Features, Updates Tab & Documentation"
Cohesion: 0.33
Nodes (5): 1. In-App Updates Tab (`ui/src/updates.ts`), 2. Repository Documentation, 🚨 Mandatory Rule: Features, Updates Tab & Documentation, Radica — Agent Guidelines & Repository Rules, 🧪 Testing & Verification Requirements

### Community 92 - "resolve"
Cohesion: 0.12
Nodes (33): what_answers_on_the_port_decides_the_state(), a_real_signed_release_manifest_verifies(), an_asset_must_match_its_checksum_and_be_listed(), asset_name(), asset_name_for(), check_manifest_version(), Checksums, downloads_report_progress_and_stop_at_their_limits() (+25 more)

### Community 97 - "fh.ts"
Cohesion: 0.18
Nodes (21): cleanHash(), dec, enc, fhCard(), fhLink(), FhListData, fhListKey(), fhPersonaHex() (+13 more)

### Community 98 - "riverPointer.ts"
Cohesion: 0.12
Nodes (24): Exports, loadJsonWasm(), loadRiver(), river(), RiverCall, Anchor, anchorOf(), instanceOf() (+16 more)

### Community 107 - "roots.ts"
Cohesion: 0.60
Nodes (3): cut(), Root, rootsSvg()

### Community 109 - "media.ts"
Cohesion: 0.29
Nodes (8): dataUrlBytes(), inflight, keepMedia(), mediaRef(), mediaUrl(), urls, bytes, hash

## Knowledge Gaps
- **670 isolated node(s):** `name`, `private`, `type`, `start`, `test` (+665 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `FreenetClient` connect `moderation.ts` to `RiverRooms`, `whoiam.ts`, `compilerOptions`, `feature_request.md`, `compilerOptions`, `Contributor Covenant Code of Conduct`, `icons.ts`, `NotificationItem`, `nodeOrigin`, `createMessengerChat`, `Reader`, `versionCheck.ts`, `delegate.ts`, `messengerLogic.ts`, `handleJoinFromInviteUrl`, `createMessengerChat`, `feedlight.ts`, `fillChatMedia`, `.notifyListeners`, `fh.ts`, `media.ts`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `Cert` connect `lib.rs` to `.notifyListeners`, `createMessengerChat`, `moderation.ts`, `signOut`, `caption.test.ts`, `types.ts`, `feedlight.ts`, `updates.ts`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `freshPosts()` connect `attachCardListeners` to `delegate.ts`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _670 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0058997050147492625 - nodes in this community are weakly interconnected._
- **Should `lib.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.09208860759493671 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._