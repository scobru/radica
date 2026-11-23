# Graph Report - radica  (2026-11-23)

## Corpus Check
- 305 files · ~429,192 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 41 file(s) not represented in the graph (top: (none) 13, .wasm 13, .css 5)

## Summary
- 4813 nodes · 13138 edges · 168 communities (137 shown, 31 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 499 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9080545e`
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
- feedlight.ts
- UserIdentity
- river-wasm/src/lib.rs
- SafeStorage
- .process
- secretChatTransport.ts
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
- moderation.spec.ts
- fetch-translation-models.mjs
- network.ts
- versionCheck.ts
- start.sh
- README.md
- contactCard.ts
- DesktopHost
- orto.ts
- treeGraph.test.ts
- Req
- WalkieQueueController
- resolve
- .onCreate
- ok
- InstallStep
- ante.ts
- fillFreetunes
- riverPointer.ts
- devDependencies
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
- plant.test.ts
- linfa.ts
- Radica Issues & Task Tracker
- freetree.ts
- steps
- pow.ts
- TASK-003: Mail Contacts Management (Add & Remove Contacts)
- TASK-006: Short-Form Vertical Video & Video Channels (TikTok / YouTube)
- TASK-008: Social Audio, Podcasts & Persistent Player (Spotify / FreeTunes)
- TASK-009: Dedicated Events Calendar & RSVP System (Luma / Meetup)
- mentionPicker.ts
- getWebOfTrust
- scripts
- rootsfx.ts
- musicPage.ts
- types.ts
- conversationState.ts
- communitiesPage.ts
- verifiedPohBadgesByAuthor
- boards.ts
- compilerOptions
- roots.ts
- 🚀 Getting Started
- savedPosts.ts
- wallets.ts
- durable.ts
- Folio
- avatar.ts
- syncFreenetMailInbox
- linfa.ts
- vite.config.ts
- updateMailBadges
- init
- ghostkey.ts
- Radica: Terms of Use, Disclaimer and Privacy
- encryptFreenetMailV1
- super
- walkieTalkie.ts
- escapeHtml
- scripts
- .onShowFileChooser
- reloadPosts
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
1. `FreenetClient` - 280 edges
2. `escapeHtml()` - 133 edges
3. `createMessengerChat()` - 115 edges
4. `openUserProfile()` - 87 edges
5. `UserIdentity` - 84 edges
6. `renderCommunitiesPage()` - 65 edges
7. `renderTimeline()` - 61 edges
8. `bytesToHex` - 56 edges
9. `renderIcon()` - 52 edges
10. `hexToBytes` - 52 edges

## Surprising Connections (you probably didn't know these)
- `4. 🌐 Cryptographic Personas & Decentralized Storage` --references--> `DelegationProofV1`  [INFERRED]
  README.md → ui/src/viso.ts
- `6. 💬 P2P Direct Chat & Interactive Feeds` --references--> `fromBase58()`  [INFERRED]
  README.md → ui/src/base58.ts
- `8. 📸 Moments Compression & Sandboxed Persistence Engine` --references--> `SafeStorage`  [INFERRED]
  README.md → ui/src/storage.ts
- `11. 🌱 Linfa: a Plant on Every Profile` --references--> `linfaGreenhouseWeight()`  [INFERRED]
  README.md → ui/src/linfa.ts
- `📜 Origin & Acknowledgments` --references--> `DelegationProofV1`  [INFERRED]
  README.md → ui/src/viso.ts

## Import Cycles
- 2-file cycle: `ui/src/handles.ts -> ui/src/logfold.ts -> ui/src/handles.ts`
- 2-file cycle: `apps/desktop/src/host.rs -> apps/desktop/src/install.rs -> apps/desktop/src/host.rs`
- 3-file cycle: `ui/src/crypto.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/crypto.ts`
- 4-file cycle: `ui/src/crypto.ts -> ui/src/whoiam.ts -> ui/src/riverRooms.ts -> ui/src/riverPointer.ts -> ui/src/crypto.ts`

## Communities (168 total, 31 thin omitted)

### Community 0 - "freenetMail.ts"
Cohesion: 0.07
Nodes (44): BIP39_WORDLIST, ADDRESS_CHARS, ADDRESS_CONTEXT, AFT_TIER_SPEC, AFT_TIERS, aftDayIndexInYear(), AftTokenAssignment, BODY_LEN (+36 more)

### Community 1 - "RiverRooms"
Cohesion: 0.17
Nodes (13): @desert-ant-labs/moderator, @desert-ant-labs/moderator@^4.0.0, filterWasmResponse(), analyzeTextContent(), BAD_WORDS, BAD_WORDS_RE, censorTextAndPII(), getModerator() (+5 more)

### Community 2 - "lib.rs"
Cohesion: 0.05
Nodes (97): hx(), key(), prepare(), run(), STATE, main(), state(), an_author_takes_back_a_comment_with_an_empty_version() (+89 more)

### Community 3 - "init"
Cohesion: 0.09
Nodes (48): askModel(), askRaw(), ghFetch(), greenhousePass(), loadMod(), modPass(), roomModPass(), applyHoldOutcomes() (+40 more)

### Community 4 - "scripts"
Cohesion: 0.07
Nodes (28): author, description, keywords, license, name, scripts, app, app:messenger (+20 more)

### Community 5 - "whoiam.ts"
Cohesion: 0.11
Nodes (23): ANTE_CODE_HASH, VOTE_BITS, code(), createPoll(), enc(), fpIdentity(), FpPoll, FpQuestion (+15 more)

### Community 6 - "🌟 Key Features"
Cohesion: 0.12
Nodes (15): 10. ✉️ Radica Mail & Freenet Mail Interoperability (Post-Quantum), 11. 🌱 Linfa: a Plant on Every Profile, 12. 🔁 Reposts Without a Contract Change, 13. ⚙️ Dedicated Settings, Decluttered Rail & Wall-First Profiles, 13. 🖼️ Moments Gallery (Media Explore), 1. 🛡️ On-Device AI Moderation (Desert Ant Labs), 2. 🔒 Automated PII Redaction & Text Censorship, 3. ⏱️ Decentralized Anti-Flooding & Rate Limiting (+7 more)

### Community 7 - "handle"
Cohesion: 0.15
Nodes (21): a_secret_blob_that_does_not_decrypt_is_skipped(), body(), cbor(), entering(), handle(), is_private(), key32(), kick_rotation_excludes_banned_invite_subtree() (+13 more)

### Community 8 - "dependencies"
Cohesion: 0.11
Nodes (24): @browsermt/bergamot-translator, @fontsource-variable/fraunces, @fontsource-variable/inter, freenet-blob, @litertjs/core, @noble/curves, @noble/post-quantum, dependencies (+16 more)

### Community 9 - "selectPrivateRoom"
Cohesion: 0.06
Nodes (71): generateDefaultAvatar(), safeUrl(), shortenKey(), renderIcon(), applyChatLayoutAttr(), applyFullWidth(), applyProfile(), attachBubbleDeleteListeners() (+63 more)

### Community 10 - "moderation.ts"
Cohesion: 0.04
Nodes (8): ContactCard, FreenetClient, foldPostDislikes(), LogEntry, backupOwnProfileExtras(), isProfileExtraLog(), latestOwnLogEntry(), ProfileExtraKind

### Community 11 - "postGone.ts"
Cohesion: 0.19
Nodes (16): BlobVideoRef, filterVideoReels(), formatBlobVideoCaption(), isVideoReelPost(), parseBlobVideoRef(), stepReelIndex(), VIDEO_BLOB_PREFIX, createReelsPlayer() (+8 more)

### Community 12 - "resetPublishBtnState"
Cohesion: 0.10
Nodes (30): clearResolvedFreenames(), dec, enc, freenameInCaption(), freenamesCard(), FreenameUri, getResolvedFreename(), ID (+22 more)

### Community 13 - "vite.config.ts"
Cohesion: 0.06
Nodes (25): bmp_entry(), png_entry(), a_proof_holds_for_its_identity_only_and_under_the_real_master_only(), a_sign_result_becomes_the_bundle_viso_stores(), BIND_TAG, binding_payload(), call(), cbor() (+17 more)

### Community 14 - "signOut"
Cohesion: 0.09
Nodes (44): an_author_s_newer_entry_replaces_the_older_under_one_key(), check(), de(), delta(), Entry, entry2(), entry(), entry_msg() (+36 more)

### Community 15 - "feedlight.ts"
Cohesion: 0.08
Nodes (25): 2. Caps that bound size without letting spam evict real content, 3. Hex and delta fixes, 4. Rollout, 5. Carrying all data (no rollback), Context & Goal, Design, Open questions, Status (+17 more)

### Community 16 - "UserIdentity"
Cohesion: 0.08
Nodes (16): 1. Signatures: v3 messages, length-prefixed, v2 still accepted, ArticlesPageDeps, CommentEntry, CommentFilters, ModerationSets, MessengerDeps, postIdWithPow(), BuildTreeGraphInput (+8 more)

### Community 17 - "river-wasm/src/lib.rs"
Cohesion: 0.04
Nodes (10): call(), fill(), Invitation, open(), random_fill(), RECORD, RIVER_AUTHOR_VK, RIVER_INVITATION (+2 more)

### Community 18 - "SafeStorage"
Cohesion: 0.16
Nodes (9): delta_only_to_a_peer_without_it(), IMG, MAX_MEDIA, only_the_named_bytes_are_valid(), params(), RadicaMediaContract, too_big_is_refused_even_with_its_hash(), update_keeps_or_adopts_the_valid_image() (+1 more)

### Community 19 - ".process"
Cohesion: 0.09
Nodes (17): Identity, key_of(), kv_name(), kv_names_are_validated_and_namespaced(), MAX_VALUE, parse_sk(), Req, Export (+9 more)

### Community 20 - "secretChatTransport.ts"
Cohesion: 0.13
Nodes (28): getActiveSecretChatTTL(), getSecretRoomId(), addSecretChatPeer(), burnedKey(), burnSecretMessage(), editSecretMessage(), isSealedSecret(), keepPlain() (+20 more)

### Community 22 - "attachCardListeners"
Cohesion: 0.06
Nodes (49): append(), attesterPk, code, codeHash, connect(), feedCode, feedHash, feedKey() (+41 more)

### Community 23 - "feedsize.ts"
Cohesion: 0.18
Nodes (18): Linfa, SeasonInfo, stageOf(), Bloom, Branch, clamp(), curve(), [CX, GROUND] (+10 more)

### Community 24 - "Contributor Covenant Code of Conduct"
Cohesion: 0.16
Nodes (22): ARTICLE_CACHE_PREFIX, ARTICLE_DRAFTS_PREFIX, ARTICLE_PREFIX, ArticleDraft, articleDraftsKey(), ArticlePayload, ArticleRef, cacheArticlePayload() (+14 more)

### Community 25 - "versionCheck.ts"
Cohesion: 0.26
Nodes (4): bytesToHex, RiverRooms, vkOf(), world()

### Community 26 - "avatar.ts"
Cohesion: 0.10
Nodes (8): seedReadMark(), computeRoomJoinProof(), MessengerActiveState, RiverJoin, roomOwnerSk(), ChatMessage, PrivateRoom, ./wasm/river_room_contract.wasm?url

### Community 27 - "createMessengerChat"
Cohesion: 0.08
Nodes (58): plainMentions(), renderChatText(), canCaptureVideoNote(), canRecordVoice(), canUseLiveMediaCapture(), chatMediaCardsHtml(), fileExtensionIcon(), formatBytes() (+50 more)

### Community 28 - "icons.ts"
Cohesion: 0.07
Nodes (85): fillAsocial(), nodeOrigin(), fillDelta(), fillFh(), fillFreenames(), fillFreepolls(), freepollsLink(), fillFreetunes() (+77 more)

### Community 29 - "web.rs"
Cohesion: 0.06
Nodes (39): MANUAL_INSTALL_URL, ANSWER_DEADLINE, app_mode_configures_messenger_binary(), AppMode, Full, Messenger, bring_up(), install_steps_read_as_progress() (+31 more)

### Community 30 - "asocial.ts"
Cohesion: 0.11
Nodes (33): ASOCIAL_RECORDS_CODE, ASOCIAL_RECORDS_CODE_BYTES, ASOCIAL_REPO, asocialCard(), AsocialData, asocialLink(), asocialOwnStoreKey(), asocialOwnStoreParams() (+25 more)

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
Nodes (530): accentSelect, activeFilterBanner, activeFilterPrefix, activeFilterTag, addModForm, addModPubkeyInput, alerted, allCommunities (+522 more)

### Community 35 - "delta.ts"
Cohesion: 0.17
Nodes (18): decodeCbor(), DELTA_WEB, deltaInCaption(), DeltaPage, deltaPrefixOf(), DeltaSite, DeltaUri, parseDeltaUri() (+10 more)

### Community 36 - "nodeOrigin"
Cohesion: 0.08
Nodes (33): chunk(), coverUrls, Fetch, fillFreetunesProfile(), fmtTime(), FREETUNES_DIR_ADMIN, FREETUNES_DIR_CODE_HASH, FREETUNES_KEY (+25 more)

### Community 37 - "types.ts"
Cohesion: 0.13
Nodes (33): closeModal(), hasOpenModal(), installModalDismiss(), openModals(), ActiveView, clearSelectedPostCard(), closeOtherPages(), findNextCardIndex() (+25 more)

### Community 38 - "hexToBytes"
Cohesion: 0.15
Nodes (23): hexToBytes, pollKey(), freetunesDirKey(), RiverCall, Anchor, anchorOf(), BUNDLED_ROOM_CODE, instanceOf() (+15 more)

### Community 39 - "createMessengerChat"
Cohesion: 0.06
Nodes (52): MUST: content moderation, all 3 layers, MUST: updates tab + docs, same session, Radica — Agent Rules, Testing & verification, foldHandles(), formatHandle(), isValidHandle(), normalizeHandle() (+44 more)

### Community 40 - "Reader"
Cohesion: 0.15
Nodes (22): signPrivateRoomMessage(), aesGcmDecrypt(), aesGcmEncrypt(), computeRoomJoinProof(), connectMessage(), dec, decryptRoomKey(), decryptRoomKeyFromPeer() (+14 more)

### Community 41 - "secretChat.ts"
Cohesion: 0.18
Nodes (18): before, draftTranslateHtml(), initDraftTranslate(), translateKeeping(), setReaderLang(), availableLangs(), cachedAvail, detectLang() (+10 more)

### Community 42 - "delegate.ts"
Cohesion: 0.13
Nodes (31): TreeGraphModel, TreeSelection, applySim(), applySvgViewBoxOnly(), attachSim(), getTreeSvgEl(), handleNodeDoubleClick(), handleNodeSelect() (+23 more)

### Community 43 - "messengerLogic.ts"
Cohesion: 0.11
Nodes (21): containerOf(), CONTAINERS, isHeavy(), LIMITS, all, cfg, cfgPath, dist (+13 more)

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
Cohesion: 0.09
Nodes (9): dmPeerOf(), localReadMarks(), onMeshPacket(), foldChat(), foldChatRead(), isDmEntry(), keepNewest(), setActiveSecretChatTTL() (+1 more)

### Community 48 - "caption.test.ts"
Cohesion: 0.05
Nodes (74): mediabunny, mediabunny@^1.65.0, compressPostImageFile(), analyzeAudioBlob(), AUDIO_EXT, base64ToBytes(), blobCache, canvasToJpegBlob() (+66 more)

### Community 49 - "donation-contract/package.json"
Cohesion: 0.06
Nodes (35): path, { subtask }, { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD }, devDependencies, chai@^4.5.0, ethers@^6.17.0, hardhat@^2.29.1, @nomicfoundation/hardhat-chai-matchers@^2.1.2 (+27 more)

### Community 50 - "audio.rs"
Cohesion: 0.07
Nodes (20): base64_encode(), base64_matches_rfc4648_vectors(), downsample_to_mono_16k(), encode_wav_mono_16k(), encodes_valid_wav_header(), NativeVoiceController, push_mono_chunk(), RecCmd (+12 more)

### Community 51 - "ref_node_assert"
Cohesion: 0.11
Nodes (10): along(), Box, f(), growRoots(), rootPaths(), anchorElementInViewport(), AnchorScrollOptions, cancelAnchoredScroll() (+2 more)

### Community 52 - "mailClient.ts"
Cohesion: 0.12
Nodes (46): Mail, AftTier, decryptFreenetMailV1(), deriveInboxContract(), initialInboxState(), sanitizeMailAlias(), unversionedWasm(), BLOCKED_KEY() (+38 more)

### Community 54 - "steps"
Cohesion: 0.07
Nodes (27): concurrency, cancel-in-progress, group, environment, runs-on, steps, name, url (+19 more)

### Community 55 - "delegate.ts"
Cohesion: 0.15
Nodes (23): api(), asBytes(), call(), chain, dec, delegateMessage(), enc, extractPayload() (+15 more)

### Community 56 - "secretChat.ts"
Cohesion: 0.11
Nodes (49): checkGhostkey(), requestGhostkeyProof(), verifiedGhostkeys(), amVouched(), ghostkeyKey(), pohKey(), refreshSupporters(), safeStorage (+41 more)

### Community 57 - "secretRatchet.ts"
Cohesion: 0.13
Nodes (31): ad(), aead(), b64(), clearDrSessions(), dec, DR_SESSIONS_KEY, drDecrypt(), drEncrypt() (+23 more)

### Community 58 - "secretChat.ts"
Cohesion: 0.15
Nodes (24): ACTIVE_TTL_STORAGE_KEY, activeTimers, cancelMessageBurn(), chainStepsCache, clearSecretChatSession(), dec, decryptSecretMessage(), enc (+16 more)

### Community 60 - "splitNotifs"
Cohesion: 0.07
Nodes (49): a_failed_record_write_leaves_no_temporary_file(), a_failed_rewrite_of_a_record_leaves_it_whole(), a_node_answering_ends_the_wait_and_the_directory_goes_when_the_installer_exits(), a_plain_directory_is_not_a_mount_point(), an_installer_left_open_past_the_deadline_is_reported(), applications_dir(), binary_install_path(), copy_app_from() (+41 more)

### Community 61 - "freenet.ts"
Cohesion: 0.06
Nodes (65): addReadKeys(), commentMsg3(), decryptDirectMessage(), decryptRoomKeyFromPeer(), decryptWithSymmetricKey(), deleteMsg3(), enc, encryptDirectMessage() (+57 more)

### Community 62 - "loadMailContacts"
Cohesion: 0.09
Nodes (37): ANONYMOUS_AUTHOR, ARTICLE_PREFIX, ArticlePayload, buildPayload(), countWords(), estimateReadingMinutes(), extractTags(), parsePayload() (+29 more)

### Community 63 - "treePage.ts"
Cohesion: 0.15
Nodes (16): 15. 🗣️ Reddit-Style Communities (`r/slug`) & Standalone Single Post View, computeHotRank(), computeNetScore(), flairInfoForPost(), formatThreadComposeCaption(), RedditFlairFilter, RedditSort, RedditViewMode (+8 more)

### Community 64 - "package.json"
Cohesion: 0.15
Nodes (15): dependencies, @semaphore-protocol/core@^4.14.5, viem@^2.57.14, devDependencies, vite@^6.4.5, viem, vite, name (+7 more)

### Community 66 - "package.json"
Cohesion: 0.16
Nodes (15): dependencies, @freenetorg/freenet-stdlib@^0.4.0, @noble/ed25519@^2.3.0, @noble/hashes@^2.4.0, viem@^2.57.14, @freenetorg/freenet-stdlib, @noble/ed25519, @noble/hashes (+7 more)

### Community 67 - "createMessengerChat"
Cohesion: 0.18
Nodes (24): anteProof(), bitsOf(), cat(), cbor(), challengeBytes(), enc, grind(), head() (+16 more)

### Community 68 - "createArticlesPage"
Cohesion: 0.22
Nodes (27): articleMissingNote(), buildNewsletterEmail(), countWords(), estimateReadingMinutes(), extractArticleTags(), formatArticlePostCaption(), parseArticleCaption(), resolveArticleCoverUri() (+19 more)

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
Cohesion: 0.16
Nodes (15): checkMilestones(), networkCounts(), renderMilestones(), Counts, countsOf(), FIRST, Metric, METRIC_LABELS (+7 more)

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
Cohesion: 0.16
Nodes (15): Gain, gains(), linfaGreenhouseWeight(), linfaOf(), MIN_TRUSTED_RECEIVED, PlantSeason, POINTS, POST_DAYS_CAP (+7 more)

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
Cohesion: 0.31
Nodes (8): cardsKey(), contactCardText(), parseContactCard(), readContactCards(), saveContactCard(), Store, enc, pk

### Community 84 - "DesktopHost"
Cohesion: 0.14
Nodes (16): Answer, Nothing, NoVersion, Version, ask(), classify(), DesktopHost, NodeProbe (+8 more)

### Community 85 - "orto.ts"
Cohesion: 0.12
Nodes (18): canonicalFieldStr(), CLAIMS_LOG, enc, issueReceipt(), judgeClaim(), logEntryMessage(), logEntryMessage2(), powBits() (+10 more)

### Community 86 - "treeGraph.test.ts"
Cohesion: 0.18
Nodes (9): TreePeerInput, TreePageDeps, ALICE, BOB, COMM, ME, PEERS, POSTS (+1 more)

### Community 89 - "Req"
Cohesion: 0.11
Nodes (19): Join, Req, Accept, Act, Apply, Deputies, DmSend, ExportIdentity (+11 more)

### Community 92 - "resolve"
Cohesion: 0.07
Nodes (37): a_manifest_signed_by_another_key_is_refused(), a_real_signed_release_manifest_verifies(), a_tampered_manifest_is_refused(), a_truncated_or_missing_signature_is_refused(), an_asset_must_match_its_checksum_and_be_listed(), asset_name(), asset_name_for(), check_manifest_version() (+29 more)

### Community 93 - ".onCreate"
Cohesion: 0.12
Nodes (5): Client, Node, CHECKING, MISSING, STOPPED

### Community 94 - "ok"
Cohesion: 0.32
Nodes (16): apply(), deputy_badges_follow_river_relevance(), direct_messages_go_both_ways(), hx(), identity_tokens_round_trip_with_river_format(), legacy_lists_earlier_room_contracts_newest_first(), ok(), one_public_link_lets_each_holder_in_as_their_own_member() (+8 more)

### Community 95 - "InstallStep"
Cohesion: 0.33
Nodes (6): InstallStep, Downloading, FindingRelease, Installing, Verifying, WaitingForInstaller

### Community 96 - "ante.ts"
Cohesion: 0.15
Nodes (34): bitsOf(), cat(), challengeBytes(), checkProof(), decodeProof(), enc, grind(), makeProof() (+26 more)

### Community 97 - "fillFreetunes"
Cohesion: 0.39
Nodes (7): isSporeRadioLive(), RADIO_HEARTBEATS, recordSporeRadioHeartbeat(), SPORE_REPO, sporeRadioCard(), sporeRadioLink(), SporeRadioRef

### Community 98 - "riverPointer.ts"
Cohesion: 0.23
Nodes (20): Voter, canonicalBase(), certShowsHost(), connectMessage(), createLocalIdentity(), enc, finishSignIn(), getAppKeyPubkey() (+12 more)

### Community 99 - "devDependencies"
Cohesion: 0.33
Nodes (6): devDependencies, @playwright/test@^1.63.0, typescript@^5.6.0, vite@^6.0.0, typescript, vite

### Community 100 - "renderIdentityModal"
Cohesion: 0.26
Nodes (14): cleanExcerpt(), decodeB64u(), encodeB64u(), ORTO_PATH, ORTO_SITE, ORTO_VAULT_CODE_HASH, OrtoBlog, ortoCard() (+6 more)

### Community 101 - "messengerChat.ts"
Cohesion: 0.09
Nodes (38): MAX_VNOTE_SEC, PreparedChatMedia, hasLanMesh(), setChatStatus(), ChatLayoutMode, chatTranslations, CLOCK_FMT, hydrateClosedPreviews() (+30 more)

### Community 102 - "media.ts"
Cohesion: 0.29
Nodes (8): dataUrlBytes(), inflight, keepMedia(), MEDIA_PREFIX, mediaUrl(), urls, bytes, hash

### Community 103 - "musicPage.ts"
Cohesion: 0.19
Nodes (14): FREEHOLE_PATH, FREEHOLE_REPO, FREEHOLE_SITE, FREEHOLE_URL_RE, freeholeCard(), freeholeHref(), freeholeLink(), FreeHoleRef (+6 more)

### Community 104 - "chatMedia.test.ts"
Cohesion: 0.08
Nodes (42): a_command_that_hangs_is_killed_at_the_deadline(), a_leftover_user_unit_beside_a_system_unit_gets_a_way_out(), a_process_left_holding_stderr_does_not_hold_up_run(), a_registered_service_is_just_started(), a_registered_service_that_fails_is_reported_never_registered_again(), a_stopped_system_service_is_left_to_the_administrator(), a_suggested_command_survives_any_path(), BIN (+34 more)

### Community 107 - "communitiesPage.ts"
Cohesion: 0.11
Nodes (27): ASOCIAL_SITE, AppFilter, AppGroup, appId(), ATLAS_SITE, AULA_SITE, CustomAppRecord, customRecordToApp() (+19 more)

### Community 108 - "TASK-001: Responsive 13.3" Laptop Layout for Wall & Profile Modal"
Cohesion: 0.33
Nodes (5): Context, Problem Analysis, Requirements, Status, TASK-001: Responsive 13.3" Laptop Layout for Wall & Profile Modal

### Community 109 - "treeGraph.ts"
Cohesion: 0.13
Nodes (26): FT_TREE_PREFIX, ARTICLE_BOUGH, baseViewBoxDims(), buildTreeGraph(), CATEGORY_BOUGHS, clamp(), computeNetworkTreeStage(), cut() (+18 more)

### Community 110 - "plant.test.ts"
Cohesion: 0.40
Nodes (3): lifeOf(), A, B

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
Cohesion: 0.09
Nodes (28): COMMENT_POW_BITS, countLeadingZeroBits(), createPoWChallenge(), DEFAULT_TIER0_DIFFICULTY, enc, failPowWorker(), ID_PREFIX, POST_POW_BITS (+20 more)

### Community 116 - "TASK-003: Mail Contacts Management (Add & Remove Contacts)"
Cohesion: 0.33
Nodes (5): Context & Request, Requirements, Status, TASK-003: Mail Contacts Management (Add & Remove Contacts), MailFolder

### Community 117 - "TASK-006: Short-Form Vertical Video & Video Channels (TikTok / YouTube)"
Cohesion: 0.40
Nodes (4): Context & Goal, Requirements, Status, TASK-006: Short-Form Vertical Video & Video Channels (TikTok / YouTube)

### Community 119 - "TASK-008: Social Audio, Podcasts & Persistent Player (Spotify / FreeTunes)"
Cohesion: 0.40
Nodes (4): Context & Goal, Requirements, Status, TASK-008: Social Audio, Podcasts & Persistent Player (Spotify / FreeTunes)

### Community 120 - "TASK-009: Dedicated Events Calendar & RSVP System (Luma / Meetup)"
Cohesion: 0.40
Nodes (4): Context & Goal, Requirements, Status, TASK-009: Dedicated Events Calendar & RSVP System (Luma / Meetup)

### Community 121 - "mentionPicker.ts"
Cohesion: 0.13
Nodes (11): decodeBase64State(), encodeBase64State(), FORBIDDEN_PROTO_KEYS, HASH_SAFE_OPTIONAL_PREFIXES, HASH_SAFE_SOFT_PREFIXES, isHashSafeKey(), isSensitiveStorageKey(), nativeBridge() (+3 more)

### Community 122 - "getWebOfTrust"
Cohesion: 0.14
Nodes (12): getWebOfTrust(), isKnownSender(), isWotModerationEnabled(), markSeen(), notifCounts(), notificationHasTarget(), reactionsByHtml(), renderNotifs() (+4 more)

### Community 123 - "scripts"
Cohesion: 0.11
Nodes (21): dependencies, @freenetorg/freenet-stdlib@latest, @noble/hashes@^2.4.0, devDependencies, typescript@^5.6.0, vite@^6.0.0, @freenetorg/freenet-stdlib, @noble/hashes (+13 more)

### Community 124 - "rootsfx.ts"
Cohesion: 0.18
Nodes (19): cleanHash(), dec, enc, FH_APP_PATH, FH_LIST_CODE_HASH, FH_REPO, FH_SITE, fhLink() (+11 more)

### Community 126 - "musicPage.ts"
Cohesion: 0.19
Nodes (7): createDurable(), durable, DURABLE_PREFIXES, DurableNode, DurableStore, isDurable(), packageKey()

### Community 127 - "types.ts"
Cohesion: 0.13
Nodes (15): FEED_BUDGET, FEED_SHOW, FEED_TARGET, feedBytes(), formatBytes(), oldestToFree(), postBytes(), renderFeedSize() (+7 more)

### Community 128 - "conversationState.ts"
Cohesion: 0.13
Nodes (21): burnAtOf(), checksHtml(), ConversationDeps, ConversationState, createConversationState(), Delivery, deliveryOf(), formatBurnRemaining() (+13 more)

### Community 129 - "communitiesPage.ts"
Cohesion: 0.33
Nodes (11): openSettingsModal(), updateNotifsSoundBtn(), getAudioContext(), isSoundEnabled(), playBufferPop(), playPopSound(), playSynthesizedPop(), preloadPopSound() (+3 more)

### Community 130 - "verifiedPohBadgesByAuthor"
Cohesion: 0.08
Nodes (35): Supporters, RFC-9474, AnteTier, anteTierOf(), cat(), checkedDelegations, checkedPohEntries, CheckedPohEntry (+27 more)

### Community 131 - "boards.ts"
Cohesion: 0.13
Nodes (29): Context & Goal, Requirements, Status, TASK-007: Curated Boards & Collections (Pinterest / Are.na), addItemToBoard(), BOARD_PREFIX, BoardFilterOpts, BoardItem (+21 more)

### Community 132 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+4 more)

### Community 133 - "roots.ts"
Cohesion: 0.44
Nodes (7): isSaved(), keyOf(), load(), memo, savedId(), savedPosts(), toggleSaved()

### Community 134 - "🚀 Getting Started"
Cohesion: 0.14
Nodes (14): 1. Installation, 2. Development Mode, 3. Contract Compilation & Testing, 4. Build Production Web Application, 5. Publish to Freenet, 6. Launch the Desktop App (Rust + Freenet node), 🏗️ Architecture, 🚀 Getting Started (+6 more)

### Community 137 - "wallets.ts"
Cohesion: 0.14
Nodes (19): Profile extras, isValidLogEntry(), KVStore, mergeLoadedWalletInputs(), PROFILE_EXTRA_LOGS, PROFILE_EXTRAS_BACKUP_PREFIX, profileExtraLogNames(), restoreOwnProfileExtras() (+11 more)

### Community 138 - "durable.ts"
Cohesion: 0.36
Nodes (8): handleSignOut(), check(), newNotes(), shortNote(), showReloadModal(), startVersionCheck(), restart(), signOut()

### Community 139 - "Folio"
Cohesion: 0.29
Nodes (6): Development, Folio, License, Limitations, Publishing, What it does

### Community 140 - "avatar.ts"
Cohesion: 0.50
Nodes (4): avatarCache, buildDefaultAvatar(), compressAvatarFile(), svgToBase64Uri()

### Community 143 - "syncFreenetMailInbox"
Cohesion: 0.31
Nodes (9): takeHandedKey(), hex(), INFO, newEpk(), openEsk(), unhex(), hex(), seal() (+1 more)

### Community 144 - "linfa.ts"
Cohesion: 0.14
Nodes (23): cacheKeyOf(), fillChatMedia(), formatMediaDuration(), hydrateVnoteCard(), loadInPlayer(), observeLazyPoster(), pauseAllOtherMedia(), primeChatAudio() (+15 more)

### Community 146 - "vite.config.ts"
Cohesion: 0.12
Nodes (4): UPDATES, ASSET_KEYS, BUILD, FREENET_ASSETS

### Community 147 - "updateMailBadges"
Cohesion: 0.21
Nodes (17): deleteMailContact(), filterMailMessages(), formatMailDate(), getContactsStorageKey(), getUnreadMailCount(), loadMailContacts(), getOrDeriveFmailIdentity(), openMailComposer() (+9 more)

### Community 148 - "init"
Cohesion: 0.07
Nodes (58): getIdentity(), fhCard(), fhShareHref(), yieldToMain(), alertUnread(), amGlobalMod(), applyAccent(), applyDashboardSlots() (+50 more)

### Community 149 - "ghostkey.ts"
Cohesion: 0.15
Nodes (13): bytes, imports, checked, ghostkey(), GHOSTKEYS_VAULT, REFUSALS, Exports, loadJsonWasm() (+5 more)

### Community 150 - "Radica: Terms of Use, Disclaimer and Privacy"
Cohesion: 0.18
Nodes (9): 1. Software provided "as is", 2. No central service, no central moderation, 3. Your responsibility, 4. Donations and supporter badges, 5. Greenhouse, 6. Privacy, 7. Reporting illegal content, 8. Changes (+1 more)

### Community 151 - "encryptFreenetMailV1"
Cohesion: 0.32
Nodes (7): Context & Bug Report, Requirements, Status, TASK-002: Fix Native Freemail Reply: Use Inbox Contract Token as Sender `from`, buildAftSignatureContent(), deriveTokenRecordContractAddress(), encryptFreenetMailV1()

### Community 153 - "super"
Cohesion: 0.31
Nodes (4): a_packet_on_the_port_reaches_the_page_and_an_oversized_one_does_not(), MAX_BYTES, Mesh, PORT

### Community 158 - "walkieTalkie.ts"
Cohesion: 0.15
Nodes (15): Chat, encodeChatMediaToken(), encodeWaveformHex(), createWalkieQueue(), MIN_PTT_SEC, nextSequentialHash(), PTT_HOLD_THRESHOLD_MS, readWalkieEnabled() (+7 more)

### Community 159 - "escapeHtml"
Cohesion: 0.06
Nodes (67): renderArticleFeedCardHtml(), renderAnteBadgeHtml(), renderPohProviderBadgesHtml(), renderPostSubMetaHtml(), renderTrustBadgeHtml(), CHAT_TOKEN_RE, chatText(), escMd() (+59 more)

### Community 162 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, e2e, prebuild, predev, preview, test

### Community 166 - "reloadPosts"
Cohesion: 0.09
Nodes (30): Feed, trendingTags(), commentsBy(), parseGreenhouseHash(), checkUrlPostHash(), closeRailPages(), closeSinglePostModal(), handleFreenameLink() (+22 more)

## Knowledge Gaps
- **64 isolated node(s):** `Binary`, `RFC-9474`, `Export`, `Get`, `Init` (+59 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1674 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `FreenetClient` connect `moderation.ts` to `verifiedPohBadgesByAuthor`, `init`, `🌟 Key Features`, `wallets.ts`, `resetPublishBtnState`, `feedlight.ts`, `UserIdentity`, `secretChatTransport.ts`, `versionCheck.ts`, `avatar.ts`, `asocial.ts`, `delta.ts`, `nodeOrigin`, `createMessengerChat`, `icons.ts`, `.applyLog`, `caption.test.ts`, `freenet.ts`, `network.ts`, `renderIdentityModal`, `media.ts`, `rootsfx.ts`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `createMessengerChat()` (e.g. with `closeMentionPopup()` and `onViewportResize()`) actually correct?**
  _`createMessengerChat()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Binary`, `RFC-9474`, `Export` to the rest of the system?**
  _64 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `freenetMail.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0663265306122449 - nodes in this community are weakly interconnected._
- **Why does `Decisions` connect `init` to `feedlight.ts`, `init`, `.shouldInterceptRequest`, `createMessengerChat`, `icons.ts`, `asocial.ts`, `reloadPosts`, `createMessengerChat`, `delegate.ts`, `handleJoinFromInviteUrl`, `.applyLog`, `mailClient.ts`, `freenet.ts`, `linfa.ts`, `messengerChat.ts`, `.isRadicaUrl`, `Override`, `communitiesPage.ts`, `treeGraph.ts`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Should `lib.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.05001139211665528 - nodes in this community are weakly interconnected._
- **Why does `MainActivity` connect `MainActivity` to `.onShowFileChooser`, `.isRadicaUrl`, `Override`, `MainActivity.java`, `.shouldInterceptRequest`, `.onCreate`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._