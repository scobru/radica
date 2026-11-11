# Graph Report - radica  (2026-11-11)

## Corpus Check
- 240 files · ~734,082 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2744 nodes · 7359 edges · 96 communities (85 shown, 11 thin omitted)
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
- `bergamotPlugin()` --indirect_call--> `f()`  [INFERRED]
  ui/vite.config.ts → ui/src/rootsfx.ts
- `start_binary()` --calls--> `installed_by_river()`  [INFERRED]
  apps/desktop/src/host.rs → apps/desktop/src/install.rs

## Import Cycles
- 3-file cycle: `ui/src/crypto.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/crypto.ts`
- 4-file cycle: `ui/src/crypto.ts -> ui/src/types.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/crypto.ts`
- 4-file cycle: `ui/src/crypto.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/riverPointer.ts -> ui/src/crypto.ts`
- 5-file cycle: `ui/src/crypto.ts -> ui/src/types.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/riverPointer.ts -> ui/src/crypto.ts`

## Communities (96 total, 11 thin omitted)

### Community 0 - "main.ts"
Cohesion: 0.01
Nodes (324): accentSelect, activeFilterBanner, activeFilterTag, addModForm, addModPubkeyInput, alerted, allCommunities, allPrivateRooms (+316 more)

### Community 1 - "RiverRooms"
Cohesion: 0.10
Nodes (24): decryptDirectMessage(), decryptRoomKeyFromPeer(), enc, encryptDirectMessage(), encryptRoomKeyForPeer(), formatCommentSignatureMessage(), formatCommunitySignatureMessage(), formatDeleteSignatureMessage() (+16 more)

### Community 2 - "lib.rs"
Cohesion: 0.09
Nodes (72): BTreeSet, main(), SigningKey, state(), an_author_takes_back_a_comment_with_an_empty_version(), check_comment(), check_post(), Comment (+64 more)

### Community 3 - "init"
Cohesion: 0.16
Nodes (19): plainMentions(), analyzeAudioBlob(), chatMediaCardsHtml(), defaultWaveform(), fetchChatMedia(), fileExtensionIcon(), formatBytes(), formatMediaDuration() (+11 more)

### Community 4 - "scripts"
Cohesion: 0.08
Nodes (23): author, description, keywords, license, name, scripts, app, build (+15 more)

### Community 5 - "whoiam.ts"
Cohesion: 0.11
Nodes (27): clearResolvedFreenames(), dec, enc, freenameInCaption(), freenamesCard(), FreenameUri, inflightResolutions, isKey() (+19 more)

### Community 6 - "🚀 Getting Started"
Cohesion: 0.06
Nodes (33): 1. Installation, 1. 🛡️ On-Device AI Moderation (Desert Ant Labs), 2. 🔒 Automated PII Redaction & Text Censorship, 2. Development Mode, 3. Contract Compilation & Testing, 3. ⏱️ Decentralized Anti-Flooding & Rate Limiting, 4. Build Production Web Application, 4. 🌐 Cryptographic Personas & Decentralized Storage (+25 more)

### Community 7 - "lib.rs"
Cohesion: 0.09
Nodes (62): AuthorizedEncryptedSecretForMember, AuthorizedMember, ChatRoomParametersV1, ChatRoomStateV1, ChatRoomStateV1Delta, MessageId, a_secret_blob_that_does_not_decrypt_is_skipped(), apply() (+54 more)

### Community 8 - "dependencies"
Cohesion: 0.07
Nodes (28): dependencies, @browsermt/bergamot-translator, @desert-ant-labs/moderator, @fontsource-variable/fraunces, @fontsource-variable/inter, freenet-blob, @freenetorg/freenet-stdlib, @litertjs/core (+20 more)

### Community 11 - "SafeStorage"
Cohesion: 0.10
Nodes (48): fillAsocial(), fillDelta(), fillFh(), fillFreenames(), fillFreepolls(), renderIcon(), appendChatMessageToView(), applyChatLayoutAttr() (+40 more)

### Community 12 - "resetPublishBtnState"
Cohesion: 0.22
Nodes (10): blockPublishBtnForNsfw(), blockPublishBtnForUnverified(), isPostInCooldown(), resetPublishBtnState(), revokePosterUrl(), setMediaSensitive(), setMediaVerifiedSafe(), showScanResult() (+2 more)

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
Nodes (27): CURRENT, LEGACY, limiter(), compactLog(), asBytes(), bgGate, codes, contractCode() (+19 more)

### Community 18 - "SafeStorage"
Cohesion: 0.17
Nodes (18): delta_only_to_a_peer_without_it(), only_the_named_bytes_are_valid(), params(), RadicaMediaContract, ContractError, ContractInterface, Parameters, RelatedContracts (+10 more)

