import test from "node:test";
import assert from "node:assert/strict";
import {
  isEditableTarget,
  findNextCardIndex,
  handleGotoKey,
  isGotoActive,
  showGotoHud,
  SHORTCUTS_LIST,
  triggerSelectedPostAction,
  setSelectedPostCard,
  getSelectedPostCard,
  clearSelectedPostCard,
  handleKeyboardShortcut,
  toggleShortcutsModal,
  isShortcutsModalOpen,
} from "../src/shortcuts.ts";

test("shortcuts: SHORTCUTS_LIST contains all essential categories and valid entries", () => {
  assert.ok(SHORTCUTS_LIST.length >= 15, "Should have comprehensive shortcuts");
  const categories = new Set(SHORTCUTS_LIST.map((s) => s.category));
  assert.ok(categories.has("Navigation"));
  assert.ok(categories.has("Feed & Posts"));
  assert.ok(categories.has("Actions & Composing"));
  assert.ok(categories.has("Media & Audio"));
  assert.ok(categories.has("Chat & Messaging"));
  assert.ok(categories.has("General"));

  for (const item of SHORTCUTS_LIST) {
    assert.ok(item.keyLabel.length > 0);
    assert.ok(item.description.length > 0);
  }
});

test("shortcuts: isEditableTarget accurately distinguishes editable inputs from non-editable elements", () => {
  // Mock element builder
  const mockEl = (tag: string, type?: string, contentEditable = false) =>
    ({
      tagName: tag.toUpperCase(),
      type: type ?? "",
      isContentEditable: contentEditable,
    } as unknown as HTMLElement);

  // Editable elements:
  assert.equal(isEditableTarget(mockEl("textarea")), true);
  assert.equal(isEditableTarget(mockEl("select")), true);
  assert.equal(isEditableTarget(mockEl("input", "text")), true);
  assert.equal(isEditableTarget(mockEl("input", "search")), true);
  assert.equal(isEditableTarget(mockEl("input", "url")), true);
  assert.equal(isEditableTarget(mockEl("input", "password")), true);
  assert.equal(isEditableTarget(mockEl("input", "email")), true);
  assert.equal(isEditableTarget(mockEl("div", undefined, true)), true);

  // Non-editable elements:
  assert.equal(isEditableTarget(mockEl("input", "button")), false);
  assert.equal(isEditableTarget(mockEl("input", "submit")), false);
  assert.equal(isEditableTarget(mockEl("input", "checkbox")), false);
  assert.equal(isEditableTarget(mockEl("input", "radio")), false);
  assert.equal(isEditableTarget(mockEl("input", "range")), false);
  assert.equal(isEditableTarget(mockEl("input", "file")), false);
  assert.equal(isEditableTarget(mockEl("button")), false);
  assert.equal(isEditableTarget(mockEl("div")), false);
  assert.equal(isEditableTarget(mockEl("span")), false);
  assert.equal(isEditableTarget(null), false);
});

test("shortcuts: findNextCardIndex navigates forward, backward, and respects boundaries", () => {
  const c0 = { getBoundingClientRect: () => ({ top: 100, bottom: 300 }) } as unknown as HTMLElement;
  const c1 = { getBoundingClientRect: () => ({ top: 310, bottom: 500 }) } as unknown as HTMLElement;
  const c2 = { getBoundingClientRect: () => ({ top: 510, bottom: 700 }) } as unknown as HTMLElement;
  const cards = [c0, c1, c2];

  // Moving forward from c0 -> c1 -> c2 -> c2 (clamped)
  assert.equal(findNextCardIndex(cards, c0, "next"), 1);
  assert.equal(findNextCardIndex(cards, c1, "next"), 2);
  assert.equal(findNextCardIndex(cards, c2, "next"), 2);

  // Moving backward from c2 -> c1 -> c0 -> c0 (clamped)
  assert.equal(findNextCardIndex(cards, c2, "prev"), 1);
  assert.equal(findNextCardIndex(cards, c1, "prev"), 0);
  assert.equal(findNextCardIndex(cards, c0, "prev"), 0);

  // Empty list handling
  assert.equal(findNextCardIndex([], null, "next"), -1);
  assert.equal(findNextCardIndex([], null, "prev"), -1);
});

