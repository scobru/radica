// Vertical Short-Video Reels Player inside Moments (#media-modal) — TASK-006.
import { escapeHtml as esc } from "./html.ts";
import { filterVideoReels, parseBlobVideoRef, stepReelIndex } from "./reels.ts";
import { videoRef } from "./video.ts";
import { maskProfanity } from "./moderation.ts";
import type { Post } from "./types.ts";

export interface MountedReelVideo {
  video?: HTMLVideoElement;
  cleanup: () => void;
}

export interface ReelsPlayerDeps {
  getPosts: () => Post[];
  getMyPubkey: () => string;
  getHiddenAuthors: () => Set<string>;
  getReportedTargets: () => Set<string>;
  getReportedMedia: () => Set<string>;
  getFollowing: () => Set<string>;
  getAuthorName: (pubkey: string) => string;
  getAuthorAvatar: (pubkey: string) => string;
  shouldMaskBadWords: () => boolean;
  mountVideo: (
    post: Post,
    onProgress: (done: number, total: number, missing: number) => void,
    onReady: (video: HTMLVideoElement) => void
  ) => MountedReelVideo;
  toggleLike: (author: string, postId: string) => Promise<void>;
  openComments: (postId: string, author: string) => void;
  openUserWall: (pubkey: string) => void;
  reportPost: (author: string, postId: string) => Promise<void>;
  hideAuthor: (author: string) => void;
  showToast: (msg: string, isError?: boolean) => void;
  onExit?: () => void;
}

