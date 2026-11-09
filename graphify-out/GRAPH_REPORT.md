# Graph Report - radica  (2026-11-09)

## Corpus Check
- 243 files · ~749,167 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3080 nodes · 8403 edges · 104 communities (92 shown, 12 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 110 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4fc707de`
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
- [[_COMMUNITY_package.json|package.json]]
- [[_COMMUNITY_moderation.spec.ts|moderation.spec.ts]]
- [[_COMMUNITY_package.json|package.json]]
- [[_COMMUNITY_pow.ts|pow.ts]]
- [[_COMMUNITY_verify.js|verify.js]]
- [[_COMMUNITY_split-freenet-dist.mjs|split-freenet-dist.mjs]]
- [[_COMMUNITY_BatchTranslator|BatchTranslator]]
- [[_COMMUNITY_Radica donation contract|Radica donation contract]]
- [[_COMMUNITY_delegate.ts|delegate.ts]]
- [[_COMMUNITY_Radica attester|Radica attester]]
- [[_COMMUNITY_RadicaSupport.test.js|RadicaSupport.test.js]]
- [[_COMMUNITY_hardhat.config.js|hardhat.config.js]]
- [[_COMMUNITY_fetch-translation-models.mjs|fetch-translation-models.mjs]]
- [[_COMMUNITY_versionCheck.ts|versionCheck.ts]]
- [[_COMMUNITY_start.sh|start.sh]]
- [[_COMMUNITY_README|README.md]]
- [[_COMMUNITY_heavyUrl|heavyUrl]]
- [[_COMMUNITY_topPosts.ts|topPosts.ts]]
- [[_COMMUNITY_communityFinder.ts|communityFinder.ts]]
- [[_COMMUNITY_freetree.ts|freetree.ts]]
- [[_COMMUNITY_wormhole.ts|wormhole.ts]]
- [[_COMMUNITY_resolve|resolve]]
- [[_COMMUNITY_Room|Room]]
- [[_COMMUNITY_Chat|Chat]]
- [[_COMMUNITY_tests.rs|tests.rs]]
- [[_COMMUNITY_view.rs|view.rs]]
- [[_COMMUNITY_fh.ts|fh.ts]]
- [[_COMMUNITY_riverPointer.ts|riverPointer.ts]]
- [[_COMMUNITY_createMessengerChat|createMessengerChat]]
- [[_COMMUNITY_example.rs|example.rs]]
- [[_COMMUNITY_Palette|Palette]]
- [[_COMMUNITY_setup.rs|setup.rs]]
- [[_COMMUNITY_FakeHost|FakeHost]]
- [[_COMMUNITY_WORMHOLE_PATH|WORMHOLE_PATH]]
- [[_COMMUNITY_wormholeHref|wormholeHref]]
- [[_COMMUNITY_roots.ts|roots.ts]]
- [[_COMMUNITY_style.rs|style.rs]]
- [[_COMMUNITY_media.ts|media.ts]]

## God Nodes (most connected - your core abstractions)
1. `FreenetClient` - 237 edges
2. `renderTimeline()` - 85 edges
3. `UserIdentity` - 78 edges
4. `Chat` - 71 edges
5. `escapeHtml()` - 62 edges
6. `Room` - 45 edges
7. `RadicaApp` - 41 edges
8. `openUserProfile()` - 39 edges
9. `initCardListeners()` - 38 edges
10. `PrivateRoom` - 38 edges

## Surprising Connections (you probably didn't know these)
- `body()` --calls--> `encrypt_with_symmetric_key()`  [INFERRED]
  river-wasm/src/lib.rs → apps/desktop/src/live.rs
- `handle()` --calls--> `decrypt_with_symmetric_key()`  [INFERRED]
  river-wasm/src/lib.rs → apps/desktop/src/live.rs
- `every_scene_renders()` --calls--> `apply()`  [INFERRED]
  apps/radica-app/src/chat/tests.rs → river-wasm/src/lib.rs
- `narrow_scenes_are_named_narrow()` --calls--> `apply()`  [INFERRED]
  apps/radica-app/src/chat/tests.rs → river-wasm/src/lib.rs
- `every_screen_has_a_scene()` --calls--> `apply()`  [INFERRED]
  apps/radica-app/src/lib.rs → river-wasm/src/lib.rs

## Import Cycles
- 2-file cycle: `apps/radica-app/src/lib.rs -> apps/radica-app/src/setup.rs -> apps/radica-app/src/lib.rs`
- 3-file cycle: `ui/src/crypto.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/crypto.ts`
- 4-file cycle: `ui/src/crypto.ts -> ui/src/types.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/crypto.ts`
- 4-file cycle: `ui/src/crypto.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/riverPointer.ts -> ui/src/crypto.ts`
- 5-file cycle: `ui/src/crypto.ts -> ui/src/types.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/riverPointer.ts -> ui/src/crypto.ts`

## Communities (104 total, 12 thin omitted)

### Community 0 - "main.ts"
Cohesion: 0.01
Nodes (317): activeFilterBanner, activeFilterTag, addModForm, addModPubkeyInput, alerted, allCommunities, allPrivateRooms, blocklistsBadge (+309 more)

### Community 1 - "RiverRooms"
Cohesion: 0.08
Nodes (39): addReadKeys(), decryptDirectMessage(), decryptRoomKeyFromPeer(), decryptWithSymmetricKey(), enc, encryptDirectMessage(), encryptRoomKeyForPeer(), encryptWithSymmetricKey() (+31 more)

### Community 2 - "lib.rs"
Cohesion: 0.09
Nodes (72): main(), SigningKey, state(), an_author_takes_back_a_comment_with_an_empty_version(), check_comment(), check_post(), Comment, comment_msg() (+64 more)

### Community 3 - "init"
Cohesion: 0.23
Nodes (14): analyzeAudioBlob(), defaultWaveform(), fetchChatMedia(), maskChatMediaTokens(), normalizePeaksToBars(), openChatMedia(), sealChatMedia(), sealChatMediaChunked() (+6 more)

### Community 4 - "scripts"
Cohesion: 0.08
Nodes (23): author, description, keywords, license, name, scripts, app, build (+15 more)

### Community 5 - "whoiam.ts"
Cohesion: 0.11
Nodes (28): dec, enc, fillFreenames(), freenameInCaption(), freenamesCard(), FreenameUri, getResolvedFreename(), inflightResolutions (+20 more)

### Community 6 - "🚀 Getting Started"
Cohesion: 0.06
Nodes (33): 1. Installation, 1. 🛡️ On-Device AI Moderation (Desert Ant Labs), 2. 🔒 Automated PII Redaction & Text Censorship, 2. Development Mode, 3. Contract Compilation & Testing, 3. ⏱️ Decentralized Anti-Flooding & Rate Limiting, 4. Build Production Web Application, 4. 🌐 Cryptographic Personas & Decentralized Storage (+25 more)

### Community 7 - "lib.rs"
Cohesion: 0.10
Nodes (60): AuthorizedEncryptedSecretForMember, AuthorizedMember, ChatRoomParametersV1, ChatRoomStateV1, ChatRoomStateV1Delta, apply(), body(), call() (+52 more)

### Community 8 - "dependencies"
Cohesion: 0.07
Nodes (27): dependencies, @browsermt/bergamot-translator, @desert-ant-labs/moderator, @fontsource-variable/fraunces, @fontsource-variable/inter, freenet-blob, @freenetorg/freenet-stdlib, @litertjs/core (+19 more)

### Community 9 - "compilerOptions"
Cohesion: 0.24
Nodes (3): MessengerActiveState, UnifiedConversation, Community

### Community 11 - "SafeStorage"
Cohesion: 0.08
Nodes (31): a_download_of_known_size_says_how_far_it_is(), a_platform_that_cannot_install_offers_no_install_button(), connect(), CountingHost, download_detail(), downloading(), each_stage_offers_the_right_actions(), install_progress() (+23 more)

### Community 12 - "resetPublishBtnState"
Cohesion: 0.25
Nodes (9): blockPublishBtnForUnverified(), isPostInCooldown(), resetPublishBtnState(), revokePosterUrl(), setMediaSensitive(), setMediaVerifiedSafe(), showScanResult(), stageVideo() (+1 more)

### Community 13 - "vite.config.ts"
Cohesion: 0.18
Nodes (24): a_proof_holds_for_its_identity_only_and_under_the_real_master_only(), a_sign_result_becomes_the_bundle_viso_stores(), binding_payload(), call(), cbor(), fixture(), handle(), key32() (+16 more)

### Community 14 - "signOut"
Cohesion: 0.13
Nodes (34): check(), de(), delta(), Entry, entry_msg(), err(), LogState, merge() (+26 more)

### Community 15 - "delta.ts"
Cohesion: 0.08
Nodes (30): fillAsocial(), setMaskBadWords(), deltaCard(), fillDelta(), pageHref(), freepollsCard(), freepollsLink(), appendChatMessageToView() (+22 more)

### Community 16 - "feature_request.md"
Cohesion: 0.08
Nodes (27): CURRENT, LEGACY, limiter(), asBytes(), bgGate, codes, contractCode(), ContractId (+19 more)

### Community 18 - "SafeStorage"
Cohesion: 0.17
Nodes (18): delta_only_to_a_peer_without_it(), only_the_named_bytes_are_valid(), params(), RadicaMediaContract, ContractError, ContractInterface, Parameters, RelatedContracts (+10 more)

### Community 19 - ".process"
Cohesion: 0.14
Nodes (20): Identity, key_of(), kv_name(), parse_sk(), Req, Option, Parameters, Result (+12 more)

### Community 20 - "compilerOptions"
Cohesion: 0.07
Nodes (59): burnAtOf(), checksHtml(), ConversationDeps, ConversationState, createConversationState(), Delivery, deliveryOf(), dmPeerOf() (+51 more)

### Community 21 - "caption.ts"
Cohesion: 0.33
Nodes (8): decode_avatar_base64_data_uri(), decode_avatar_uri(), deterministic_avatar_svg_contains_persona_silhouette(), generate_default_avatar_svg(), Option, String, Vec, urlencoding_decode()

### Community 22 - "attachCardListeners"
Cohesion: 0.07
Nodes (47): enc, issueReceipt(), judgeClaim(), logEntryMessage(), SCOPE_FIELD, signEntry(), CFG, donor (+39 more)

### Community 23 - "feedsize.ts"
Cohesion: 0.10
Nodes (33): renderComment(), safeUrl(), deleteCommentFromCard(), deletePostFromCard(), fitChatInput(), globalRemove(), initCardListeners(), mediaAttr() (+25 more)

### Community 24 - "Contributor Covenant Code of Conduct"
Cohesion: 0.18
Nodes (19): cacheKeyOf(), ChatMediaItem, ChunkProgress, fillChatMedia(), keepChatMediaUrl(), pauseAllOtherAudio(), resolveChatMediaUrl(), revokeChatMediaInText() (+11 more)

### Community 25 - "versionCheck.ts"
Cohesion: 0.60
Nodes (3): cut(), Root, rootsSvg()

### Community 26 - "avatar.ts"
Cohesion: 0.23
Nodes (20): getIdentity(), takeHandedKey(), canonicalBase(), certShowsHost(), connectMessage(), createLocalIdentity(), enc, finishSignIn() (+12 more)

### Community 28 - "icons.ts"
Cohesion: 0.06
Nodes (58): bitsOf(), cat(), challengeBytes(), checkProof(), decodeProof(), enc, grind(), makeProof() (+50 more)

### Community 29 - "showProfilePage"
Cohesion: 0.08
Nodes (52): a_command_that_hangs_is_killed_at_the_deadline(), a_leftover_user_unit_beside_a_system_unit_gets_a_way_out(), a_process_left_holding_stderr_does_not_hold_up_run(), a_registered_service_is_just_started(), a_registered_service_that_fails_is_reported_never_registered_again(), a_stopped_system_service_is_left_to_the_administrator(), a_suggested_command_survives_any_path(), Answer (+44 more)

### Community 30 - "freenet.ts"
Cohesion: 0.31
Nodes (6): canPostInRoom(), computeLogJoins(), enc, PreviewItem, shouldHydratePreview(), shouldUpdateCachedPreview()

### Community 31 - "updates.ts"
Cohesion: 0.07
Nodes (65): renderChatText(), freenet, checked, checkGhostkey(), ghostkey(), REFUSALS, requestGhostkeyProof(), verifiedGhostkeys() (+57 more)

### Community 34 - "NotificationItem"
Cohesion: 0.07
Nodes (102): act_live(), aes_gcm_decrypt(), aes_gcm_encrypt(), append_log_entry(), build_community_room(), build_dm_rooms(), build_private_rooms(), clean_confirmed_pending() (+94 more)

### Community 35 - "secretChat.ts"
Cohesion: 0.21
Nodes (12): analyzeImageFile(), analyzeTextContent(), BAD_WORDS, BAD_WORDS_RE, censorTextAndPII(), getModerator(), ImageModerationResult, maskProfanity() (+4 more)

### Community 36 - "nodeOrigin"
Cohesion: 0.09
Nodes (35): chunk(), coverUrls, Fetch, fillFreetunes(), fillFreetunesProfile(), fmtTime(), freetunesAllReleaseRefs(), freetunesArtistHref() (+27 more)

### Community 37 - "types.ts"
Cohesion: 0.14
Nodes (32): closeModal(), hasOpenModal(), installModalDismiss(), openModals(), ActiveView, clearSelectedPostCard(), closeOtherPages(), findNextCardIndex() (+24 more)

### Community 39 - "createMessengerChat"
Cohesion: 0.14
Nodes (29): bodies(), CHAT_REACTIONS, directoryWeights(), enc, entryJson, foldBlocklist(), foldChat(), foldChatHides() (+21 more)

### Community 40 - "Reader"
Cohesion: 0.40
Nodes (5): finishWelcome(), hasDefaultName(), maybeShowWelcome(), welcomeDoneKey(), welcomeStep()

### Community 42 - "delegate.ts"
Cohesion: 0.13
Nodes (26): CHAT_TOKEN_RE, chatText(), escMd(), extractCommentMedia(), isSafeUrl(), LINK_RE, linkCard(), linkify() (+18 more)

### Community 43 - "messengerLogic.ts"
Cohesion: 0.33
Nodes (9): reconcile(), reconcileItems(), isSaved(), keyOf(), load(), memo, savedId(), savedPosts() (+1 more)

### Community 44 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+4 more)

### Community 45 - "icons.ts"
Cohesion: 0.11
Nodes (33): alertUnread(), amGlobalMod(), checkCommunitiesOnNetwork(), formatTimeAgo(), getWebOfTrust(), hiddenCommunityIds(), hideCommunityForAll(), isKnownSender() (+25 more)

### Community 46 - "handleJoinFromInviteUrl"
Cohesion: 0.12
Nodes (7): seedReadMark(), MessengerDeps, RiverJoin, roomOwnerSk(), vkOf(), PrivateRoom, UserIdentity

### Community 47 - "rootsfx.ts"
Cohesion: 0.15
Nodes (14): checkMilestones(), networkCounts(), renderMilestones(), Counts, countsOf(), FIRST, Metric, METRIC_LABELS (+6 more)

### Community 49 - "createMessengerChat"
Cohesion: 0.12
Nodes (16): devDependencies, chai, ethers, hardhat, @nomicfoundation/hardhat-chai-matchers, @nomicfoundation/hardhat-ethers, @nomicfoundation/hardhat-verify, @openzeppelin/contracts (+8 more)

### Community 50 - "createMessengerChat"
Cohesion: 0.13
Nodes (30): ASOCIAL_RECORDS_CODE_BYTES, asocialCard(), AsocialData, asocialLink(), asocialOwnStoreKey(), asocialOwnStoreParams(), asocialPersonHref(), asocialPersonOf() (+22 more)

### Community 54 - "avatar.ts"
Cohesion: 0.40
Nodes (4): avatarCache, buildDefaultAvatar(), compressAvatarFile(), svgToBase64Uri()

### Community 55 - "parseChatMedia"
Cohesion: 0.17
Nodes (19): compressPostImageFile(), AUDIO_EXT, blobCache, ChatMediaKind, dataUriToBytesAndMime(), decodeWaveformHex(), encodeChatMediaToken(), encodeWaveformHex() (+11 more)

### Community 56 - "secretChat.ts"
Cohesion: 0.11
Nodes (29): plainMentions(), chatMediaCardsHtml(), fileExtensionIcon(), formatBytes(), formatMediaDuration(), normalizeAudioMime(), parseChatMedia(), prepareChatAudioFile() (+21 more)

### Community 57 - "Radica — domain language"
Cohesion: 0.33
Nodes (5): Chat, Decisions, Device storage, Radica — domain language, Supporters

### Community 58 - "feedlight.ts"
Cohesion: 0.13
Nodes (11): giveUpWorker(), lightFeed, lightFeedAsync(), lightFeedOf(), mergeFeedText(), parseInline(), waiting, overlayFeed() (+3 more)

### Community 59 - "rootsfx.ts"
Cohesion: 0.22
Nodes (16): countLeadingZeroBits(), createPoWChallenge(), enc, failPowWorker(), ID_PREFIX, POST_POW_SINCE, postHasPow(), postPowCache (+8 more)

### Community 60 - "splitNotifs"
Cohesion: 0.09
Nodes (53): a_failed_rewrite_of_a_record_leaves_it_whole(), a_node_answering_ends_the_wait_and_the_directory_goes_when_the_installer_exits(), an_installer_left_open_past_the_deadline_is_reported(), applications_dir(), binary_install_path(), copy_app_from(), copy_tree(), extract_freenet() (+45 more)

### Community 61 - "durable.ts"
Cohesion: 0.08
Nodes (20): createDurable(), durable, DURABLE_PREFIXES, DurableNode, DurableStore, isDurable(), packageKey(), updateNotifsSoundBtn() (+12 more)

### Community 62 - "translate.ts"
Cohesion: 0.16
Nodes (18): files(), before, draftTranslateHtml(), initDraftTranslate(), translateKeeping(), setReaderLang(), availableLangs(), cachedAvail (+10 more)

### Community 64 - "package.json"
Cohesion: 0.15
Nodes (12): dependencies, @semaphore-protocol/core, viem, devDependencies, vite, name, private, scripts (+4 more)

### Community 66 - "package.json"
Cohesion: 0.17
Nodes (11): dependencies, @freenetorg/freenet-stdlib, @noble/ed25519, @noble/hashes, viem, name, private, scripts (+3 more)

### Community 67 - "pow.ts"
Cohesion: 0.07
Nodes (36): FEED_TARGET, feedBytes(), formatBytes(), oldestToFree(), postBytes(), yieldToMain(), amVouched(), applyTheme() (+28 more)

### Community 68 - "verify.js"
Cohesion: 0.24
Nodes (6): ADDRESSES, DEPLOYED, { ethers, network }, { TREASURY, ADDRESSES }, hre, { TREASURY, ADDRESSES, DEPLOYED }

### Community 69 - "split-freenet-dist.mjs"
Cohesion: 0.08
Nodes (18): isHeavy(), all, cfg, cfgPath, copy(), dist, fingerprint, hash (+10 more)

### Community 70 - "BatchTranslator"
Cohesion: 0.20
Nodes (3): BatchTranslator, @browsermt/bergamot-translator/translator.js, TranslatorBacking

### Community 73 - "Radica donation contract"
Cohesion: 0.33
Nodes (5): Before Base mainnet, Deploy, Deployments, Radica donation contract, Test

### Community 74 - "delegate.ts"
Cohesion: 0.17
Nodes (22): api(), asBytes(), call(), chain, dec, delegateMessage(), enc, extractPayload() (+14 more)

### Community 75 - "Radica attester"
Cohesion: 0.40
Nodes (4): CapRover, Radica attester, Run, Test

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
Cohesion: 0.14
Nodes (18): checkUrlInviteHash(), handleFreenameLink(), handleJoinFromInviteUrl(), handleSignOut(), INVITE_PARAMS, inviteFromParams(), openPostLink(), renderUpdatesList() (+10 more)

### Community 85 - "heavyUrl"
Cohesion: 0.33
Nodes (6): closeGifPicker(), CURATED_GIFS, GifItem, openGifPicker(), heavyUrl(), heavyUrlFor()

### Community 86 - "topPosts.ts"
Cohesion: 0.22
Nodes (8): EQUAL, FeedSort, isFuture(), postScore(), sortPosts(), Weights, WINDOW_MS, now

### Community 88 - "communityFinder.ts"
Cohesion: 0.27
Nodes (9): CommunitySort, compare(), findCommunities(), FinderInput, FinderResult, slugOf(), all, comm() (+1 more)

### Community 89 - "freetree.ts"
Cohesion: 0.10
Nodes (34): ECOSYSTEM, EcosystemApp, ecosystemCard(), ecosystemFooter(), hrefOf(), link(), FREETREE_URL_RE, freetreeCard() (+26 more)

### Community 90 - "wormhole.ts"
Cohesion: 0.07
Nodes (14): detached_live(), app(), every_screen_has_a_scene(), load_logo(), Logo, RadicaApp, AppHandle, FnOnce (+6 more)

### Community 92 - "resolve"
Cohesion: 0.12
Nodes (33): what_answers_on_the_port_decides_the_state(), a_real_signed_release_manifest_verifies(), an_asset_must_match_its_checksum_and_be_listed(), asset_name(), asset_name_for(), check_manifest_version(), Checksums, downloads_report_progress_and_stop_at_their_limits() (+25 more)

### Community 93 - "Room"
Cohesion: 0.11
Nodes (29): civil_from_days(), clock(), day_label(), days_from_civil(), Group, groups(), groups_split_on_author_gap_and_day(), initials() (+21 more)

### Community 94 - "Chat"
Cohesion: 0.08
Nodes (26): a_list_that_refills_in_steps_keeps_every_draft(), a_reload_through_an_empty_list_keeps_drafts_and_marks_the_open_room_read(), blank_messages_are_not_sent(), Chat, counts(), each_room_keeps_its_own_draft(), example_unread_counts_are_possible(), removing_the_open_room_opens_the_first_one() (+18 more)

### Community 95 - "tests.rs"
Cohesion: 0.20
Nodes (30): a_draft_stays_in_the_room_it_was_typed_in(), a_narrow_window_leaves_out_the_members_panel(), a_narrow_window_opens_members_over_the_conversation(), connected(), connecting_shows_the_chat_screen(), create_room_join_invite_and_emoji_tray_work(), each_room_opens_at_its_newest_message(), ecosystem_bookmarks_polls_private_rooms_and_follow_work() (+22 more)

### Community 96 - "view.rs"
Cohesion: 0.22
Nodes (29): Palette, ecosystem_modal(), filter_chip(), hline(), icon_button(), identity_card_btn(), identity_modal(), label() (+21 more)

### Community 97 - "fh.ts"
Cohesion: 0.19
Nodes (20): cleanHash(), dec, enc, fhCard(), fhLink(), FhListData, fhListKey(), fhPersonaHex() (+12 more)

### Community 98 - "riverPointer.ts"
Cohesion: 0.06
Nodes (45): decodeCbor(), deltaInCaption(), DeltaPage, deltaPrefixOf(), DeltaSite, DeltaUri, parseDeltaUri(), parseSite() (+37 more)

### Community 99 - "createMessengerChat"
Cohesion: 0.29
Nodes (9): classify(), IdentityInfo, LiveAction, LiveSnapshot, NodeProbe, Option, String, Vec (+1 more)

### Community 100 - "example.rs"
Cohesion: 0.23
Nodes (16): at(), book_club(), Builder, data(), design_crew(), ExampleData, family(), member() (+8 more)

### Community 101 - "Palette"
Cohesion: 0.26
Nodes (18): avatar(), composer(), context_banner(), conversation(), day_divider(), group_el(), header(), history() (+10 more)

### Community 102 - "setup.rs"
Cohesion: 0.16
Nodes (22): a_missing_node_asks_before_installing(), a_node_an_installer_started_from_somewhere_unexpected_is_waited_for(), a_node_that_never_answers_times_out(), a_panicking_worker_still_settles_and_frees_the_controller(), a_running_node_connects_without_starting_anything(), a_second_press_while_installing_is_ignored(), an_installed_but_stopped_node_is_started_and_waited_for(), an_installer_that_starts_the_node_itself_is_not_started_twice() (+14 more)

### Community 104 - "FakeHost"
Cohesion: 0.14
Nodes (17): NodeHost, Send, Sync, connected(), Controller, outdated(), AppHandle, Arc (+9 more)

### Community 107 - "roots.ts"
Cohesion: 0.09
Nodes (67): generateDefaultAvatar(), nodeOrigin(), escapeHtml(), safeUrl(), shortenKey(), renderIcon(), applyChatLayoutAttr(), applyProfile() (+59 more)

### Community 108 - "style.rs"
Cohesion: 0.43
Nodes (6): avatar_colors(), hex(), room_monogram(), Color, String, sender_color()

### Community 109 - "media.ts"
Cohesion: 0.33
Nodes (7): dataUrlBytes(), inflight, keepMedia(), mediaUrl(), urls, bytes, hash

## Knowledge Gaps
- **644 isolated node(s):** `name`, `private`, `type`, `start`, `test` (+639 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `FreenetClient` connect `moderation.ts` to `CHANGELOG.md`, `RiverRooms`, `riverPointer.ts`, `fh.ts`, `nodeOrigin`, `whoiam.ts`, `init`, `createMessengerChat`, `compilerOptions`, `versionCheck.ts`, `handleJoinFromInviteUrl`, `feature_request.md`, `createMessengerChat`, `compilerOptions`, `freetree.ts`, `feedlight.ts`, `icons.ts`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `Cert` connect `lib.rs` to `RiverRooms`, `avatar.ts`, `createMessengerChat`, `signOut`, `handleJoinFromInviteUrl`, `feedlight.ts`, `updates.ts`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `api()` connect `delegate.ts` to `feature_request.md`, `attachCardListeners`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _644 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0060790273556231 - nodes in this community are weakly interconnected._
- **Should `RiverRooms` be split into smaller, more focused modules?**
  _Cohesion score 0.07680491551459294 - nodes in this community are weakly interconnected._
- **Should `lib.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.09177215189873418 - nodes in this community are weakly interconnected._