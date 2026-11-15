// Interactive controller for the Living Tree (#tree-modal) visual network navigator.
import {
  baseViewBoxDims,
  buildTreeGraph,
  renderTreeInspectorHtml,
  renderTreeSvg,
  viewBoxFor,
  type TreeGraphModel,
  type TreePeerInput,
  type TreeScope,
  type TreeSelection,
  type TreeViewMode,
} from "./treeGraph.ts";
import { escapeHtml } from "./html.ts";
import type { Community, Post } from "./types.ts";

export interface TreePageDeps {
  getPosts: () => Post[];
  getCommunities: () => Community[];
  getPeers: () => TreePeerInput[];
  getMyPubkey: () => string;
  getMyName: () => string;
  getDisplayName: (pk: string) => string;
  refreshNetwork?: () => Promise<void>;
  onOpenPost: (postId: string, author: string) => void;
  onOpenProfile: (pubkey: string) => void;
  onOpenCommunity: (commId: string) => void;
  onOpenMilestones: () => void;
}

let deps: TreePageDeps | null = null;
let mode: TreeViewMode = "full";
let scope: TreeScope = "all";
let communityFilter = "";
let searchQuery = "";
let focusAuthor: string | null = null;
let selection: TreeSelection = null;
let timeProgress = 1;
let zoom = 1;
let panX = 0;
let panY = 0;
let growthRaf: number | null = null;
let lastModel: TreeGraphModel | null = null;
let initialized = false;

const treeModal = () => document.getElementById("tree-modal") as HTMLElement | null;
const isTreeOpen = () => {
  const el = treeModal();
  return !!el && el.style.display !== "none" && el.style.display !== "";
};

function stopGrowthAnimation() {
  if (growthRaf !== null) {
    cancelAnimationFrame(growthRaf);
    growthRaf = null;
  }
  const playBtn = document.getElementById("tree-play-growth-btn");
  if (playBtn) {
    playBtn.textContent = "▶ Watch Grow";
    playBtn.setAttribute("aria-pressed", "false");
  }
}

function updateTimeControls(model: TreeGraphModel) {
  const slider = document.getElementById("tree-time-slider") as HTMLInputElement | null;
  const label = document.getElementById("tree-time-label");
  if (slider) {
    const val = String(Math.round(timeProgress * 100));
    if (slider.value !== val) slider.value = val;
  }
  if (label) {
    if (timeProgress >= 0.995) {
      label.textContent = "Now · 100%";
    } else {
      const d = new Date(model.cutoffTs);
      const dateStr = Number.isFinite(d.getTime())
        ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : "";
      label.textContent = `${dateStr ? `${dateStr} · ` : ""}${Math.round(timeProgress * 100)}%`;
    }
  }
}

function populateCommunitySelect(communities: Community[]) {
  const sel = document.getElementById("tree-comm-select") as HTMLSelectElement | null;
  if (!sel) return;
  const sorted = [...communities].sort((a, b) => (b.members?.length ?? 0) - (a.members?.length ?? 0));
  const desired = communityFilter;
  const optionsHtml =
    `<option value="">All boughs &amp; communities</option>` +
    sorted.map((c) => `<option value="${escapeHtml(c.id)}">r/${escapeHtml(c.slug)}</option>`).join("");
  if (sel.innerHTML !== optionsHtml) sel.innerHTML = optionsHtml;
  sel.value = sorted.some((c) => c.id === desired) ? desired : "";
  if (sel.value !== communityFilter) communityFilter = sel.value;
}

function renderTreeView(cachedData?: { posts: Post[]; communities: Community[]; peers: TreePeerInput[] }) {
  if (!deps) return;
  const posts = cachedData?.posts ?? deps.getPosts();
  const communities = cachedData?.communities ?? deps.getCommunities();
  const peers = cachedData?.peers ?? deps.getPeers();
  populateCommunitySelect(communities);

  const model = buildTreeGraph({
    posts,
    communities,
    peers,
    myPubkey: deps.getMyPubkey(),
    myName: deps.getMyName(),
    mode,
    scope,
    communityFilter,
    searchQuery,
    focusAuthor,
    timeProgress,
    selection,
  });
  lastModel = model;

  const pill = document.getElementById("tree-stage-pill");
  if (pill) {
    pill.textContent = `${model.stage.name} · ${model.stats.users} roots · ${model.stats.posts} posts`;
  }

  const svgHost = document.getElementById("tree-svg-container");
  if (svgHost) {
    svgHost.innerHTML = renderTreeSvg(model, { mode, selection, zoom, panX, panY });
  }

  const inspector = document.getElementById("tree-inspector");
  if (inspector) {
    inspector.innerHTML = renderTreeInspectorHtml(model, selection, posts, communities, deps.getDisplayName);
  }

  updateTimeControls(model);
}

