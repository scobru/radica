# TASK-008: Social Audio, Podcasts & Persistent Player (Spotify / FreeTunes)

## Context & Goal
Integrate social audio, voice notes/podcasts, and music sharing with a persistent mini-player across all Radica views, including interoperability with companion Freenet audio apps such as **FreeTunes**.

## Requirements
1. **Persistent Global Audio Mini-Player**:
   - Add a docked mini-player bar (play/pause, scrub, volume, queue) that keeps playing uninterrupted while navigating between Feed, Chat, Mail, Moments, and Communities.
2. **Audio Posts & Playlists**:
   - Support audio attachments / podcast episodes in posts (stored via `freenet-blob` or companion contract references) with waveform/duration metadata and chapter/timestamp comments.
3. **FreeTunes Companion Bridge**:
   - Define clean permalink/embed rendering for **FreeTunes** tracks and playlists inside Radica posts and User Walls.
4. **Testing & Verification**:
   - Add unit tests for audio queue state, duration formatting, and FreeTunes embed parsing.
   - Update `ui/src/updates.ts`, `CHANGELOG.md`, `CONTEXT.md`, and `README.md` upon implementation.

## Status
🟢 **DONE** (2026-11-14)
