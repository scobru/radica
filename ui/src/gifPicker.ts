// Radica GIF Picker
// Provides a curated library of reaction GIFs across popular categories, real-time tag search,
// and custom GIF/image URL insertion.

import { heavyUrl } from "./heavyAssets.ts";

export interface GifItem {
  id: string;
  title: string;
  url: string;
  category: "reactions" | "emotions" | "memes";
  tags: string[];
}

export const CURATED_GIFS: GifItem[] = [
  // Reactions
  {
    id: "nod-approval",
    title: "Nod of Approval",
    url: "./gifs/nod-approval.gif",
    category: "reactions",
    tags: ["nod", "agree", "yes", "approval", "beard", "respect", "ok"],
  },
  {
    id: "thumbs-up",
    title: "Thumbs Up",
    url: "./gifs/thumbs-up.gif",
    category: "reactions",
    tags: ["thumbs up", "good", "nice", "yes", "positive", "great"],
  },
  {
    id: "applause-clap",
    title: "Applause",
    url: "./gifs/applause-clap.gif",
    category: "reactions",
    tags: ["applause", "clap", "bravo", "cheer", "congrats", "well done"],
  },
  {
    id: "mind-blown",
    title: "Mind Blown",
    url: "./gifs/mind-blown.gif",
    category: "reactions",
    tags: ["mind blown", "wow", "galaxy", "boom", "shock", "amazing"],
  },
  {
    id: "shrug",
    title: "Shrug",
    url: "./gifs/shrug.gif",
    category: "reactions",
    tags: ["shrug", "dunno", "whatever", "maybe", "idk", "carell"],
  },
  {
    id: "facepalm",
    title: "Facepalm",
    url: "./gifs/facepalm.gif",
    category: "reactions",
    tags: ["facepalm", "picard", "sigh", "smh", "disappointed", "fail"],
  },

  // Emotions
  {
    id: "laughing-lol",
    title: "Laughing / LOL",
    url: "./gifs/laughing-lol.gif",
    category: "emotions",
    tags: ["laugh", "lol", "lmao", "haha", "funny", "hilarious"],
  },
  {
    id: "love-heart",
    title: "Love / Heart",
    url: "./gifs/love-heart.gif",
    category: "emotions",
    tags: ["love", "heart", "cute", "kiss", "warmth", "like"],
  },
  {
    id: "surprised-pikachu",
    title: "Surprised",
    url: "./gifs/surprised-pikachu.gif",
    category: "emotions",
    tags: ["surprised", "wow", "pikachu", "shocked", "omg", "what"],
  },
  {
    id: "cheers-gatsby",
    title: "Cheers",
    url: "./gifs/cheers-gatsby.gif",
    category: "emotions",
    tags: ["cheers", "gatsby", "toast", "congrats", "celebrate", "drink"],
  },

  // Memes / Fun
  {
    id: "popcorn-eating",
    title: "Eating Popcorn",
    url: "./gifs/popcorn-eating.gif",
    category: "memes",
    tags: ["popcorn", "drama", "watching", "entertained", "show"],
  },
  {
    id: "confused-travolta",
    title: "Confused Travolta",
    url: "./gifs/confused-travolta.gif",
    category: "memes",
    tags: ["confused", "travolta", "lost", "where", "what", "pulp fiction"],
  },
  {
    id: "this-is-fine",
    title: "This Is Fine",
    url: "./gifs/this-is-fine.gif",
    category: "memes",
    tags: ["this is fine", "fire", "dog", "chaos", "chill", "calm"],
  },
  {
    id: "deal-with-it",
    title: "Deal With It",
    url: "./gifs/deal-with-it.gif",
    category: "memes",
    tags: ["deal with it", "sunglasses", "cool", "boss", "swag"],
  },
  {
    id: "homer-bushes",
    title: "Homer Backing into Bushes",
    url: "./gifs/homer-bushes.gif",
    category: "memes",
    tags: ["homer", "bushes", "hide", "bye", "awkward", "retreat", "simpsons"],
  },
  {
    id: "typing-cat",
    title: "Typing Cat",
    url: "./gifs/typing-cat.gif",
    category: "memes",
    tags: ["cat", "typing", "coding", "work", "keyboard", "fast"],
  },
  {
    id: "dance-party",
    title: "Dance / Party",
    url: "./gifs/dance-party.gif",
    category: "memes",
    tags: ["dance", "party", "vibes", "music", "groove", "happy"],
  },

  // More reactions
  {
    id: "fire-lit",
    title: "Fire / Lit",
    url: "./gifs/fire-lit.gif",
    category: "reactions",
    tags: ["fire", "lit", "hot", "flame", "amazing", "awesome"],
  },
  {
    id: "hundred-points",
    title: "100",
    url: "./gifs/hundred-points.gif",
    category: "reactions",
    tags: ["100", "perfect", "nailed it", "respect", "keep it 100"],
  },
  {
    id: "party-popper",
    title: "Party Popper",
    url: "./gifs/party-popper.gif",
    category: "reactions",
    tags: ["party", "confetti", "celebrate", "congrats", "yay", "tada"],
  },
  {
    id: "thinking-face",
    title: "Thinking",
    url: "./gifs/thinking-face.gif",
    category: "reactions",
    tags: ["thinking", "hmm", "considering", "suspicious", "doubt"],
  },
  {
    id: "sparkles-twinkle",
    title: "Sparkles",
    url: "./gifs/sparkles-twinkle.gif",
    category: "reactions",
    tags: ["sparkles", "shiny", "magic", "cute", "nice"],
  },
  {
    id: "pray-thanks",
    title: "Pray / Thanks",
    url: "./gifs/pray-thanks.gif",
    category: "reactions",
    tags: ["pray", "thanks", "please", "hope", "grateful", "amen"],
  },

  // More emotions
  {
    id: "crying-laughing",
    title: "Crying Laughing",
    url: "./gifs/crying-laughing.gif",
    category: "emotions",
    tags: ["crying laughing", "lmao", "lol", "dying", "hilarious", "rofl"],
  },
  {
    id: "heart-eyes",
    title: "Heart Eyes",
    url: "./gifs/heart-eyes.gif",
    category: "emotions",
    tags: ["heart eyes", "love it", "adore", "beautiful", "crush", "obsessed"],
  },
  {
    id: "angry-mad",
    title: "Angry",
    url: "./gifs/angry-mad.gif",
    category: "emotions",
    tags: ["angry", "mad", "furious", "rage", "annoyed", "pissed"],
  },
  {
    id: "crying-sad",
    title: "Crying / Sad",
    url: "./gifs/crying-sad.gif",
    category: "emotions",
    tags: ["crying", "sad", "sobbing", "tears", "heartbroken", "upset"],
  },

  // More memes / fun
  {
    id: "side-eye-look",
    title: "Side Eye",
    url: "./gifs/side-eye-look.gif",
    category: "memes",
    tags: ["side eye", "suspicious", "watching", "sus", "looking", "shady"],
  },
  {
    id: "skull-dead",
    title: "Dead / Skull",
    url: "./gifs/skull-dead.gif",
    category: "memes",
    tags: ["skull", "dead", "im dead", "deceased", "lol", "finished"],
  },
];

