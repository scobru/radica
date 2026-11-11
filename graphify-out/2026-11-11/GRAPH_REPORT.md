# Graph Report - radica  (2026-11-11)

## Corpus Check
- 248 files · ~746,042 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2882 nodes · 7701 edges · 104 communities (92 shown, 12 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 132 edges (avg confidence: 0.71)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `56ef3393`
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
- [[_COMMUNITY_ChatMessage|ChatMessage]]
- [[_COMMUNITY_rootsfx.ts|rootsfx.ts]]
- [[_COMMUNITY_splitNotifs|splitNotifs]]
- [[_COMMUNITY_durable.ts|durable.ts]]
- [[_COMMUNITY_translate.ts|translate.ts]]
- [[_COMMUNITY_fillChatMedia|fillChatMedia]]
- [[_COMMUNITY_package.json|package.json]]
- [[_COMMUNITY_moderation.spec.ts|moderation.spec.ts]]
- [[_COMMUNITY_package.json|package.json]]
- [[_COMMUNITY_conversationState.ts|conversationState.ts]]
- [[_COMMUNITY_verify.js|verify.js]]
- [[_COMMUNITY_secretChat.ts|secretChat.ts]]
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
- [[_COMMUNITY_mentionPicker.ts|mentionPicker.ts]]
- [[_COMMUNITY_playPopSound|playPopSound]]
- [[_COMMUNITY_types.ts|types.ts]]
- [[_COMMUNITY_ghostkey.ts|ghostkey.ts]]
- [[_COMMUNITY_fh.ts|fh.ts]]
- [[_COMMUNITY_riverPointer.ts|riverPointer.ts]]
- [[_COMMUNITY_limit.ts|limit.ts]]
- [[_COMMUNITY_WORMHOLE_PATH|WORMHOLE_PATH]]
- [[_COMMUNITY_wormholeHref|wormholeHref]]
- [[_COMMUNITY_roots.ts|roots.ts]]
- [[_COMMUNITY_media.ts|media.ts]]

## God Nodes (most connected - your core abstractions)
1. `FreenetClient` - 246 edges
2. `renderTimeline()` - 90 edges
3. `UserIdentity` - 79 edges
4. `escapeHtml()` - 67 edges
5. `openUserProfile()` - 46 edges
6. `initCardListeners()` - 40 edges
7. `PrivateRoom` - 39 edges
8. `RiverRooms` - 36 edges
9. `getAuthorDisplayName()` - 35 edges
10. `SafeStorage` - 35 edges

## Surprising Connections (you probably didn't know these)
- `connect()` --indirect_call--> `api()`  [INFERRED]
  attester/src/main.js → ui/src/delegate.ts
- `what_answers_on_the_port_decides_the_state()` --calls--> `Version`  [INFERRED]
  apps/desktop/src/host.rs → apps/desktop/src/release.rs
- `Entry` --references--> `Cert`  [EXTRACTED]
  log-contract/src/lib.rs → ui/src/whoiam.ts
- `fillFreeHole()` --indirect_call--> `code()`  [INFERRED]
  ui/src/wormhole.ts → ui/src/freepolls.ts
- `formatJoinNotice()` --indirect_call--> `pk()`  [INFERRED]
  ui/src/messengerLogic.ts → ui/tests/linfa.test.ts

## Import Cycles
- 3-file cycle: `ui/src/crypto.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/crypto.ts`
- 4-file cycle: `ui/src/crypto.ts -> ui/src/types.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/crypto.ts`
- 4-file cycle: `ui/src/crypto.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/riverPointer.ts -> ui/src/crypto.ts`
- 5-file cycle: `ui/src/crypto.ts -> ui/src/types.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/riverPointer.ts -> ui/src/crypto.ts`

## Communities (104 total, 12 thin omitted)

### Community 0 - "main.ts"
Cohesion: 0.01
Nodes (373): accentSelect, activeFilterBanner, activeFilterTag, addModForm, addModPubkeyInput, alerted, allCommunities, allPrivateRooms (+365 more)

### Community 1 - "RiverRooms"
Cohesion: 0.17
Nodes (25): decryptDirectMessage(), decryptRoomKeyFromPeer(), decryptWithSymmetricKey(), enc, encryptDirectMessage(), encryptRoomKeyForPeer(), formatCommentSignatureMessage(), formatCommunitySignatureMessage() (+17 more)

### Community 2 - "lib.rs"
Cohesion: 0.09
Nodes (72): BTreeSet, main(), SigningKey, state(), an_author_takes_back_a_comment_with_an_empty_version(), check_comment(), check_post(), Comment (+64 more)

### Community 3 - "init"
Cohesion: 0.15
Nodes (26): FreenetMailIdentity, buildReplyDraft(), deleteMailMessage(), filterMailMessages(), formatMailDate(), getMailStorageKey(), getUnreadMailCount(), isValidMailAddress() (+18 more)

### Community 4 - "scripts"
Cohesion: 0.08
Nodes (23): author, description, keywords, license, name, scripts, app, build (+15 more)

### Community 5 - "whoiam.ts"
Cohesion: 0.11
Nodes (28): dec, enc, fillFreenames(), freenameInCaption(), freenamesCard(), FreenameUri, getResolvedFreename(), inflightResolutions (+20 more)

### Community 6 - "🚀 Getting Started"
Cohesion: 0.05
Nodes (36): 10. ✉️ Radica Mail & Freenet Mail Interoperability (Post-Quantum), 11. 🌱 Linfa: a Plant on Every Profile, 12. 🔁 Reposts Without a Contract Change, 1. Installation, 1. 🛡️ On-Device AI Moderation (Desert Ant Labs), 2. 🔒 Automated PII Redaction & Text Censorship, 2. Development Mode, 3. Contract Compilation & Testing (+28 more)

### Community 7 - "lib.rs"
Cohesion: 0.09
Nodes (62): AuthorizedEncryptedSecretForMember, AuthorizedMember, ChatRoomParametersV1, ChatRoomStateV1, ChatRoomStateV1Delta, MessageId, a_secret_blob_that_does_not_decrypt_is_skipped(), apply() (+54 more)

### Community 8 - "dependencies"
Cohesion: 0.07
Nodes (28): dependencies, @browsermt/bergamot-translator, @desert-ant-labs/moderator, @fontsource-variable/fraunces, @fontsource-variable/inter, freenet-blob, @freenetorg/freenet-stdlib, @litertjs/core (+20 more)

### Community 11 - "SafeStorage"
Cohesion: 0.07
Nodes (78): fillAsocial(), generateDefaultAvatar(), plainMentions(), addReadKeys(), fillDelta(), fillFh(), escapeHtml(), safeUrl() (+70 more)

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
Cohesion: 0.09
Nodes (26): CURRENT, LEGACY, mediaHashOf(), asBytes(), bgGate, codes, contractCode(), ContractId (+18 more)

### Community 18 - "SafeStorage"
Cohesion: 0.17
Nodes (18): delta_only_to_a_peer_without_it(), only_the_named_bytes_are_valid(), params(), RadicaMediaContract, ContractError, ContractInterface, Parameters, RelatedContracts (+10 more)

### Community 19 - ".process"
Cohesion: 0.14
Nodes (20): Identity, key_of(), kv_name(), parse_sk(), Req, Option, Parameters, Result (+12 more)

### Community 20 - "compilerOptions"
Cohesion: 0.20
Nodes (20): cancelMessageBurn(), encryptSecretMessage(), getActiveSecretChatTTL(), getSecretRoomId(), addSecretChatPeer(), burnSecretMessage(), editSecretMessage(), getItem() (+12 more)

### Community 21 - "caption.ts"
Cohesion: 0.12
Nodes (19): Activity, Chrome, Client, MainActivity, Node, Bundle, FileChooserParams, FrameLayout (+11 more)

### Community 22 - "attachCardListeners"
Cohesion: 0.05
Nodes (64): enc, issueReceipt(), judgeClaim(), logEntryMessage(), SCOPE_FIELD, signEntry(), CFG, donor (+56 more)

### Community 23 - "feedsize.ts"
Cohesion: 0.10
Nodes (29): Gain, gains(), Linfa, linfaOf(), POINTS, stageOf(), STAGES, Trust (+21 more)

### Community 24 - "Contributor Covenant Code of Conduct"
Cohesion: 0.18
Nodes (21): cacheKeyOf(), ChatMediaItem, ChunkProgress, keepChatMediaUrl(), resolveChatMediaUrl(), sealChatMedia(), sealChatMediaChunked(), sealWithKey() (+13 more)

### Community 25 - "versionCheck.ts"
Cohesion: 0.16
Nodes (21): CHAT_TOKEN_RE, chatText(), escMd(), extractCommentMedia(), isSafeUrl(), LINK_RE, linkify(), md() (+13 more)

### Community 26 - "avatar.ts"
Cohesion: 0.12
Nodes (17): checkUrlInviteHash(), checkUrlPostHash(), handleFreenameLink(), handleJoinFromInviteUrl(), INVITE_PARAMS, inviteFromParams(), markSeen(), openPostLink() (+9 more)

### Community 28 - "icons.ts"
Cohesion: 0.06
Nodes (60): bitsOf(), cat(), challengeBytes(), checkProof(), decodeProof(), enc, grind(), makeProof() (+52 more)

### Community 29 - "showProfilePage"
Cohesion: 0.06
Nodes (68): a_command_that_hangs_is_killed_at_the_deadline(), a_leftover_user_unit_beside_a_system_unit_gets_a_way_out(), a_process_left_holding_stderr_does_not_hold_up_run(), a_registered_service_is_just_started(), a_registered_service_that_fails_is_reported_never_registered_again(), a_stopped_system_service_is_left_to_the_administrator(), a_suggested_command_survives_any_path(), Answer (+60 more)

### Community 30 - "freenet.ts"
Cohesion: 0.08
Nodes (21): isHeavy(), all, cfg, cfgPath, copy(), dist, files(), fingerprint (+13 more)

### Community 31 - "updates.ts"
Cohesion: 0.15
Nodes (36): amVouched(), ghostkeyKey(), refreshSupporters(), clearStoredReceipt(), dec, enc, foldSupporters(), fromBase64() (+28 more)

### Community 32 - "CHANGELOG.md"
Cohesion: 0.17
Nodes (16): FEED_TARGET, feedBytes(), oldestToFree(), postBytes(), reconcileItems(), refreshVisibleReactions(), reloadPosts(), renderFeedSize() (+8 more)

### Community 34 - "NotificationItem"
Cohesion: 0.14
Nodes (26): renderChatText(), freenet, foldGreenhouse(), greenhouseTokens(), parse(), Seed, SEED_DAYS, SEED_STATUSES (+18 more)

### Community 35 - "secretChat.ts"
Cohesion: 0.22
Nodes (11): analyzeImageFile(), analyzeTextContent(), BAD_WORDS, BAD_WORDS_RE, censorTextAndPII(), getModerator(), ImageModerationResult, maskProfanity() (+3 more)

### Community 36 - "nodeOrigin"
Cohesion: 0.09
Nodes (34): chunk(), coverUrls, Fetch, fillFreetunes(), fillFreetunesProfile(), fmtTime(), freetunesAllReleaseRefs(), freetunesArtistHref() (+26 more)

### Community 37 - "types.ts"
Cohesion: 0.14
Nodes (32): closeModal(), hasOpenModal(), installModalDismiss(), openModals(), ActiveView, clearSelectedPostCard(), closeOtherPages(), findNextCardIndex() (+24 more)

### Community 39 - "createMessengerChat"
Cohesion: 0.11
Nodes (36): bodies(), CHAT_REACTIONS, compactLog(), directoryWeights(), DM_ENTRY_TYPES, enc, entryJson, foldBlocklist() (+28 more)

### Community 40 - "Reader"
Cohesion: 0.09
Nodes (35): ECOSYSTEM, EcosystemApp, ecosystemCard(), ecosystemFooter(), hrefOf(), link(), FREETREE_URL_RE, freetreeCard() (+27 more)

### Community 41 - "versionCheck.ts"
Cohesion: 0.33
Nodes (6): closeGifPicker(), CURATED_GIFS, GifItem, openGifPicker(), heavyUrl(), heavyUrlFor()

### Community 42 - "delegate.ts"
Cohesion: 0.22
Nodes (4): encryptWithSymmetricKey(), formatChatMessageSignatureMessage(), RiverJoin, room()

### Community 43 - "messengerLogic.ts"
Cohesion: 0.20
Nodes (4): RiverNet, RiverRooms, vkOf(), device()

### Community 44 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+4 more)

### Community 45 - "icons.ts"
Cohesion: 0.09
Nodes (41): alertUnread(), amGlobalMod(), checkCommunitiesOnNetwork(), closeRailPages(), deleteCommentFromCard(), deletePostFromCard(), globalRemove(), hiddenCommunityIds() (+33 more)

### Community 46 - "handleJoinFromInviteUrl"
Cohesion: 0.17
Nodes (3): MessengerDeps, PrivateRoom, UserIdentity

### Community 47 - "rootsfx.ts"
Cohesion: 0.10
Nodes (24): checkMilestones(), networkCounts(), paintReactionsBy(), reactionsByHtml(), renderMilestones(), toggleDislikeFromCard(), toggleLikeFromCard(), Counts (+16 more)

### Community 48 - "caption.test.ts"
Cohesion: 0.14
Nodes (5): mentionsIn(), postIdWithPow(), PoWProof, Post, ProfileInfo

### Community 49 - "createMessengerChat"
Cohesion: 0.12
Nodes (16): devDependencies, chai, ethers, hardhat, @nomicfoundation/hardhat-chai-matchers, @nomicfoundation/hardhat-ethers, @nomicfoundation/hardhat-verify, @openzeppelin/contracts (+8 more)

### Community 50 - "createMessengerChat"
Cohesion: 0.09
Nodes (44): ASOCIAL_RECORDS_CODE_BYTES, asocialCard(), AsocialData, asocialLink(), asocialOwnStoreKey(), asocialOwnStoreParams(), asocialPersonHref(), asocialPersonOf() (+36 more)

### Community 54 - "avatar.ts"
Cohesion: 0.17
Nodes (11): avatarCache, buildDefaultAvatar(), compressAvatarFile(), compressPostImageFile(), svgToBase64Uri(), measureImageDimensions(), prepareChatDocFile(), prepareChatImageFile() (+3 more)

### Community 55 - "parseChatMedia"
Cohesion: 0.10
Nodes (39): TOKEN_RE, analyzeAudioBlob(), AUDIO_EXT, blobCache, chatMediaCardsHtml(), ChatMediaKind, dataUriToBytesAndMime(), decodeWaveformHex() (+31 more)

### Community 56 - "secretChat.ts"
Cohesion: 0.09
Nodes (27): PreparedChatMedia, ConversationState, ICON_PATHS, IconName, ChatLayoutMode, chatTranslations, CLOCK_FMT, formatClock() (+19 more)

### Community 57 - "Radica — domain language"
Cohesion: 0.22
Nodes (8): Chat, Decisions, Device storage, Feed, Linfa, Mail, Radica — domain language, Supporters

### Community 58 - "ChatMessage"
Cohesion: 0.15
Nodes (3): readEncPubs(), MessengerActiveState, ChatMessage

### Community 59 - "rootsfx.ts"
Cohesion: 0.11
Nodes (20): unprovenComment(), countLeadingZeroBits(), createPoWChallenge(), enc, failPowWorker(), ID_PREFIX, POST_POW_SINCE, postHasPow() (+12 more)

### Community 60 - "splitNotifs"
Cohesion: 0.09
Nodes (54): a_failed_rewrite_of_a_record_leaves_it_whole(), a_node_answering_ends_the_wait_and_the_directory_goes_when_the_installer_exits(), an_installer_left_open_past_the_deadline_is_reported(), applications_dir(), binary_install_path(), copy_app_from(), copy_tree(), extract_freenet() (+46 more)

### Community 61 - "durable.ts"
Cohesion: 0.20
Nodes (4): decodeBase64State(), encodeBase64State(), SafeStorage, utf8Enc

### Community 62 - "translate.ts"
Cohesion: 0.17
Nodes (17): before, draftTranslateHtml(), initDraftTranslate(), translateKeeping(), setReaderLang(), availableLangs(), cachedAvail, detectLang() (+9 more)

### Community 63 - "fillChatMedia"
Cohesion: 0.19
Nodes (18): decodeCbor(), deltaCard(), deltaInCaption(), DeltaPage, deltaPrefixOf(), DeltaSite, DeltaUri, pageHref() (+10 more)

### Community 64 - "package.json"
Cohesion: 0.15
Nodes (12): dependencies, @semaphore-protocol/core, viem, devDependencies, vite, name, private, scripts (+4 more)

### Community 66 - "package.json"
Cohesion: 0.17
Nodes (11): dependencies, @freenetorg/freenet-stdlib, @noble/ed25519, @noble/hashes, viem, name, private, scripts (+3 more)

### Community 67 - "conversationState.ts"
Cohesion: 0.20
Nodes (19): burnAtOf(), checksHtml(), ConversationDeps, createConversationState(), Delivery, deliveryOf(), dmPeerOf(), KeyValue (+11 more)

### Community 68 - "verify.js"
Cohesion: 0.24
Nodes (6): ADDRESSES, DEPLOYED, { ethers, network }, { TREASURY, ADDRESSES }, hre, { TREASURY, ADDRESSES, DEPLOYED }

### Community 69 - "secretChat.ts"
Cohesion: 0.20
Nodes (19): activeTimers, chainStepsCache, clearSecretChatSession(), dec, decryptSecretMessage(), enc, formatTtlLabel(), generateEphemeralKeyPair() (+11 more)

### Community 70 - "BatchTranslator"
Cohesion: 0.20
Nodes (3): BatchTranslator, @browsermt/bergamot-translator/translator.js, TranslatorBacking

### Community 72 - "resolve"
Cohesion: 0.19
Nodes (7): createDurable(), durable, DURABLE_PREFIXES, DurableNode, DurableStore, isDurable(), packageKey()

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
Cohesion: 0.12
Nodes (3): UnifiedConversation, setActiveSecretChatTTL(), Community

### Community 85 - "types.ts"
Cohesion: 0.18
Nodes (10): giveUpWorker(), lightFeed, lightFeedAsync(), lightFeedOf(), mergeFeedText(), parseInline(), waiting, overlayFeed() (+2 more)

### Community 89 - "maybeShowWelcome"
Cohesion: 0.12
Nodes (20): getIdentity(), MailMessage, applyFullWidth(), applyTheme(), bootStep(), draftKey(), finishWelcome(), hasDefaultName() (+12 more)

### Community 91 - "🚨 Mandatory Rule: Features, Updates Tab & Documentation"
Cohesion: 0.33
Nodes (5): 1. In-App Updates Tab (`ui/src/updates.ts`), 2. Repository Documentation, 🚨 Mandatory Rule: Features, Updates Tab & Documentation, Radica — Agent Guidelines & Repository Rules, 🧪 Testing & Verification Requirements

### Community 92 - "resolve"
Cohesion: 0.13
Nodes (32): a_real_signed_release_manifest_verifies(), an_asset_must_match_its_checksum_and_be_listed(), asset_name(), asset_name_for(), check_manifest_version(), Checksums, downloads_report_progress_and_stop_at_their_limits(), every_platform_maps_to_an_asset_in_the_release() (+24 more)

### Community 93 - "mentionPicker.ts"
Cohesion: 0.19
Nodes (11): linkCard(), renderPost(), setMaskBadWords(), trendingTags(), clearResolvedFreenames(), applyMaskBadWords(), attachMentionPicker(), namesToKeys() (+3 more)

### Community 94 - "playPopSound"
Cohesion: 0.42
Nodes (9): updateNotifsSoundBtn(), getAudioContext(), isSoundEnabled(), playBufferPop(), playPopSound(), playSynthesizedPop(), preloadPopSound(), setSoundEnabled() (+1 more)

### Community 95 - "types.ts"
Cohesion: 0.22
Nodes (8): mergeRoomBackup(), AI_REPORTERS, Comment, Like, PostCategory, RADICA_DEFAULT_MODS, RoomState, SecretChatSession

### Community 96 - "ghostkey.ts"
Cohesion: 0.40
Nodes (8): checked, checkGhostkey(), ghostkey(), REFUSALS, requestGhostkeyProof(), verifiedGhostkeys(), loadJsonWasm(), wasm()

### Community 97 - "fh.ts"
Cohesion: 0.06
Nodes (64): formatLogEntryMessage(), api(), asBytes(), call(), chain, dec, delegateMessage(), enc (+56 more)

### Community 98 - "riverPointer.ts"
Cohesion: 0.13
Nodes (23): Exports, loadRiver(), river(), RiverCall, Anchor, anchorOf(), Floor, instanceOf() (+15 more)

### Community 107 - "roots.ts"
Cohesion: 0.08
Nodes (49): nodeOrigin(), renderCaption(), cacheCard(), drawUviewPosts(), fillReposts(), findFeedScrollAnchor(), formatTimeAgo(), getWebOfTrust() (+41 more)

### Community 109 - "media.ts"
Cohesion: 0.22
Nodes (11): okToPublish(), submitCommentFromCard(), dataUrlBytes(), inflight, keepMedia(), mediaRef(), mediaUrl(), urls (+3 more)

## Knowledge Gaps
- **736 isolated node(s):** `name`, `private`, `type`, `start`, `test` (+731 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `FreenetClient` connect `moderation.ts` to `RiverRooms`, `whoiam.ts`, `compilerOptions`, `feature_request.md`, `compilerOptions`, `icons.ts`, `nodeOrigin`, `createMessengerChat`, `Reader`, `delegate.ts`, `messengerLogic.ts`, `handleJoinFromInviteUrl`, `caption.test.ts`, `createMessengerChat`, `ChatMessage`, `fillChatMedia`, `versionCheck.ts`, `types.ts`, `fh.ts`, `media.ts`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Why does `Cert` connect `lib.rs` to `fh.ts`, `createMessengerChat`, `signOut`, `handleJoinFromInviteUrl`, `caption.test.ts`, `types.ts`, `types.ts`, `updates.ts`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `freshPosts()` connect `attachCardListeners` to `messengerLogic.ts`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `renderTimeline()` (e.g. with `.key()` and `pk()`) actually correct?**
  _`renderTimeline()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _736 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0051947356441873855 - nodes in this community are weakly interconnected._
- **Should `lib.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.09208860759493671 - nodes in this community are weakly interconnected._