### Community 19 - ".process"
Cohesion: 0.14
Nodes (20): Identity, key_of(), kv_name(), parse_sk(), Req, Option, Parameters, Result (+12 more)

### Community 20 - "compilerOptions"
Cohesion: 0.08
Nodes (56): burnAtOf(), checksHtml(), ConversationDeps, ConversationState, createConversationState(), Delivery, deliveryOf(), nextTtl() (+48 more)

### Community 21 - "caption.ts"
Cohesion: 0.12
Nodes (19): Activity, Chrome, Client, MainActivity, Node, Bundle, FileChooserParams, FrameLayout (+11 more)

### Community 22 - "attachCardListeners"
Cohesion: 0.05
Nodes (64): enc, issueReceipt(), judgeClaim(), logEntryMessage(), SCOPE_FIELD, signEntry(), CFG, donor (+56 more)

### Community 23 - "feedsize.ts"
Cohesion: 0.08
Nodes (39): freepollsCard(), freepollsLink(), applyMaskBadWords(), cacheCard(), deleteCommentFromCard(), deletePostFromCard(), findFeedScrollAnchor(), globalRemove() (+31 more)

### Community 24 - "Contributor Covenant Code of Conduct"
Cohesion: 0.17
Nodes (20): ChatMediaItem, ChunkProgress, keepChatMediaUrl(), sealChatMedia(), sealChatMediaChunked(), sealWithKey(), sendChatAttachment(), uploadChatMedia() (+12 more)

### Community 25 - "versionCheck.ts"
Cohesion: 0.22
Nodes (17): check2Of(), createIdentityBackupJson(), decodeRecoveryKey(), deriveMailAddress(), deriveMailIdentity(), deriveMailSeeds(), downloadIdentityBackup(), enc (+9 more)

### Community 26 - "avatar.ts"
Cohesion: 0.08
Nodes (27): getIdentity(), applyFullWidth(), applyTheme(), bootStep(), checkUrlInviteHash(), draftKey(), finishWelcome(), handleFreenameLink() (+19 more)

### Community 28 - "icons.ts"
Cohesion: 0.07
Nodes (56): bitsOf(), cat(), challengeBytes(), checkProof(), decodeProof(), enc, grind(), makeProof() (+48 more)

### Community 29 - "showProfilePage"
Cohesion: 0.06
Nodes (67): a_command_that_hangs_is_killed_at_the_deadline(), a_leftover_user_unit_beside_a_system_unit_gets_a_way_out(), a_process_left_holding_stderr_does_not_hold_up_run(), a_registered_service_is_just_started(), a_registered_service_that_fails_is_reported_never_registered_again(), a_stopped_system_service_is_left_to_the_administrator(), a_suggested_command_survives_any_path(), Answer (+59 more)

### Community 30 - "freenet.ts"
Cohesion: 0.17
Nodes (5): renderUpdatesList(), UPDATES, bergamotPlugin(), BUILD, FREENET_ASSETS

### Community 31 - "updates.ts"
Cohesion: 0.07
Nodes (67): freenet, checked, checkGhostkey(), ghostkey(), REFUSALS, requestGhostkeyProof(), verifiedGhostkeys(), foldGreenhouse() (+59 more)

### Community 32 - "CHANGELOG.md"
Cohesion: 0.11
Nodes (22): FEED_TARGET, feedBytes(), formatBytes(), oldestToFree(), postBytes(), yieldToMain(), checkUrlPostHash(), openProfilePost() (+14 more)

### Community 34 - "NotificationItem"
Cohesion: 0.17
Nodes (22): api(), asBytes(), call(), chain, dec, delegateMessage(), enc, extractPayload() (+14 more)

### Community 35 - "secretChat.ts"
Cohesion: 0.14
Nodes (17): closeGifPicker(), CURATED_GIFS, GifItem, openGifPicker(), heavyUrl(), heavyUrlFor(), analyzeImageFile(), analyzeTextContent() (+9 more)

### Community 36 - "nodeOrigin"
Cohesion: 0.09
Nodes (34): chunk(), coverUrls, Fetch, fillFreetunes(), fillFreetunesProfile(), fmtTime(), freetunesAllReleaseRefs(), freetunesArtistHref() (+26 more)

### Community 37 - "types.ts"
Cohesion: 0.14
Nodes (32): closeModal(), hasOpenModal(), installModalDismiss(), openModals(), ActiveView, clearSelectedPostCard(), closeOtherPages(), findNextCardIndex() (+24 more)

### Community 39 - "createMessengerChat"
Cohesion: 0.13
Nodes (37): GENESIS, bodies(), CHAT_REACTIONS, dedupeChat(), directoryWeights(), DM_ENTRY_TYPES, enc, entryJson (+29 more)

