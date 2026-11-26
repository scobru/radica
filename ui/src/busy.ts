// A button that starts slow work (publishing a room, migrating, joining…) shows a spinner and what it is doing, and
// cannot be pressed again until the work ends: a second press could publish a twin room.

/** Run `task` with `btn` locked and showing a spinner and `label`; `say` changes the label between steps. */
export async function withBusy<T>(
  btn: HTMLElement | null | undefined,
  label: string,
  task: (say: (label: string) => void) => Promise<T>,
): Promise<T> {
  if (!btn) return task(() => {});
  if (btn.getAttribute("aria-busy") === "true") throw new Error("Already in progress");
  const before = Array.from(btn.childNodes);
  const text = document.createElement("span");
  const spinner = document.createElement("span");
  spinner.className = "busy-spinner";
  spinner.setAttribute("aria-hidden", "true");
  const say = (l: string) => void (text.textContent = l);
  say(label);
  btn.replaceChildren(spinner, text);
  btn.setAttribute("aria-busy", "true");
  btn.classList.add("is-busy");
  if (btn instanceof HTMLButtonElement) btn.disabled = true;
  try {
    return await task(say);
  } finally {
    btn.replaceChildren(...before);
    btn.removeAttribute("aria-busy");
    btn.classList.remove("is-busy");
    if (btn instanceof HTMLButtonElement) btn.disabled = false;
  }
}
