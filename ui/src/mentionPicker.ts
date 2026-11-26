// "@" in the post or comment box opens a list of people; picking one writes "@Name" in the box and remembers whose
// key it is. On send, `withMentionKeys` turns each picked "@Name" into "@<key>" (what the post stores, see caption.ts).

export type Person = { pubkey: string; name: string };

/** `text` with each picked "@Name" as "@<key>"; longer names first, so "@Ann Lee" wins over "@Ann". */
export function namesToKeys(text: string, picks: Map<string, string>): string {
  for (const [name, pk] of [...picks].sort((a, b) => b[0].length - a[0].length)) text = text.split(`@${name}`).join(`@${pk}`);
  return text;
}

const picked = new WeakMap<HTMLElement, Map<string, string>>();

/** Write "@Name " at the end of `box` and remember whose key it is, as picking them from the list does (a swipe). */
export function insertMention(box: HTMLInputElement | HTMLTextAreaElement, p: Person): void {
  const v = box.value;
  box.value = `${v}${v && !v.endsWith(" ") ? " " : ""}@${p.name} `;
  if (!picked.has(box)) picked.set(box, new Map());
  picked.get(box)!.set(p.name, p.pubkey);
}

/** What to send for this box: its picked mentions as keys. Forgets the picks (the box is being emptied). */
export function withMentionKeys(box: HTMLElement, text: string): string {
  const picks = picked.get(box);
  picked.delete(box);
  return picks ? namesToKeys(text, picks) : text;
}

const QUERY_RE = /(?:^|\s)@([^\s@]{0,30})$/;

/** Watch every box matching `selector` (now and later): typing "@" and some letters lists `people(query)`. */
export function attachMentionPicker(selector: string, people: (query: string) => Person[]): void {
  const menu = document.createElement("div");
  menu.className = "mention-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  document.body.appendChild(menu);
  let box: HTMLInputElement | HTMLTextAreaElement | null = null;
  let shown: Person[] = [];
  let active = 0;

  const close = () => {
    menu.hidden = true;
    shown = [];
  };
  const draw = () => {
    menu.replaceChildren(
      ...shown.map((p, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "mention-option" + (i === active ? " active" : "");
        b.setAttribute("role", "option");
        b.textContent = p.name;
        b.addEventListener("mousedown", (e) => {
          e.preventDefault(); // keep the focus in the box
          pick(p);
        });
        return b;
      })
    );
  };
  const pick = (p: Person) => {
    if (!box) return;
    const caret = box.selectionStart ?? box.value.length;
    const before = box.value.slice(0, caret).replace(/@[^\s@]{0,30}$/, `@${p.name} `);
    box.value = before + box.value.slice(caret);
    box.setSelectionRange(before.length, before.length);
    if (!picked.has(box)) picked.set(box, new Map());
    picked.get(box)!.set(p.name, p.pubkey);
    close();
  };

  document.addEventListener("input", (e) => {
    const el = e.target as HTMLElement;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || !el.matches(selector)) return;
    const q = QUERY_RE.exec(el.value.slice(0, el.selectionStart ?? el.value.length));
    shown = q ? people(q[1]).slice(0, 6) : [];
    if (!shown.length) return close();
    box = el;
    active = 0;
    draw();
    const r = el.getBoundingClientRect();
    menu.style.left = `${r.left + window.scrollX}px`;
    menu.style.top = `${r.bottom + window.scrollY + 4}px`;
    menu.hidden = false;
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (menu.hidden || e.target !== box) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        active = (active + (e.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length;
        draw();
      } else if (e.key === "Enter" || e.key === "Tab") pick(shown[active]);
      else if (e.key === "Escape") close();
      else return;
      e.preventDefault();
      e.stopPropagation(); // Enter must not send the comment, Escape must not close the page
    },
    true
  );
  document.addEventListener("focusout", (e) => {
    if (e.target === box) close();
  });
}