test("shortcuts: handleGotoKey dispatches to navigation targets", () => {
  const clicked: string[] = [];
  const origGetById = (globalThis as any).document?.getElementById;

  (globalThis as any).document = {
    ...(globalThis as any).document,
    getElementById: (id: string) => ({
      id,
      click: () => clicked.push(id),
    }),
    querySelector: (sel: string) => ({
      click: () => clicked.push(sel),
    }),
    querySelectorAll: () => [],
  };

  assert.equal(handleGotoKey("h"), true);
  assert.equal(clicked.pop(), "rail-home-btn");

  assert.equal(handleGotoKey("c"), true);
  assert.equal(clicked.pop(), "open-chat-btn");

  assert.equal(handleGotoKey("m"), true);
  assert.equal(clicked.pop(), "open-mail-btn");

  assert.equal(handleGotoKey("n"), true);
  assert.equal(clicked.pop(), "open-notifs-btn");

  assert.equal(handleGotoKey("i"), true);
  assert.equal(clicked.pop(), "open-identity-btn");

  assert.equal(handleGotoKey("p"), true);
  assert.equal(clicked.pop(), "scope-myposts-btn");

  assert.equal(handleGotoKey("s"), true);
  assert.equal(clicked.pop(), '[data-scope="saved"]');

  assert.equal(handleGotoKey("u"), true);
  assert.equal(clicked.pop(), "updates-open-btn");

  assert.equal(handleGotoKey("g"), true);
  assert.equal(clicked.pop(), "greenhouse-open-btn");

  assert.equal(handleGotoKey("b"), true);
  assert.equal(clicked.pop(), "blocklists-open-btn");

  assert.equal(handleGotoKey("z"), false);
});

test("shortcuts: triggerSelectedPostAction invokes like, dislike, save, comments on focused card", () => {
  const actions: string[] = [];
  let commentFocused = false;
  let moreOpen = false;

  const mockCard = {
    classList: {
      contains: (cls: string) => cls === "keyboard-focused",
      add: () => {},
      remove: () => {},
    },
    querySelector: (sel: string) => {
      if (sel === ".like-btn") return { click: () => actions.push("like") };
      if (sel === ".dislike-btn") return { click: () => actions.push("dislike") };
      if (sel === ".save-post-btn") return { click: () => actions.push("save") };
      if (sel === "textarea.comment-input") {
        return {
          focus: () => { commentFocused = true; },
          scrollIntoView: () => {},
        };
      }
      if (sel === ".comment-count-btn") return { click: () => actions.push("toggle-comments") };
      if (sel === "details.post-more") {
        return {
          get open() { return moreOpen; },
          set open(v: boolean) { moreOpen = v; },
          querySelector: () => ({ focus: () => {} }),
        };
      }
      if (sel === ".btn-reveal-nsfw, .nsfw-overlay") return { click: () => actions.push("nsfw") };
      return null;
    },
  } as unknown as HTMLElement;

  (globalThis as any).document = {
    ...(globalThis as any).document,
    querySelector: (sel: string) => (sel === ".gram-card.keyboard-focused" ? mockCard : null),
  };

  assert.equal(triggerSelectedPostAction("like"), true);
  assert.equal(actions.pop(), "like");

  assert.equal(triggerSelectedPostAction("dislike"), true);
  assert.equal(actions.pop(), "dislike");

  assert.equal(triggerSelectedPostAction("save"), true);
  assert.equal(actions.pop(), "save");

  assert.equal(triggerSelectedPostAction("comment"), true);
  assert.equal(commentFocused, true);

  assert.equal(triggerSelectedPostAction("toggle-comments"), true);
  assert.equal(actions.pop(), "toggle-comments");

  assert.equal(triggerSelectedPostAction("more"), true);
  assert.equal(moreOpen, true);

  assert.equal(triggerSelectedPostAction("reveal-nsfw"), true);
  assert.equal(actions.pop(), "nsfw");
});

test("shortcuts: Ctrl+Enter triggers publishBtn on post-caption or requestSubmit on comments", () => {
  let publishClicked = false;
  let commentSubmitted = false;

  const mockCaption = {
    id: "post-caption",
    tagName: "TEXTAREA",
  } as unknown as HTMLElement;

  const mockPublishBtn = {
    id: "publish-btn",
    disabled: false,
    click: () => { publishClicked = true; },
  };

  const mockComment = {
    tagName: "TEXTAREA",
    closest: (sel: string) => {
      if (sel === "textarea.comment-input") {
        return {
          form: {
            requestSubmit: () => { commentSubmitted = true; },
          },
        };
      }
      return null;
    },
  } as unknown as HTMLElement;

  (globalThis as any).document = {
    ...(globalThis as any).document,
    getElementById: (id: string) => (id === "publish-btn" ? mockPublishBtn : null),
  };

  // Test Ctrl+Enter on post-caption
  const ev1 = {
    ctrlKey: true,
    metaKey: false,
    key: "Enter",
    target: mockCaption,
    preventDefault: () => {},
  } as unknown as KeyboardEvent;
  assert.equal(handleKeyboardShortcut(ev1), true);
  assert.equal(publishClicked, true);

  // Test Cmd+Enter on comment textarea
  const ev2 = {
    ctrlKey: false,
    metaKey: true,
    key: "Enter",
    target: mockComment,
    preventDefault: () => {},
  } as unknown as KeyboardEvent;
  assert.equal(handleKeyboardShortcut(ev2), true);
  assert.equal(commentSubmitted, true);
});