### Community 40 - "Reader"
Cohesion: 0.09
Nodes (35): ECOSYSTEM, EcosystemApp, ecosystemCard(), ecosystemFooter(), hrefOf(), link(), FREETREE_URL_RE, freetreeCard() (+27 more)

### Community 41 - "versionCheck.ts"
Cohesion: 0.11
Nodes (5): dmPeerOf(), KeyValue, localReadMarks(), setActiveSecretChatTTL(), NotificationItem

### Community 42 - "delegate.ts"
Cohesion: 0.15
Nodes (26): CHAT_TOKEN_RE, chatText(), escMd(), extractCommentMedia(), isSafeUrl(), LINK_RE, linkCard(), linkify() (+18 more)

### Community 43 - "messengerLogic.ts"
Cohesion: 0.17
Nodes (11): isHeavy(), all, cfg, cfgPath, copy(), dist, files(), fingerprint (+3 more)

### Community 44 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+4 more)

### Community 45 - "icons.ts"
Cohesion: 0.09
Nodes (37): alertUnread(), amGlobalMod(), checkCommunitiesOnNetwork(), closeRailPages(), formatTimeAgo(), getWebOfTrust(), hiddenCommunityIds(), hideCommunityForAll() (+29 more)

### Community 46 - "handleJoinFromInviteUrl"
Cohesion: 0.13
Nodes (12): decryptWithSymmetricKey(), encryptWithSymmetricKey(), formatChatMessageSignatureMessage(), getCryptoKeyFromBytes(), readEncPubs(), MessengerActiveState, MessengerDeps, vkOf() (+4 more)

### Community 47 - "rootsfx.ts"
Cohesion: 0.15
Nodes (14): checkMilestones(), networkCounts(), renderMilestones(), Counts, countsOf(), FIRST, Metric, METRIC_LABELS (+6 more)

### Community 48 - "caption.test.ts"
Cohesion: 0.24
Nodes (20): roomOwnerSk(), takeHandedKey(), appPath(), canonicalBase(), certShowsHost(), connectMessage(), createLocalIdentity(), enc (+12 more)

### Community 49 - "createMessengerChat"
Cohesion: 0.12
Nodes (16): devDependencies, chai, ethers, hardhat, @nomicfoundation/hardhat-chai-matchers, @nomicfoundation/hardhat-ethers, @nomicfoundation/hardhat-verify, @openzeppelin/contracts (+8 more)

### Community 50 - "createMessengerChat"
Cohesion: 0.14
Nodes (28): ASOCIAL_RECORDS_CODE_BYTES, asocialCard(), AsocialData, asocialLink(), asocialOwnStoreKey(), asocialOwnStoreParams(), asocialPersonHref(), asocialPersonOf() (+20 more)

### Community 54 - "avatar.ts"
Cohesion: 0.40
Nodes (4): avatarCache, buildDefaultAvatar(), compressAvatarFile(), svgToBase64Uri()

### Community 55 - "parseChatMedia"
Cohesion: 0.12
Nodes (30): compressPostImageFile(), AUDIO_EXT, blobCache, cacheKeyOf(), ChatMediaKind, dataUriToBytesAndMime(), decodeWaveformHex(), encodeChatMediaToken() (+22 more)

### Community 56 - "secretChat.ts"
Cohesion: 0.10
Nodes (24): PreparedChatMedia, ICON_PATHS, IconName, ChatLayoutMode, chatTranslations, CLOCK_FMT, formatClock(), formatDateSeparator() (+16 more)

### Community 57 - "Radica — domain language"
Cohesion: 0.33
Nodes (5): Chat, Decisions, Device storage, Radica — domain language, Supporters

### Community 58 - "feedlight.ts"
Cohesion: 0.08
Nodes (20): giveUpWorker(), lightFeed, lightFeedAsync(), lightFeedOf(), mergeFeedText(), parseInline(), waiting, overlayFeed() (+12 more)

### Community 59 - "rootsfx.ts"
Cohesion: 0.22
Nodes (16): countLeadingZeroBits(), createPoWChallenge(), enc, failPowWorker(), ID_PREFIX, POST_POW_SINCE, postHasPow(), postPowCache (+8 more)

### Community 60 - "splitNotifs"
Cohesion: 0.09
Nodes (54): a_failed_rewrite_of_a_record_leaves_it_whole(), a_node_answering_ends_the_wait_and_the_directory_goes_when_the_installer_exits(), an_installer_left_open_past_the_deadline_is_reported(), applications_dir(), binary_install_path(), copy_app_from(), copy_tree(), extract_freenet() (+46 more)

