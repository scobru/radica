// Curated Boards & Collections (Pinterest / Are.na) — TASK-007.
import { escapeHtml as esc } from "./html.ts";
import { maskProfanity } from "./moderation.ts";
import { safeStorage } from "./storage.ts";

export const BOARD_PREFIX = "radica-board:";

export interface BoardItem {
  postId: string;
  author: string;
  captionPreview: string;
  mediaUri?: string;
  note?: string;
  addedAt: number;
}

export interface CuratedBoard {
  id: string;
  owner: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  items: BoardItem[];
  createdAt: number;
  updatedAt: number;
}

function makeBoardId(): string {
  return `brd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createBoard(
  owner: string,
  title: string,
  description = "",
  visibility: "public" | "private" = "public"
): CuratedBoard {
  const now = Date.now();
  return {
    id: makeBoardId(),
    owner,
    title: title.trim().slice(0, 80) || "Untitled Board",
    description: description.trim().slice(0, 280),
    visibility,
    items: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function addItemToBoard(board: CuratedBoard, item: BoardItem): CuratedBoard {
  const key = `${item.author}:${item.postId}`;
  const existingIdx = board.items.findIndex((i) => `${i.author}:${i.postId}` === key);
  const normalized: BoardItem = {
    postId: item.postId,
    author: item.author,
    captionPreview: (item.captionPreview || "").trim().slice(0, 180),
    mediaUri: item.mediaUri,
    note: item.note?.trim().slice(0, 240) || undefined,
    addedAt: item.addedAt || Date.now(),
  };
  const nextItems = [...board.items];
  if (existingIdx >= 0) {
    nextItems[existingIdx] = normalized;
  } else {
    nextItems.unshift(normalized);
  }
  return {
    ...board,
    items: nextItems,
    updatedAt: Date.now(),
  };
}

export function removeItemFromBoard(board: CuratedBoard, author: string, postId: string): CuratedBoard {
  const key = `${author}:${postId}`;
  return {
    ...board,
    items: board.items.filter((i) => `${i.author}:${i.postId}` !== key),
    updatedAt: Date.now(),
  };
}

export function boardPermalink(owner: string, boardId: string): string {
  return `#board=${encodeURIComponent(boardId)}&author=${encodeURIComponent(owner)}`;
}