function getTreeSvgEl(): SVGSVGElement | null {
  const svgHost = document.getElementById("tree-svg-container");
  return svgHost?.querySelector<SVGSVGElement>("svg.radica-tree-svg") ?? null;
}

function applySvgViewBoxOnly() {
  if (!lastModel) return renderTreeView();
  const svg = getTreeSvgEl();
  if (svg) {
    svg.style.transform = "";
    svg.setAttribute("viewBox", viewBoxFor(mode, zoom, panX, panY));
  } else {
    renderTreeView();
  }
}

function setMode(nextMode: TreeViewMode) {
  mode = nextMode;
  document.querySelectorAll<HTMLButtonElement>("[data-tree-mode]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.treeMode === mode);
  });
  zoom = 1;
  panX = 0;
  panY = 0;
  renderTreeView();
}

function setScope(nextScope: TreeScope) {
  scope = nextScope;
  document.querySelectorAll<HTMLButtonElement>("[data-tree-scope]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.treeScope === scope);
  });
  renderTreeView();
}

function startGrowthAnimation() {
  if (growthRaf !== null) {
    stopGrowthAnimation();
    return;
  }
  const playBtn = document.getElementById("tree-play-growth-btn");
  if (playBtn) {
    playBtn.textContent = "⏸ Pause";
    playBtn.setAttribute("aria-pressed", "true");
  }
  if (timeProgress >= 0.99) timeProgress = 0.02;
  const startProgress = timeProgress;
  const durationMs = Math.max(1800, (1 - startProgress) * 7000);
  const startTs = performance.now();
  const isMobileLike =
    window.innerWidth <= 900 || (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches);
  const minFrameMs = isMobileLike ? 50 : 0;
  let lastRenderTs = 0;

  const cachedData = deps
    ? {
        posts: deps.getPosts(),
        communities: deps.getCommunities(),
        peers: deps.getPeers(),
      }
    : undefined;

  const step = (now: number) => {
    if (!isTreeOpen()) {
      stopGrowthAnimation();
      return;
    }
    const elapsed = now - startTs;
    const frac = Math.min(1, elapsed / durationMs);
    // Smooth easeInOut curve for natural botanical germination, growth, and gentle settling
    const eased = frac < 0.5 ? 2 * frac * frac : 1 - Math.pow(-2 * frac + 2, 2) / 2;
    timeProgress = Math.min(1, startProgress + (1 - startProgress) * eased);
    if (frac >= 1 || now - lastRenderTs >= minFrameMs) {
      lastRenderTs = now;
      renderTreeView(cachedData);
    }
    if (frac < 1) {
      growthRaf = requestAnimationFrame(step);
    } else {
      timeProgress = 1;
      renderTreeView();
      stopGrowthAnimation();
    }
  };
  growthRaf = requestAnimationFrame(step);
}

function handleNodeSelect(nodeEl: Element) {
  const el = nodeEl as HTMLElement;
  const kind = el.dataset.nodeType;
  if (kind === "post" && el.dataset.postId && el.dataset.author) {
    selection = { type: "post", postId: el.dataset.postId, author: el.dataset.author };
    focusAuthor = null;
  } else if (kind === "comment" && el.dataset.postId && el.dataset.commentId && el.dataset.author) {
    selection = {
      type: "comment",
      postId: el.dataset.postId,
      commentId: el.dataset.commentId,
      author: el.dataset.author,
    };
    focusAuthor = null;
  } else if (kind === "root" && el.dataset.pubkey) {
    selection = { type: "root", pubkey: el.dataset.pubkey };
    focusAuthor = el.dataset.pubkey;
  } else if (kind === "bough" && el.dataset.boughId) {
    selection = { type: "bough", boughId: el.dataset.boughId };
    focusAuthor = null;
  }
  renderTreeView();
}

function handleNodeDoubleClick(nodeEl: Element) {
  if (!deps) return;
  const el = nodeEl as HTMLElement;
  const kind = el.dataset.nodeType;
  if (kind === "post" && el.dataset.postId && el.dataset.author) {
    deps.onOpenPost(el.dataset.postId, el.dataset.author);
  } else if (kind === "comment" && el.dataset.postId) {
    const post = deps.getPosts().find((p) => p.id === el.dataset.postId);
    if (post) deps.onOpenPost(post.id, post.author);
  } else if (kind === "root" && el.dataset.pubkey) {
    deps.onOpenProfile(el.dataset.pubkey);
  } else if (kind === "bough" && el.dataset.boughId && !el.dataset.boughId.startsWith("bough:")) {
    deps.onOpenCommunity(el.dataset.boughId);
  }
}

