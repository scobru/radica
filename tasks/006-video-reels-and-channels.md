# TASK-006: Short-Form Vertical Video & Video Channels (TikTok / YouTube)

## Context & Goal
Evolve the **Moments** media gallery (`#media-modal`) to support a continuous vertical short-video player (*TikTok / Reels* UX) and creator video channels/playlists (*YouTube* UX) backed by `freenet-blob` (Reed-Solomon) for larger media payloads.

## Requirements
1. **Vertical Short-Video Feed**:
   - Add a full-height, swipe/scroll/keyboard-navigable vertical video mode inside Moments with autoplay/mute controls, author attribution, likes, reposts, and comment drawer.
2. **Long-Form Video & Channels (`freenet-blob`)**:
   - Offload larger video files to `freenet-blob` while keeping lightweight metadata and thumbnails in the signed feed post.
   - Add a **Videos / Channels** view on User Walls and Moments with playlist/series grouping and continuous playback.
3. **On-Device Moderation Compatibility**:
   - Ensure thumbnail/frame checks remain compatible with client-side moderation (`moderation.ts`).
4. **Testing & Verification**:
   - Add unit tests for video metadata parsing, blob reference handling, and playlist ordering.
   - Update `ui/src/updates.ts`, `CHANGELOG.md`, `CONTEXT.md`, and `README.md` upon implementation.

## Status
🟢 **DONE** (2026-11-14)