test("shortcuts: Escape key blurs focused input or clears selected card", () => {
  let blurred = false;
  const mockInput = {
    tagName: "INPUT",
    type: "text",
    blur: () => { blurred = true; },
  } as unknown as HTMLElement;

  const ev1 = {
    key: "Escape",
    target: mockInput,
    preventDefault: () => {},
  } as unknown as KeyboardEvent;

  assert.equal(handleKeyboardShortcut(ev1), true);
  assert.equal(blurred, true);
});

test("shortcuts: ? key opens shortcuts modal", () => {
  let modalDisplay = "none";
  const mockModal = {
    id: "shortcuts-modal",
    style: {
      get display() { return modalDisplay; },
      set display(v: string) { modalDisplay = v; },
    },
    querySelector: () => null,
  };

  (globalThis as any).document = {
    ...(globalThis as any).document,
    getElementById: (id: string) => (id === "shortcuts-modal" ? mockModal : null),
    querySelectorAll: () => [],
  };

  const ev = {
    key: "?",
    target: { tagName: "BODY" },
    preventDefault: () => {},
  } as unknown as KeyboardEvent;

  assert.equal(handleKeyboardShortcut(ev), true);
  assert.equal(modalDisplay, "flex");
  assert.equal(isShortcutsModalOpen(), true);

  // Closing modal
  toggleShortcutsModal(false);
  assert.equal(modalDisplay, "none");
  assert.equal(isShortcutsModalOpen(), false);
});

test("shortcuts: notifications view allows j/k stepping, Enter activation, and g+h navigation", () => {
  let activeTab = "notifs";
  let notificationClicked = false;
  let homeClicked = false;

  const notifItem1 = {
    classList: {
      contains: () => false,
      add: () => {},
      remove: () => {},
    },
    focus: () => {},
    scrollIntoView: () => {},
    click: () => { notificationClicked = true; },
  };

  const mockNotifsList = {
    id: "notifs-list",
    querySelectorAll: () => [notifItem1],
    querySelector: () => notifItem1,
  };

  const mockNotifsModal = {
    id: "notifs-modal",
    style: {
      get display() { return activeTab === "notifs" ? "flex" : "none"; },
      set display(v: string) { if (v === "none") activeTab = "feed"; },
    },
  };

  const mockRailHome = {
    id: "rail-home-btn",
    click: () => {
      homeClicked = true;
      activeTab = "feed";
    },
  };

  (globalThis as any).document = {
    ...(globalThis as any).document,
    getElementById: (id: string) => {
      if (id === "notifs-modal") return mockNotifsModal;
      if (id === "notifs-list") return mockNotifsList;
      if (id === "rail-home-btn") return mockRailHome;
      return null;
    },
    querySelectorAll: (sel: string) => {
      if (sel.includes("notif-item")) return [notifItem1];
      if (sel.includes("rail-page")) return [mockNotifsModal];
      return [];
    },
    querySelector: () => null,
  };

  // 1. While in notifications, press 'j' to navigate notifications
  const evDown = {
    key: "j",
    target: { tagName: "BODY" },
    preventDefault: () => {},
  } as unknown as KeyboardEvent;
  assert.equal(handleKeyboardShortcut(evDown), true);

  // 2. Press 'Enter' to open notification
  const evEnter = {
    key: "Enter",
    target: { tagName: "BODY" },
    preventDefault: () => {},
  } as unknown as KeyboardEvent;
  assert.equal(handleKeyboardShortcut(evEnter), true);
  assert.equal(notificationClicked, true);

  // 3. Press 'g' to start goto sequence while in notifications
  const evG = {
    key: "g",
    target: { tagName: "BODY" },
    preventDefault: () => {},
  } as unknown as KeyboardEvent;
  assert.equal(handleKeyboardShortcut(evG), true);
  assert.equal(isGotoActive(), true);

  // 4. Press 'h' to jump back to home feed
  const evH = {
    key: "h",
    target: { tagName: "BODY" },
    preventDefault: () => {},
  } as unknown as KeyboardEvent;
  assert.equal(handleKeyboardShortcut(evH), true);
  assert.equal(homeClicked, true);
  assert.equal(isGotoActive(), false);
});