### Community 61 - "durable.ts"
Cohesion: 0.07
Nodes (29): createDurable(), durable, DURABLE_PREFIXES, DurableNode, DurableStore, isDurable(), packageKey(), reconcile() (+21 more)

### Community 62 - "translate.ts"
Cohesion: 0.17
Nodes (17): before, draftTranslateHtml(), initDraftTranslate(), translateKeeping(), setReaderLang(), availableLangs(), cachedAvail, detectLang() (+9 more)

### Community 63 - "fillChatMedia"
Cohesion: 0.52
Nodes (5): along(), Box, f(), growRoots(), rootPaths()

### Community 64 - "package.json"
Cohesion: 0.15
Nodes (12): dependencies, @semaphore-protocol/core, viem, devDependencies, vite, name, private, scripts (+4 more)

### Community 66 - "package.json"
Cohesion: 0.17
Nodes (11): dependencies, @freenetorg/freenet-stdlib, @noble/ed25519, @noble/hashes, viem, name, private, scripts (+3 more)

### Community 67 - "pow.ts"
Cohesion: 0.40
Nodes (5): attachMentionPicker(), namesToKeys(), Person, picked, withMentionKeys()

### Community 68 - "verify.js"
Cohesion: 0.24
Nodes (6): ADDRESSES, DEPLOYED, { ethers, network }, { TREASURY, ADDRESSES }, hre, { TREASURY, ADDRESSES, DEPLOYED }

### Community 69 - ".notifyListeners"
Cohesion: 0.17
Nodes (3): seedReadMark(), addReadKeys(), RiverJoin

### Community 70 - "BatchTranslator"
Cohesion: 0.20
Nodes (3): BatchTranslator, @browsermt/bergamot-translator/translator.js, TranslatorBacking

### Community 72 - "resolve"
Cohesion: 0.40
Nodes (5): pathLabel(), resolve(), short(), webLabel(), getResolvedFreename()

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
Cohesion: 0.36
Nodes (8): handleSignOut(), check(), newNotes(), shortNote(), showReloadModal(), startVersionCheck(), restart(), signOut()

### Community 92 - "resolve"
Cohesion: 0.12
Nodes (33): what_answers_on_the_port_decides_the_state(), a_real_signed_release_manifest_verifies(), an_asset_must_match_its_checksum_and_be_listed(), asset_name(), asset_name_for(), check_manifest_version(), Checksums, downloads_report_progress_and_stop_at_their_limits() (+25 more)

### Community 97 - "fh.ts"
Cohesion: 0.18
Nodes (21): cleanHash(), dec, enc, fhCard(), fhLink(), FhListData, fhListKey(), fhPersonaHex() (+13 more)

### Community 98 - "riverPointer.ts"
Cohesion: 0.06
Nodes (46): decodeCbor(), deltaCard(), deltaInCaption(), DeltaPage, deltaPrefixOf(), DeltaSite, DeltaUri, pageHref() (+38 more)

### Community 107 - "roots.ts"
Cohesion: 0.12
Nodes (36): generateDefaultAvatar(), nodeOrigin(), rows(), escapeHtml(), safeUrl(), shortenKey(), applyProfile(), getAuthorAvatarUrl() (+28 more)

### Community 109 - "media.ts"
Cohesion: 0.23
Nodes (11): mediaAttr(), postImagesHtml(), dataUrlBytes(), inflight, keepMedia(), mediaRef(), mediaUris(), mediaUrl() (+3 more)

## Knowledge Gaps
- **666 isolated node(s):** `name`, `private`, `type`, `start`, `test` (+661 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `FreenetClient` connect `moderation.ts` to `RiverRooms`, `riverPointer.ts`, `fh.ts`, `nodeOrigin`, `.notifyListeners`, `whoiam.ts`, `createMessengerChat`, `Reader`, `compilerOptions`, `versionCheck.ts`, `media.ts`, `handleJoinFromInviteUrl`, `feature_request.md`, `createMessengerChat`, `compilerOptions`, `Contributor Covenant Code of Conduct`, `feedlight.ts`, `icons.ts`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `Cert` connect `lib.rs` to `RiverRooms`, `createMessengerChat`, `signOut`, `handleJoinFromInviteUrl`, `caption.test.ts`, `feedlight.ts`, `updates.ts`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `freshPosts()` connect `attachCardListeners` to `riverPointer.ts`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _666 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.005917159763313609 - nodes in this community are weakly interconnected._
- **Should `RiverRooms` be split into smaller, more focused modules?**
  _Cohesion score 0.10128205128205128 - nodes in this community are weakly interconnected._
- **Should `lib.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.09208860759493671 - nodes in this community are weakly interconnected._