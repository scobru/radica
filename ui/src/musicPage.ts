// SoundCloud-style FreeTunes Stream (#music-modal) & Persistent Global Mini-Player (#global-audio-player) — TASK-008.
import { escapeHtml as esc } from "./html.ts";
import {
  createAudioQueueState,
  enqueueInQueue,
  filterFreetunesReleases,
  formatAudioTime,
  nextQueueIndex,
  playInQueue,
  prevQueueIndex,
  trackWaveformBars,
  type AudioQueueState,
  type AudioQueueTrack,
} from "./audioPlayer.ts";
import {
  freetunesReleaseHref,
  loadCachedRelease,
  loadCoverUrl,
  streamFreetunesTrack,
  type FtReleaseItem,
} from "./freetunes.ts";
import { maskProfanity } from "./moderation.ts";
import { defaultNodeOrigin } from "./orto.ts";

export interface MusicPageDeps {
  loadDirectory: () => Promise<FtReleaseItem[]>;
  getRawContract: (id: string) => Promise<Uint8Array | null>;
  getMyPubkey: () => string;
  getHiddenAuthors: () => Set<string>;
  getFollowing: () => Set<string>;
  shouldMaskBadWords: () => boolean;
  openUserWall: (pubkey: string) => void;
  toggleFollow: (pubkey: string) => Promise<boolean>;
  shareReleaseToFeed: (release: FtReleaseItem) => void;
  hideAuthor: (pubkey: string) => void;
  showToast: (msg: string, isError?: boolean) => void;
  closeModal: () => void;
}