export function initTreePage(nextDeps: TreePageDeps): void {
  deps = nextDeps;
  if (initialized) return;
  initialized = true;

  document.querySelectorAll<HTMLButtonElement>("[data-tree-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = btn.dataset.treeMode as TreeViewMode;
      if (m) setMode(m);
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-tree-scope]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = btn.dataset.treeScope as TreeScope;
      if (s) setScope(s);
    });
  });

  document.getElementById("tree-comm-select")?.addEventListener("change", (e) => {
    communityFilter = (e.target as HTMLSelectElement).value;
    selection = null;
    renderTreeView();
  });

  let searchTimer = 0;
  document.getElementById("tree-search-input")?.addEventListener("input", (e) => {
    searchQuery = (e.target as HTMLInputElement).value;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => renderTreeView(), 90);
  });

  document.getElementById("tree-time-slider")?.addEventListener("input", (e) => {
    stopGrowthAnimation();
    timeProgress = Math.max(0, Math.min(1, Number((e.target as HTMLInputElement).value) / 100));
    renderTreeView();
  });

  document.getElementById("tree-play-growth-btn")?.addEventListener("click", () => {
    startGrowthAnimation();
  });

  document.getElementById("tree-zoom-in-btn")?.addEventListener("click", () => {
    zoom = Math.min(3.5, zoom * 1.25);
    applySvgViewBoxOnly();
  });
  document.getElementById("tree-zoom-out-btn")?.addEventListener("click", () => {
    zoom = Math.max(0.5, zoom / 1.25);
    applySvgViewBoxOnly();
  });
  document.getElementById("tree-zoom-reset-btn")?.addEventListener("click", () => {
    zoom = 1;
    panX = 0;
    panY = 0;
    applySvgViewBoxOnly();
  });

  const canvasWrap = document.getElementById("tree-canvas-wrap");
  if (canvasWrap) {
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = false;
    let gestureRect: DOMRect | null = null;
    let originZoom = zoom;
    let originPanX = panX;
    let originPanY = panY;
    let panAnchorX = 0;
    let panAnchorY = 0;
    let pinchDist0 = 0;
    let pinchMid0X = 0;
    let pinchMid0Y = 0;
    let previewTx = 0;
    let previewTy = 0;
    let previewScale = 1;
    let transformRaf: number | null = null;
    let wheelRaf: number | null = null;

    const getScaleFit = (rect: DOMRect) => {
      const [, , baseW, baseH] = baseViewBoxDims(mode);
      if (rect.width <= 0 || rect.height <= 0) return 1;
      return Math.min(rect.width / baseW, rect.height / baseH);
    };

    const schedulePreviewTransform = () => {
      if (transformRaf !== null) return;
      transformRaf = requestAnimationFrame(() => {
        transformRaf = null;
        const svg = getTreeSvgEl();
        if (!svg) return;
        svg.style.transformOrigin = "center center";
        svg.style.transform = `translate3d(${previewTx.toFixed(1)}px, ${previewTy.toFixed(1)}px, 0) scale(${previewScale.toFixed(4)})`;
      });
    };

    const resetGestureBaseline = () => {
      gestureRect = canvasWrap.getBoundingClientRect();
      originZoom = zoom;
      originPanX = panX;
      originPanY = panY;
      previewTx = 0;
      previewTy = 0;
      previewScale = 1;
      const pts = [...pointers.values()];
      if (pts.length === 1) {
        panAnchorX = pts[0].x;
        panAnchorY = pts[0].y;
      } else if (pts.length >= 2) {
        const cx = gestureRect.left + gestureRect.width / 2;
        const cy = gestureRect.top + gestureRect.height / 2;
        pinchDist0 = Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
        pinchMid0X = (pts[0].x + pts[1].x) / 2 - cx;
        pinchMid0Y = (pts[0].y + pts[1].y) / 2 - cy;
      }
    };

    const commitGestureTransform = () => {
      if (transformRaf !== null) {
        cancelAnimationFrame(transformRaf);
        transformRaf = null;
      }
      if (gestureRect && (previewTx !== 0 || previewTy !== 0 || previewScale !== 1)) {
        const scaleFit = getScaleFit(gestureRect);
        const nextZoom = Math.max(0.5, Math.min(3.5, originZoom * previewScale));
        panX = originPanX + previewTx / (scaleFit * nextZoom);
        panY = originPanY + previewTy / (scaleFit * nextZoom);
        zoom = nextZoom;
      }
      previewTx = 0;
      previewTy = 0;
      previewScale = 1;
      applySvgViewBoxOnly();
    };

    canvasWrap.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest(".tree-zoom-controls")) return;
      if (pointers.size === 0) {
        moved = false;
      } else {
        commitGestureTransform();
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvasWrap.classList.add("is-interacting");
      resetGestureBaseline();
    });

    window.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!gestureRect) gestureRect = canvasWrap.getBoundingClientRect();

      const pts = [...pointers.values()];
      if (pts.length === 1) {
        const dx = pts[0].x - panAnchorX;
        const dy = pts[0].y - panAnchorY;
        if (Math.hypot(dx, dy) > 5) moved = true;
        if (!moved) return;
        previewTx = dx;
        previewTy = dy;
        previewScale = 1;
        schedulePreviewTransform();
      } else if (pts.length >= 2) {
        moved = true;
        const cx = gestureRect.left + gestureRect.width / 2;
        const cy = gestureRect.top + gestureRect.height / 2;
        const dist = Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
        const midX = (pts[0].x + pts[1].x) / 2 - cx;
        const midY = (pts[0].y + pts[1].y) / 2 - cy;
        const targetZoom = Math.max(0.5, Math.min(3.5, originZoom * (dist / pinchDist0)));
        previewScale = targetZoom / originZoom;
        previewTx = midX - previewScale * pinchMid0X;
        previewTy = midY - previewScale * pinchMid0Y;
        schedulePreviewTransform();
      }
    });

    const endPointer = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      commitGestureTransform();
      pointers.delete(e.pointerId);
      if (pointers.size > 0) {
        resetGestureBaseline();
      } else {
        canvasWrap.classList.remove("is-interacting");
        gestureRect = null;
      }
    };

    window.addEventListener("pointerup", endPointer);
    window.addEventListener("pointercancel", endPointer);

    canvasWrap.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        zoom = Math.max(0.5, Math.min(3.5, zoom * factor));
        if (wheelRaf === null) {
          wheelRaf = requestAnimationFrame(() => {
            wheelRaf = null;
            applySvgViewBoxOnly();
          });
        }
      },
      { passive: false }
    );

    canvasWrap.addEventListener("click", (e) => {
      if (moved) {
        moved = false;
        return;
      }
      if ((e.target as HTMLElement).closest(".tree-zoom-controls")) return;
      const node = (e.target as Element).closest(".tree-node");
      if (node) {
        handleNodeSelect(node);
      } else if (selection || focusAuthor) {
        selection = null;
        focusAuthor = null;
        renderTreeView();
      }
    });

    canvasWrap.addEventListener("dblclick", (e) => {
      const node = (e.target as Element).closest(".tree-node");
      if (node) handleNodeDoubleClick(node);
    });

    canvasWrap.addEventListener("keydown", (e) => {
      const node = (e.target as Element).closest(".tree-node");
      if (node && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        handleNodeSelect(node);
      }
    });
  }

  document.getElementById("tree-inspector")?.addEventListener("click", (e) => {
    if (!deps) return;
    const btn = (e.target as HTMLElement).closest<HTMLElement>("button");
    if (!btn) return;

    if (btn.dataset.treeClearSelection) {
      selection = null;
      focusAuthor = null;
      renderTreeView();
      return;
    }
    if (btn.dataset.treeOpenPost && btn.dataset.treeAuthor) {
      deps.onOpenPost(btn.dataset.treeOpenPost, btn.dataset.treeAuthor);
      return;
    }
    if (btn.dataset.treeOpenProfile) {
      deps.onOpenProfile(btn.dataset.treeOpenProfile);
      return;
    }
    if (btn.dataset.treeOpenComm) {
      deps.onOpenCommunity(btn.dataset.treeOpenComm);
      return;
    }
    if (btn.dataset.treeFilterComm) {
      communityFilter = btn.dataset.treeFilterComm;
      selection = null;
      renderTreeView();
      return;
    }
    if (btn.dataset.treeFocusAuthor) {
      const pk = btn.dataset.treeFocusAuthor;
      focusAuthor = focusAuthor === pk ? null : pk;
      selection = { type: "root", pubkey: pk };
      renderTreeView();
      return;
    }
    if (btn.dataset.treeSelectPost && btn.dataset.treeAuthor) {
      selection = { type: "post", postId: btn.dataset.treeSelectPost, author: btn.dataset.treeAuthor };
      focusAuthor = null;
      renderTreeView();
      return;
    }
    if (btn.dataset.treeSelectComment && btn.dataset.treePostId && btn.dataset.treeAuthor) {
      selection = {
        type: "comment",
        postId: btn.dataset.treePostId,
        commentId: btn.dataset.treeSelectComment,
        author: btn.dataset.treeAuthor,
      };
      focusAuthor = null;
      renderTreeView();
      return;
    }
    if (btn.dataset.treeOpenMilestones) {
      deps.onOpenMilestones();
    }
  });
}

export async function openTreePage(): Promise<void> {
  const modal = treeModal();
  if (!modal) return;
  modal.style.display = "flex";
  renderTreeView();
  if (deps?.refreshNetwork) {
    try {
      await deps.refreshNetwork();
      if (isTreeOpen()) renderTreeView();
    } catch {}
  }
}

export function refreshTreePageIfOpen(): void {
  if (isTreeOpen()) renderTreeView();
}