export function parseBoardHash(hash: string): { boardId: string; owner?: string } | null {
  const clean = (hash || "").replace(/^#/, "");
  if (!clean.startsWith("board=")) return null;
  const params = new URLSearchParams(clean);
  const boardId = params.get("board")?.trim();
  if (!boardId) return null;
  const owner = params.get("author")?.trim() || undefined;
  return { boardId, owner };
}

export function serializeBoardPostCaption(board: CuratedBoard): string {
  const payload = {
    v: 1,
    id: board.id,
    owner: board.owner,
    title: board.title,
    description: board.description,
    items: board.items.slice(0, 24).map((i) => ({
      postId: i.postId,
      author: i.author,
      captionPreview: i.captionPreview,
      mediaUri: i.mediaUri,
      note: i.note,
      addedAt: i.addedAt,
    })),
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };
  const json = JSON.stringify(payload);
  const link = boardPermalink(board.owner, board.id);
  return `📌 **Board: ${board.title}** (${board.items.length} items)\n${board.description ? `${board.description}\n` : ""}${link}\n\n${BOARD_PREFIX}${json}`;
}

export function parseBoardPostCaption(caption: string): CuratedBoard | null {
  if (!caption) return null;
  const idx = caption.indexOf(BOARD_PREFIX);
  if (idx === -1) return null;
  const raw = caption.slice(idx + BOARD_PREFIX.length).trim();
  try {
    const obj = JSON.parse(raw) as Partial<CuratedBoard>;
    if (!obj || typeof obj.id !== "string" || typeof obj.title !== "string" || !Array.isArray(obj.items)) {
      return null;
    }
    return {
      id: obj.id,
      owner: typeof obj.owner === "string" ? obj.owner : "",
      title: obj.title,
      description: typeof obj.description === "string" ? obj.description : "",
      visibility: "public",
      items: obj.items,
      createdAt: Number(obj.createdAt) || Date.now(),
      updatedAt: Number(obj.updatedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

export interface BoardFilterOpts {
  viewerPubkey?: string;
  hiddenAuthors: Set<string>;
  reportedTargets?: Set<string>;
}

export function filterVisibleBoards(boards: CuratedBoard[], opts: BoardFilterOpts): CuratedBoard[] {
  return boards.filter((b) => {
    if (opts.hiddenAuthors.has(b.owner)) return false;
    if (opts.reportedTargets?.has(`${b.owner}:${b.id}`)) return false;
    if (b.visibility === "private" && b.owner !== opts.viewerPubkey) return false;
    return true;
  });
}

const storageKey = (pubkey: string) => `radica_boards_${pubkey}`;

export function loadLocalBoards(pubkey: string): CuratedBoard[] {
  if (!pubkey) return [];
  try {
    const raw = safeStorage.getItem(storageKey(pubkey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalBoards(pubkey: string, boards: CuratedBoard[]): void {
  if (!pubkey) return;
  try {
    safeStorage.setItem(storageKey(pubkey), JSON.stringify(boards));
  } catch {
    // ignore storage quota errors
  }
}

export function renderBoardSummaryCardHtml(board: CuratedBoard, maskBadWords = true, isOwner = false): string {
  const clean = (s: string) => (maskBadWords ? maskProfanity(s) : s);
  const badge = board.visibility === "private" ? "🔒 Private" : "🌐 Public";
  const visibleItems = isOwner ? board.items : board.items.slice(0, 4);
  const itemsPreview = visibleItems
    .map((it) => {
      const text = clean(it.captionPreview || "Post");
      const note = it.note ? `<div class="board-item-note">📝 ${esc(clean(it.note))}</div>` : "";
      const removeBtn = isOwner
        ? `<button type="button" class="board-item-remove-btn" data-board-id="${esc(board.id)}" data-author="${esc(it.author)}" data-post-id="${esc(it.postId)}" title="Remove from board" aria-label="Remove from board">✕</button>`
        : "";
      return (
        `<div class="board-item-wrap">` +
          `<button type="button" class="board-item-chip" data-post-id="${esc(it.postId)}" data-author="${esc(it.author)}">` +
            `<span class="board-item-text">${esc(text)}</span>` +
            note +
          `</button>` +
          removeBtn +
        `</div>`
      );
    })
    .join("");

  const ownerActions = isOwner
    ? `<button type="button" class="btn-secondary btn-sm board-edit-btn" data-board-id="${esc(board.id)}">✏️ Edit</button>` +
      `<button type="button" class="btn-secondary btn-sm board-delete-btn" data-board-id="${esc(board.id)}">🗑️ Delete</button>`
    : "";

  const editForm = isOwner
    ? `<form class="board-edit-form" data-board-id="${esc(board.id)}" style="display: none;">` +
        `<input type="text" class="board-edit-title" value="${esc(board.title)}" placeholder="Board title" maxlength="80" required />` +
        `<input type="text" class="board-edit-desc" value="${esc(board.description)}" placeholder="Description (optional)" maxlength="200" />` +
        `<div class="board-edit-row">` +
          `<select class="board-edit-vis" aria-label="Visibility">` +
            `<option value="public"${board.visibility === "public" ? " selected" : ""}>🌐 Public</option>` +
            `<option value="private"${board.visibility === "private" ? " selected" : ""}>🔒 Private</option>` +
          `</select>` +
          `<button type="submit" class="btn-primary btn-sm">Save</button>` +
          `<button type="button" class="btn-secondary btn-sm board-edit-cancel-btn">Cancel</button>` +
        `</div>` +
      `</form>`
    : "";

  return (
    `<article class="board-card" data-board-id="${esc(board.id)}" data-owner="${esc(board.owner)}">` +
      `<div class="board-card-head">` +
        `<div>` +
          `<h4 class="board-card-title">📌 ${esc(clean(board.title))}</h4>` +
          (board.description ? `<p class="board-card-desc">${esc(clean(board.description))}</p>` : "") +
        `</div>` +
        `<span class="board-vis-badge">${badge} · ${board.items.length}</span>` +
      `</div>` +
      editForm +
      (itemsPreview ? `<div class="board-items-grid">${itemsPreview}</div>` : `<div class="board-empty-items">No items collected yet.</div>`) +
      `<div class="board-card-actions">` +
        ownerActions +
        `<button type="button" class="btn-secondary btn-sm board-copy-link-btn" data-board-id="${esc(board.id)}" data-owner="${esc(board.owner)}">🔗 Share Link</button>` +
      `</div>` +
    `</article>`
  );
}