export function createReelsPlayer(deps: ReelsPlayerDeps) {
  const container = document.getElementById("moments-reels-container") as HTMLElement | null;
  let currentIdx = 0;
  let muted = true;
  let reels: Post[] = [];
  let activeMount: MountedReelVideo | null = null;
  let activeVideoEl: HTMLVideoElement | null = null;

  function unmountActiveVideo() {
    if (activeMount) {
      activeMount.cleanup();
      activeMount = null;
    }
    if (activeVideoEl) {
      activeVideoEl.pause();
      activeVideoEl.removeAttribute("src");
      activeVideoEl.load();
      activeVideoEl = null;
    }
  }

  function renderCurrent() {
    if (!container) return;
    unmountActiveVideo();
    reels = filterVideoReels(deps.getPosts(), {
      hiddenAuthors: deps.getHiddenAuthors(),
      reported: deps.getReportedTargets(),
      reportedMedia: deps.getReportedMedia(),
      myPubkey: deps.getMyPubkey(),
      following: deps.getFollowing(),
    });

    if (!reels.length) {
      container.innerHTML = `<div class="reels-empty">No video reels available yet. Share a video post or Moment to start!</div>`;
      return;
    }

    currentIdx = stepReelIndex(currentIdx, 0, reels.length);
    const post = reels[currentIdx];
    const me = deps.getMyPubkey();
    const authorName = deps.getAuthorName(post.author);
    const avatar = deps.getAuthorAvatar(post.author);
    const captionRaw = post.caption || "";
    const caption = deps.shouldMaskBadWords() ? maskProfanity(captionRaw) : captionRaw;
    const likeCount = Object.values(post.likes || {}).filter((l) => l.liked).length;
    const likedByMe = Boolean(me && post.likes?.[me]?.liked);
    const commentCount = Object.keys(post.comments || {}).length;
    const vref = videoRef(post.media_uri);
    const blobRef = parseBlobVideoRef(post.caption);
    const badgeLabel = blobRef ? "Long-form Blob" : vref ? "Moment Video" : "Video";

    container.innerHTML =
      `<div class="reels-stage">` +
        `<div class="reels-viewport" id="reels-viewport">` +
          `<div class="reels-video-wrap" id="reels-video-wrap">` +
            `<div id="reels-loading" class="reels-loading">Loading video from Freenet…</div>` +
          `</div>` +
          `<div class="reels-top-bar">` +
            `<button type="button" class="reels-exit-btn" id="reels-exit-btn" title="Back to Moments">← Moments</button>` +
            `<span class="reels-mobile-counter">${currentIdx + 1} / ${reels.length}</span>` +
          `</div>` +
          `<div class="reels-overlay-bottom">` +
            `<div class="reels-author-row">` +
              `<img class="reels-avatar" src="${esc(avatar)}" alt="" />` +
              `<button type="button" class="reels-author-btn" data-author="${esc(post.author)}">${esc(authorName)}</button>` +
              `<span class="reels-badge">${badgeLabel}</span>` +
            `</div>` +
            (caption ? `<p class="reels-caption">${esc(caption)}</p>` : "") +
          `</div>` +
          `<div class="reels-side-actions">` +
            `<button type="button" class="reels-action-btn ${likedByMe ? "is-liked" : ""}" id="reels-like-btn" title="Like">♥<span>${likeCount}</span></button>` +
            `<button type="button" class="reels-action-btn" id="reels-comments-btn" title="Comments">💬<span>${commentCount}</span></button>` +
            `<button type="button" class="reels-action-btn" id="reels-mute-btn" title="Toggle sound">${muted ? "🔇" : "🔊"}<span>${muted ? "Muted" : "Sound"}</span></button>` +
            (post.author !== me && me
              ? `<button type="button" class="reels-action-btn" id="reels-report-btn" title="Report video">🚩<span>Report</span></button>` +
                `<button type="button" class="reels-action-btn" id="reels-hide-btn" title="Hide author">🚫<span>Hide</span></button>`
              : "") +
          `</div>` +
        `</div>` +
        `<div class="reels-nav-col">` +
          `<button type="button" class="btn-secondary btn-sm" id="reels-prev-btn" ${currentIdx === 0 ? "disabled" : ""} title="Previous (↑)">↑ Prev</button>` +
          `<span class="reels-counter">${currentIdx + 1} / ${reels.length}</span>` +
          `<button type="button" class="btn-secondary btn-sm" id="reels-next-btn" ${currentIdx >= reels.length - 1 ? "disabled" : ""} title="Next (↓)">↓ Next</button>` +
        `</div>` +
      `</div>`;

    const videoWrap = document.getElementById("reels-video-wrap") as HTMLElement | null;
    const loadingEl = document.getElementById("reels-loading") as HTMLElement | null;
    const targetPost = post;

    if (videoWrap) {
      activeMount = deps.mountVideo(
        targetPost,
        (doneN, total, missing) => {
          if (reels[currentIdx]?.id !== targetPost.id || !loadingEl) return;
          if (missing && doneN === 0) {
            loadingEl.textContent = total
              ? `${missing} of ${total} pieces not found on this node yet.`
              : "Video not found on this node yet.";
          } else if (total > 0) {
            loadingEl.textContent = `Loading video… ${doneN}/${total} pieces`;
          }
        },
        (vid) => {
          if (reels[currentIdx]?.id !== targetPost.id || !videoWrap) return;
          vid.id = "reels-active-video";
          vid.className = "reels-video";
          vid.controls = true;
          vid.playsInline = true;
          vid.loop = true;
          vid.autoplay = true;
          vid.muted = muted;
          activeVideoEl = vid;
          if (loadingEl) loadingEl.style.display = "none";
          videoWrap.prepend(vid);
          void vid.play().catch(() => {});
        }
      );
    }

    container.querySelector<HTMLButtonElement>(".reels-author-btn")?.addEventListener("click", () => {
      deps.openUserWall(post.author);
    });

    document.getElementById("reels-like-btn")?.addEventListener("click", async () => {
      const btn = document.getElementById("reels-like-btn");
      if (!btn || !me) {
        await deps.toggleLike(post.author, post.id);
        return;
      }
      const currentlyLiked = Boolean(post.likes?.[me]?.liked);
      const nextLiked = !currentlyLiked;
      if (!post.likes) post.likes = {};
      post.likes[me] = { liked: nextLiked, ts: Date.now(), sig: "" };
      const nextCount = Object.values(post.likes).filter((l) => l.liked).length;
      btn.classList.toggle("is-liked", nextLiked);
      const countEl = btn.querySelector("span");
      if (countEl) countEl.textContent = String(nextCount);
      try {
        await deps.toggleLike(post.author, post.id);
      } catch {
        post.likes[me] = { liked: currentlyLiked, ts: Date.now(), sig: "" };
        const revertCount = Object.values(post.likes).filter((l) => l.liked).length;
        btn.classList.toggle("is-liked", currentlyLiked);
        if (countEl) countEl.textContent = String(revertCount);
      }
    });

    document.getElementById("reels-comments-btn")?.addEventListener("click", () => {
      deps.openComments(post.id, post.author);
    });

    document.getElementById("reels-mute-btn")?.addEventListener("click", () => {
      muted = !muted;
      if (activeVideoEl) activeVideoEl.muted = muted;
      const btn = document.getElementById("reels-mute-btn");
      if (btn) btn.innerHTML = `${muted ? "🔇" : "🔊"}<span>${muted ? "Muted" : "Sound"}</span>`;
    });

    document.getElementById("reels-report-btn")?.addEventListener("click", async () => {
      await deps.reportPost(post.author, post.id);
      renderCurrent();
    });

    document.getElementById("reels-hide-btn")?.addEventListener("click", () => {
      deps.hideAuthor(post.author);
      renderCurrent();
    });

    document.getElementById("reels-prev-btn")?.addEventListener("click", () => {
      currentIdx = stepReelIndex(currentIdx, -1, reels.length);
      renderCurrent();
    });

    document.getElementById("reels-next-btn")?.addEventListener("click", () => {
      currentIdx = stepReelIndex(currentIdx, 1, reels.length);
      renderCurrent();
    });

    document.getElementById("reels-exit-btn")?.addEventListener("click", () => {
      deps.onExit?.();
    });

    const viewportEl = document.getElementById("reels-viewport");
    if (viewportEl) {
      let touchStartY: number | null = null;
      viewportEl.addEventListener("touchstart", (ev) => {
        if (ev.touches.length === 1) touchStartY = ev.touches[0].clientY;
      }, { passive: true });
      viewportEl.addEventListener("touchend", (ev) => {
        if (touchStartY === null || ev.changedTouches.length === 0) return;
        const dy = ev.changedTouches[0].clientY - touchStartY;
        touchStartY = null;
        if (dy < -45 && currentIdx < reels.length - 1) {
          currentIdx = stepReelIndex(currentIdx, 1, reels.length);
          renderCurrent();
        } else if (dy > 45 && currentIdx > 0) {
          currentIdx = stepReelIndex(currentIdx, -1, reels.length);
          renderCurrent();
        }
      }, { passive: true });
    }
  }

  return {
    show: () => {
      if (!container) return;
      document.body.classList.add("reels-fullscreen-mobile");
      container.style.display = "";
      renderCurrent();
    },
    hide: () => {
      if (!container) return;
      document.body.classList.remove("reels-fullscreen-mobile");
      unmountActiveVideo();
      container.style.display = "none";
    },
    step: (delta: number) => {
      if (!container || container.style.display === "none") return;
      currentIdx = stepReelIndex(currentIdx, delta, reels.length);
      renderCurrent();
    },
  };
}
