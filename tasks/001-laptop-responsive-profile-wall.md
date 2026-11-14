# TASK-001: Responsive 13.3" Laptop Layout for Wall & Profile Modal

## Context
Users on 13.3" laptops (typically 1366×768 or 1920×1080 at 125%/150% scaling, effective viewport ~1093×614 or 1280×720) reported that the profile modal (`#user-profile-modal`) feels overwhelmingly huge ("laptop is crying") and parts of the right column (such as the River broadcast channel card) are clipped/cut off under the Linfa widget.

## Problem Analysis
1. `.uview-modal-card` was fixed at `max-width: 1020px !important; width: 100%`. Alongside the 72px left rail, on a 1100–1280px screen this leaves almost zero margin, taking over the entire viewport edge-to-edge.
2. The right sidebar column (`.uview-aside-col`) was set to `310px` with `position: sticky; top: 20px`. The Linfa card contains an SVG plant graphic, level, points, and a breakdown table, totalling >420px height. On a viewport with height <750px (effective modal height ~550–650px), the content under Linfa (e.g. connected apps, broadcast channel) gets cut off.
3. The previous breakpoint for single-column was `@media (max-width: 820px)`, which left laptops in the 1000–1280px range in an uncomfortably squeezed two-column layout with 24px padding and 22px gaps.

## Requirements
- Introduce fluid sizing on laptop screens (`@media (max-width: 1200px)`):
  - `.uview-modal-card`: `max-width: min(940px, calc(100vw - 110px)); padding: 18px 20px;`
  - `.uview-layout`: grid columns `minmax(0, 1fr) 270px; gap: 16px;`
  - `.uview-aside-col .uview-linfa`: slightly more compact padding and plant SVG sizing on compact laptops.
- On low-height viewports (`@media (max-height: 800px)`):
  - Change `.uview-aside-col` from `position: sticky` to `position: static` so the user can scroll naturally to all cards without bottom cards getting stuck offscreen.
  - Scale Linfa plant SVG to prevent excessive vertical space consumption.
- Maintain full responsiveness on mobile (`@media (max-width: 820px)`: single column, stacked layout).

## Status
🟢 **DONE** (2026-11-14)
- Added fluid width and padding for `.uview-modal-card` and `.uview-layout` under `@media (max-width: 1200px)` in `ui/src/style.css`.
- Added compact scaling for `.uview-aside-col .linfa-pot` (110–130px) and `.linfa-panel` so cards beneath (such as River broadcast channels) are not cut off.
- Added `@media (max-height: 800px)` converting `.uview-aside-col` to `position: static` for natural page scrolling on compact vertical viewports.
- Verified in `ui/tests/templateNesting.test.ts`.