let activeModal: HTMLElement | null = null;

export function openGifPicker(options: { onSelect: (url: string) => void }): void {
  closeGifPicker();

  const modal = document.createElement("div");
  modal.className = "modal-overlay gif-picker-overlay";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-label", "Choose a GIF");

  let activeCategory: "all" | "reactions" | "emotions" | "memes" = "all";
  let searchQuery = "";

  modal.innerHTML = `
    <div class="gif-picker-modal">
      <div class="gif-picker-header">
        <div class="gif-picker-title">
          <span class="gif-badge">GIF</span>
          <span>Choose a GIF</span>
        </div>
        <button type="button" class="gif-picker-close" aria-label="Close GIF Picker">✕</button>
      </div>

      <div class="gif-picker-search-bar">
        <input type="text" class="gif-picker-input" placeholder="Search reaction or paste GIF link…" autofocus />
        <button type="button" class="gif-picker-use-url-btn btn-primary" style="display: none;">Use Link</button>
      </div>

      <div class="gif-picker-tabs">
        <button type="button" class="gif-tab active" data-cat="all">All</button>
        <button type="button" class="gif-tab" data-cat="reactions">Reactions</button>
        <button type="button" class="gif-tab" data-cat="emotions">Emotions</button>
        <button type="button" class="gif-tab" data-cat="memes">Memes</button>
      </div>

      <div class="gif-picker-grid"></div>
    </div>
  `;

  const input = modal.querySelector<HTMLInputElement>(".gif-picker-input")!;
  const useUrlBtn = modal.querySelector<HTMLButtonElement>(".gif-picker-use-url-btn")!;
  const grid = modal.querySelector<HTMLElement>(".gif-picker-grid")!;
  const closeBtn = modal.querySelector<HTMLButtonElement>(".gif-picker-close")!;
  const tabBtns = modal.querySelectorAll<HTMLButtonElement>(".gif-tab");

  function safeDirectUrl(q: string): string | null {
    const trimmed = q.trim();
    if (!trimmed || /[\s"'<>]/.test(trimmed)) return null;
    try {
      const u = new URL(trimmed);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      const looksImage = /\.(?:gif|png|jpe?g|webp)(?:\?.*)?$/i.test(u.pathname + u.search);
      const trustedHost = /^(?:media\d*\.giphy\.com|media\.tenor\.com|c\.tenor\.com|i\.imgur\.com)$/i.test(u.hostname);
      return looksImage || trustedHost ? u.href : null;
    } catch {
      return null;
    }
  }

  function isDirectUrl(q: string): boolean {
    return safeDirectUrl(q) !== null;
  }

  function renderGrid() {
    const rawQ = searchQuery.trim();
    const q = rawQ.toLowerCase();
    const directUrl = safeDirectUrl(rawQ);

    if (directUrl) {
      useUrlBtn.style.display = "inline-block";
      const card = document.createElement("div");
      card.className = "gif-url-preview-card";
      const label = document.createElement("p");
      label.className = "gif-url-preview-label";
      label.textContent = "Direct Link Preview:";
      const item = document.createElement("div");
      item.className = "gif-item gif-url-preview-item";
      item.dataset.url = directUrl;
      const img = document.createElement("img");
      img.src = directUrl;
      img.alt = "GIF Preview";
      img.loading = "lazy";
      img.addEventListener("error", () => {
        const err = document.createElement("span");
        err.className = "gif-error";
        err.textContent = "Could not load image from link";
        item.replaceChildren(err);
      });
      const caption = document.createElement("span");
      caption.className = "gif-item-title";
      caption.textContent = "Click to use this GIF";
      item.append(img, caption);
      card.append(label, item);
      grid.replaceChildren(card);
      return;
    }

    useUrlBtn.style.display = "none";

    const filtered = CURATED_GIFS.filter((item) => {
      if (activeCategory !== "all" && item.category !== activeCategory) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q))
      );
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="gif-empty-state">
          <p>No matching GIFs found.</p>
          <p><small>Tip: Paste any direct GIF link in the search box to insert it!</small></p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered
      .map(
        (g) => `
        <button type="button" class="gif-item" data-url="${g.url}" title="${g.title}">
          <img src="${heavyUrl(g.url)}" alt="${g.title}" loading="lazy" decoding="async" />
          <span class="gif-item-title">${g.title}</span>
        </button>
      `
      )
      .join("");
  }

  // Category switching
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeCategory = btn.dataset.cat as any;
      renderGrid();
    });
  });

  // Search input
  input.addEventListener("input", () => {
    searchQuery = input.value;
    renderGrid();
  });

  // Direct URL submission
  const submitUrl = () => {
    const trimmed = input.value.trim();
    if (trimmed && (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed))) {
      options.onSelect(trimmed);
      closeGifPicker();
    }
  };

  useUrlBtn.addEventListener("click", submitUrl);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && isDirectUrl(input.value)) {
      e.preventDefault();
      submitUrl();
    }
  });

  // Item click delegation
  grid.addEventListener("click", (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>(".gif-item");
    if (!item || !item.dataset.url) return;
    options.onSelect(item.dataset.url);
    closeGifPicker();
  });

  // Close handlers
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeGifPicker();
  };

  closeBtn.addEventListener("click", closeGifPicker);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeGifPicker();
  });
  document.addEventListener("keydown", onKeyDown);

  activeModal = modal;
  document.body.appendChild(modal);
  renderGrid();
  setTimeout(() => input.focus(), 50);
}

export function closeGifPicker(): void {
  if (activeModal) {
    activeModal.remove();
    activeModal = null;
  }
}