export function createMusicPage(deps: MusicPageDeps) {
  const modal = document.getElementById("music-modal") as HTMLElement | null;
  const countPill = document.getElementById("music-count-pill") as HTMLElement | null;
  const closeBtn = document.getElementById("music-close-btn") as HTMLButtonElement | null;
  const refreshBtn = document.getElementById("music-refresh-btn") as HTMLButtonElement | null;
  const searchInput = document.getElementById("music-search-input") as HTMLInputElement | null;
  const tabsEl = document.getElementById("music-filter-tabs") as HTMLElement | null;
  const listEl = document.getElementById("music-releases-list") as HTMLElement | null;

  // Global Persistent Mini-Player elements
  const playerBar = document.getElementById("global-audio-player") as HTMLElement | null;
  const audioEl = document.getElementById("global-audio-el") as HTMLAudioElement | null;
  const coverEl = document.getElementById("gap-cover") as HTMLElement | null;
  const titleEl = document.getElementById("gap-title") as HTMLElement | null;
  const artistEl = document.getElementById("gap-artist") as HTMLElement | null;
  const playBtn = document.getElementById("gap-play-btn") as HTMLButtonElement | null;
  const prevBtn = document.getElementById("gap-prev-btn") as HTMLButtonElement | null;
  const nextBtn = document.getElementById("gap-next-btn") as HTMLButtonElement | null;
  const seekInput = document.getElementById("gap-seek") as HTMLInputElement | null;
  const timeEl = document.getElementById("gap-time") as HTMLElement | null;
  const volInput = document.getElementById("gap-volume") as HTMLInputElement | null;
  const queuePill = document.getElementById("gap-queue-pill") as HTMLElement | null;
  const closePlayerBtn = document.getElementById("gap-close-btn") as HTMLButtonElement | null;

  let directoryItems: FtReleaseItem[] = [];
  let onlyFollowing = false;
  let loadedDir = false;
  let state: AudioQueueState = createAudioQueueState();
  let playGen = 0;
  let isSeeking = false;
  let streamProgressText = "";

  const cleanText = (t: string) => (deps.shouldMaskBadWords() ? maskProfanity(t) : t);

  function effectiveDuration(): number {
    if (audioEl && Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
      return audioEl.duration;
    }
    const track = state.queue[state.currentIndex];
    return track?.durationMs ? track.durationMs / 1000 : 0;
  }

  function syncTrackRows() {
    if (!listEl) return;
    const cur = state.queue[state.currentIndex];
    const isPlaying = Boolean(audioEl && !audioEl.paused);
    listEl.querySelectorAll<HTMLElement>(".music-track-row").forEach((row) => {
      const rid = row.dataset.releaseId;
      const idx = Number(row.dataset.idx);
      const active = Boolean(cur && cur.releaseId === rid && cur.trackIndex === idx);
      row.classList.toggle("is-active", active);
      const btn = row.querySelector<HTMLButtonElement>(".music-play-track-btn");
      if (btn) {
        btn.textContent = active && isPlaying ? "❚❚" : "▶";
        btn.setAttribute("aria-label", active && isPlaying ? "Pause" : "Play");
      }
    });
  }

  function syncPlayerBar() {
    if (!playerBar || !audioEl) return;
    const track = state.queue[state.currentIndex];
    if (!track) {
      playerBar.style.display = "none";
      document.body.classList.remove("has-global-audio-player");
      syncTrackRows();
      return;
    }
    playerBar.style.display = "flex";
    document.body.classList.add("has-global-audio-player");
    if (titleEl) titleEl.textContent = cleanText(track.title);
    if (artistEl) artistEl.textContent = cleanText(`${track.artist} · ${track.releaseTitle}`);
    if (playBtn) playBtn.textContent = audioEl.paused ? "▶" : "❚❚";
    if (prevBtn) prevBtn.disabled = state.currentIndex <= 0;
    if (nextBtn) nextBtn.disabled = nextQueueIndex(state) === -1;
    if (queuePill) queuePill.textContent = `${state.currentIndex + 1}/${state.queue.length}`;
    if (coverEl) {
      coverEl.innerHTML = "♪";
      if (track.coverId) {
        void loadCoverUrl(track.coverId, deps.getRawContract).then((url) => {
          if (url && state.queue[state.currentIndex]?.coverId === track.coverId) {
            coverEl.innerHTML = `<img src="${esc(url)}" alt="" />`;
          }
        });
      }
    }
    syncTrackRows();
  }

  async function startCurrentTrack() {
    if (!audioEl) return;
    const track = state.queue[state.currentIndex];
    if (!track) return;
    const gen = ++playGen;
    if (audioEl.src.startsWith("blob:")) URL.revokeObjectURL(audioEl.src);
    audioEl.pause();
    audioEl.removeAttribute("src");
    audioEl.load();
    if (seekInput) seekInput.value = "0";
    streamProgressText = "Loading…";
    syncPlayerBar();
    if (timeEl) timeEl.textContent = streamProgressText;

    // Pause any inline feed FreeTunes players
    document.querySelectorAll<HTMLAudioElement>(".ft-card audio, .ft-profile-card audio, #cm-shared-audio").forEach((a) => {
      a.pause();
    });

    try {
      await streamFreetunesTrack(
        audioEl,
        track.chunks,
        deps.getRawContract,
        (d, n) => {
          if (gen !== playGen) return;
          streamProgressText = d < n ? `Loading ${d}/${n}` : "";
          if (timeEl && d < n && audioEl.paused) {
            timeEl.textContent = streamProgressText;
          }
        },
        () => gen === playGen
      );
      if (gen === playGen) {
        streamProgressText = "";
        syncPlayerBar();
      }
    } catch {
      if (gen === playGen) {
        streamProgressText = "";
        deps.showToast("Could not load audio stream from Freenet.", true);
        if (timeEl) timeEl.textContent = "Error";
      }
    }
  }

  function playTrack(track: AudioQueueTrack) {
    state = playInQueue(state, track);
    void startCurrentTrack();
  }

  function queueTrack(track: AudioQueueTrack) {
    const wasEmpty = state.queue.length === 0;
    state = enqueueInQueue(state, track);
    syncPlayerBar();
    deps.showToast(`Added "${track.title}" to queue.`);
    if (wasEmpty) void startCurrentTrack();
  }

  function renderReleases() {
    if (!listEl) return;
    const filtered = filterFreetunesReleases(directoryItems, {
      query: searchInput?.value || "",
      following: deps.getFollowing(),
      onlyFollowing,
      hiddenAuthors: deps.getHiddenAuthors(),
    });

    if (countPill) {
      countPill.textContent = `${filtered.length} ${filtered.length === 1 ? "release" : "releases"}`;
    }

    if (!filtered.length) {
      listEl.innerHTML = `<div class="music-empty">No FreeTunes releases found matching this filter.</div>`;
      return;
    }

    const origin = defaultNodeOrigin();
    const followingSet = deps.getFollowing();
    const myPubkey = deps.getMyPubkey();
    listEl.innerHTML = filtered
      .slice(0, 60)
      .map((item) => {
        const href = freetunesReleaseHref(item.id, item.params, 0, origin);
        const ms = item.ts > 1e12 ? item.ts : item.ts * 1000;
        const dateStr = item.ts ? new Date(ms).toLocaleDateString() : "";
        const isFollowing = followingSet.has(item.owner);
        const canFollow = Boolean(item.owner && item.owner !== myPubkey);
        return (
          `<article class="music-release-card" data-release-id="${esc(item.id)}" data-params="${esc(item.params)}" data-owner="${esc(item.owner)}">` +
            `<div class="music-release-head">` +
              `<div class="music-release-cover" data-cover="${esc(item.cover || "")}">♪</div>` +
              `<div class="music-release-meta">` +
                `<h4 class="music-release-title">${esc(cleanText(item.title))}</h4>` +
                `<div class="music-release-sub">` +
                  `<button type="button" class="music-artist-btn" data-owner="${esc(item.owner)}">${esc(cleanText(item.artist))}</button>` +
                  (dateStr ? `<span class="music-dot">·</span><span>${esc(dateStr)}</span>` : "") +
                `</div>` +
              `</div>` +
              `<div class="music-release-actions">` +
                (canFollow
                  ? `<button type="button" class="btn-secondary btn-sm music-follow-btn ${isFollowing ? "is-following" : ""}" data-owner="${esc(item.owner)}">${isFollowing ? "✓ Following" : "+ Follow"}</button>`
                  : "") +
                `<button type="button" class="btn-secondary btn-sm music-share-btn" data-release-id="${esc(item.id)}">Share</button>` +
                `<button type="button" class="btn-secondary btn-sm music-hide-btn" data-owner="${esc(item.owner)}" title="Hide artist">🚫</button>` +
                `<a class="btn-secondary btn-sm" href="${esc(href)}" target="_blank" rel="noopener noreferrer">↗</a>` +
              `</div>` +
            `</div>` +
            `<div class="music-tracklist" data-release-id="${esc(item.id)}">` +
              `<div class="music-tracks-loading">Loading tracks…</div>` +
            `</div>` +
          `</article>`
        );
      })
      .join("");

    // Bind card actions
    listEl.querySelectorAll<HTMLButtonElement>(".music-artist-btn").forEach((btn) => {
      btn.onclick = () => {
        const owner = btn.dataset.owner;
        if (owner) deps.openUserWall(owner);
      };
    });

    listEl.querySelectorAll<HTMLButtonElement>(".music-follow-btn").forEach((btn) => {
      btn.onclick = async () => {
        const owner = btn.dataset.owner;
        if (!owner) return;
        btn.disabled = true;
        try {
          const nowFollowing = await deps.toggleFollow(owner);
          if (onlyFollowing && !nowFollowing) {
            renderReleases();
            return;
          }
          listEl.querySelectorAll<HTMLButtonElement>(".music-follow-btn").forEach((b) => {
            if (b.dataset.owner === owner) {
              b.classList.toggle("is-following", nowFollowing);
              b.textContent = nowFollowing ? "✓ Following" : "+ Follow";
            }
          });
        } finally {
          btn.disabled = false;
        }
      };
    });

    listEl.querySelectorAll<HTMLButtonElement>(".music-share-btn").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.releaseId;
        const item = directoryItems.find((r) => r.id === id);
        if (item) deps.shareReleaseToFeed(item);
      };
    });

    listEl.querySelectorAll<HTMLButtonElement>(".music-hide-btn").forEach((btn) => {
      btn.onclick = () => {
        const owner = btn.dataset.owner;
        if (!owner) return;
        deps.hideAuthor(owner);
        renderReleases();
      };
    });

    // Hydrate covers and SoundCloud-style tracklists asynchronously
    listEl.querySelectorAll<HTMLElement>(".music-release-cover[data-cover]").forEach((covEl) => {
      const cov = covEl.dataset.cover;
      if (!cov) return;
      void loadCoverUrl(cov, deps.getRawContract).then((url) => {
        if (url) covEl.innerHTML = `<img src="${esc(url)}" alt="Cover" loading="lazy" />`;
      });
    });

    listEl.querySelectorAll<HTMLElement>(".music-tracklist[data-release-id]").forEach((tlEl) => {
      const id = tlEl.dataset.releaseId!;
      const item = filtered.find((r) => r.id === id);
      if (!item) return;

      void loadCachedRelease(id, deps.getRawContract).then((rel) => {
        if (!rel || !rel.tracks.length) {
          tlEl.innerHTML = `<div class="music-tracks-loading">Release metadata unavailable on this node yet.</div>`;
          return;
        }
        tlEl.innerHTML = rel.tracks
          .map((tr, idx) => {
            const bars = trackWaveformBars(`${id}:${idx}:${tr.title}`);
            const barsHtml = bars.map((h) => `<span style="height:${h}%"></span>`).join("");
            const dur = formatAudioTime((tr.ms || 0) / 1000);
            return (
              `<div class="music-track-row" data-release-id="${esc(item.id)}" data-idx="${idx}">` +
                `<button type="button" class="btn-primary btn-sm music-play-track-btn" data-idx="${idx}" aria-label="Play ${esc(tr.title)}">▶</button>` +
                `<div class="music-track-info">` +
                  `<span class="music-track-title">${idx + 1}. ${esc(cleanText(tr.title))}</span>` +
                  `<div class="music-waveform" aria-hidden="true">${barsHtml}</div>` +
                `</div>` +
                `<span class="music-track-dur">${dur}</span>` +
                `<button type="button" class="btn-secondary btn-sm music-queue-track-btn" data-idx="${idx}" title="Add to queue">+ Queue</button>` +
              `</div>`
            );
          })
          .join("");

        syncTrackRows();

        tlEl.querySelectorAll<HTMLButtonElement>(".music-play-track-btn").forEach((btn) => {
          btn.onclick = () => {
            const idx = Number(btn.dataset.idx) || 0;
            const tr = rel.tracks[idx];
            if (!tr) return;
            const cur = state.queue[state.currentIndex];
            if (cur && cur.releaseId === item.id && cur.trackIndex === idx && audioEl && audioEl.src) {
              if (audioEl.paused) void audioEl.play().catch(() => {});
              else audioEl.pause();
              return;
            }
            playTrack({
              releaseId: item.id,
              params: item.params,
              trackIndex: idx,
              title: tr.title,
              artist: rel.artist || item.artist,
              releaseTitle: rel.title || item.title,
              owner: item.owner,
              coverId: rel.cover || item.cover,
              durationMs: tr.ms,
              chunks: tr.chunks,
            });
          };
        });

        tlEl.querySelectorAll<HTMLButtonElement>(".music-queue-track-btn").forEach((btn) => {
          btn.onclick = () => {
            const idx = Number(btn.dataset.idx) || 0;
            const tr = rel.tracks[idx];
            if (!tr) return;
            queueTrack({
              releaseId: item.id,
              params: item.params,
              trackIndex: idx,
              title: tr.title,
              artist: rel.artist || item.artist,
              releaseTitle: rel.title || item.title,
              owner: item.owner,
              coverId: rel.cover || item.cover,
              durationMs: tr.ms,
              chunks: tr.chunks,
            });
          };
        });
      });
    });
  }

  async function loadAndRender(force = false) {
    if (loadedDir && !force) {
      renderReleases();
      return;
    }
    if (listEl) listEl.innerHTML = `<div class="music-empty">Loading FreeTunes directory from Freenet…</div>`;
    try {
      directoryItems = await deps.loadDirectory();
      loadedDir = true;
    } catch {
      directoryItems = [];
    }
    renderReleases();
  }

  // Wire UI & Persistent Mini-Player events
  closeBtn?.addEventListener("click", () => deps.closeModal());
  refreshBtn?.addEventListener("click", () => void loadAndRender(true));
  searchInput?.addEventListener("input", () => renderReleases());

  tabsEl?.querySelectorAll<HTMLButtonElement>(".music-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      onlyFollowing = btn.dataset.filter === "following";
      tabsEl.querySelectorAll(".music-filter-btn").forEach((b) => b.classList.toggle("active", b === btn));
      renderReleases();
    });
  });

  if (audioEl) {
    audioEl.volume = state.volume;
    audioEl.addEventListener("play", () => syncPlayerBar());
    audioEl.addEventListener("pause", () => syncPlayerBar());
    audioEl.addEventListener("timeupdate", () => {
      if (isSeeking) return;
      const dur = effectiveDuration();
      if (timeEl) {
        const cur = formatAudioTime(audioEl.currentTime);
        const durStr = dur > 0 ? formatAudioTime(dur) : "0:00";
        timeEl.textContent = streamProgressText ? `${cur} / ${durStr} · ${streamProgressText}` : `${cur} / ${durStr}`;
      }
      if (seekInput && dur > 0) {
        seekInput.value = String(Math.min(1000, Math.round((audioEl.currentTime / dur) * 1000)));
      }
    });
    audioEl.addEventListener("ended", () => {
      const nextIdx = nextQueueIndex(state);
      if (nextIdx !== -1) {
        state = { ...state, currentIndex: nextIdx };
        void startCurrentTrack();
      } else {
        syncPlayerBar();
      }
    });
  }

  playBtn?.addEventListener("click", () => {
    if (!audioEl) return;
    if (audioEl.paused) void audioEl.play();
    else audioEl.pause();
  });

  prevBtn?.addEventListener("click", () => {
    const prevIdx = prevQueueIndex(state);
    if (prevIdx !== -1) {
      state = { ...state, currentIndex: prevIdx };
      void startCurrentTrack();
    }
  });

  nextBtn?.addEventListener("click", () => {
    const nextIdx = nextQueueIndex(state);
    if (nextIdx !== -1) {
      state = { ...state, currentIndex: nextIdx };
      void startCurrentTrack();
    }
  });

  seekInput?.addEventListener("pointerdown", () => {
    isSeeking = true;
  });
  seekInput?.addEventListener("pointerup", () => {
    isSeeking = false;
  });
  seekInput?.addEventListener("input", () => {
    const dur = effectiveDuration();
    if (!audioEl || dur <= 0) return;
    let target = (Number(seekInput.value) / 1000) * dur;
    if (audioEl.seekable.length > 0) {
      const maxSeek = audioEl.seekable.end(audioEl.seekable.length - 1);
      if (Number.isFinite(maxSeek) && target > maxSeek) target = maxSeek;
    }
    audioEl.currentTime = target;
    if (timeEl) {
      timeEl.textContent = `${formatAudioTime(target)} / ${formatAudioTime(dur)}`;
    }
  });
  seekInput?.addEventListener("change", () => {
    isSeeking = false;
  });

  volInput?.addEventListener("input", () => {
    const v = Math.max(0, Math.min(1, Number(volInput.value)));
    state = { ...state, volume: v };
    if (audioEl) audioEl.volume = v;
  });

  closePlayerBtn?.addEventListener("click", () => {
    playGen++;
    if (audioEl) {
      audioEl.pause();
      audioEl.removeAttribute("src");
    }
    state = createAudioQueueState();
    syncPlayerBar();
  });

  return {
    open: () => {
      if (!modal) return;
      modal.style.display = "flex";
      void loadAndRender(false);
    },
    playTrack,
    queueTrack,
  };
}

