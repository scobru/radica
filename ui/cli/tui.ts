// Full-screen terminal UI for the terminal chat (chat.ts keeps the logic): conversations on the left, the open one on
// the right, a status line and the input at the bottom. Plain ANSI on the alternate screen, redrawn whole on change.
import { emitKeypressEvents } from "node:readline";

export interface TuiConv {
  /** Stable identity of the row: the selection follows it when the list is refreshed or reordered. */
  key: string;
  label: string;
  secret: boolean;
}
export interface TuiState {
  header: string;
  convs: TuiConv[];
  /** Index in convs of the open conversation, or -1. */
  open: number;
  /** The open conversation, one entry per message (already formatted, may be long: wrapped here). */
  lines: string[];
  /** Multi-line output of a command (/help, /me): shown instead of the conversation until Esc. */
  panel: string | null;
  status: string;
}
export interface TuiHandlers {
  submit(text: string): void;
  openAt(index: number): void;
  deleteAt(index: number): void;
  quit(): void;
}

const ESC = "\x1b[";
/** Terminal columns of one code point: emoji and East Asian wide characters take 2, combining marks and joiners 0. */
function cols(cp: number): number {
  if ((cp >= 0x300 && cp <= 0x36f) || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x1f3fb && cp <= 0x1f3ff)) return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) || (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x20000 && cp <= 0x3fffd)
  )
    return 2;
  return 1;
}
// shortcut: a hand-made width table (no dependency); rare symbols may still be off by a column, use a full wcwidth table if seen
export const width = (s: string): number => [...s].reduce((n, ch) => n + cols(ch.codePointAt(0)!), 0);
/** Exactly `w` columns: padded, or cut with an ellipsis. */
export function cut(s: string, w: number): string {
  if (width(s) <= w) return s + " ".repeat(w - width(s));
  let out = "";
  let n = 0;
  for (const ch of s) {
    const c = cols(ch.codePointAt(0)!);
    if (n + c > w - 1) break;
    out += ch;
    n += c;
  }
  return out + "…" + " ".repeat(Math.max(0, w - 1 - n));
}

export function wrap(text: string, w: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      if (width(line) + width(word) + (line ? 1 : 0) <= w) line = line ? `${line} ${word}` : word;
      else {
        if (line) out.push(line);
        // a word longer than the pane (a key, a contact card) is split
        line = "";
        for (const ch of word) {
          if (width(line + ch) > w) {
            out.push(line);
            line = "";
          }
          line += ch;
        }
      }
    }
    out.push(line);
  }
  return out;
}

export function startTui(state: TuiState, on: TuiHandlers): { render(): void } {
  let focus: "list" | "input" = "list";
  let sel = 0;
  let selKey = "";
  let input = "";
  let scroll = 0; // lines up from the bottom of the right pane
  let confirmDelete = -1;
  let queued = false;

  const draw = () => {
    queued = false;
    const W = process.stdout.columns || 80;
    const H = process.stdout.rows || 24;
    const L = Math.max(18, Math.min(32, Math.floor(W * 0.3)));
    const R = W - L - 1;
    const body = H - 3;
    const keep = state.convs.findIndex((c) => c.key === selKey);
    sel = keep >= 0 ? keep : Math.min(sel, Math.max(0, state.convs.length - 1));
    selKey = state.convs[sel]?.key ?? "";

    const left = state.convs.length
      ? state.convs.map((c, i) => {
          const mark = i === state.open ? "●" : " ";
          const text = cut(`${mark} ${c.label}${c.secret ? " [secret]" : ""}`, L);
          // the selection always shows (reverse; underlined while typing), the open one is bold
          const style = i === sel ? (focus === "list" ? "7" : "4") : i === state.open ? "1" : "";
          return style ? `${ESC}${style}m${text}${ESC}0m` : text;
        })
      : [cut(" No conversations yet", L), cut(" /open <who> or /nearby", L)];
    const leftTop = Math.max(0, Math.min(sel - body + 1, state.convs.length - body));

    const empty = state.open >= 0 ? "No messages yet: type below and press Enter." : "Pick a conversation on the left (↑ ↓ Enter), or type /help.";
    const right = wrap(state.panel ?? (state.lines.length ? state.lines.join("\n") : empty), R);
    scroll = Math.max(0, Math.min(scroll, right.length - body));
    const rightView = right.slice(Math.max(0, right.length - body - scroll), right.length - scroll);

    // every row at its own position: a row that overflows can never scroll the screen
    const row = (y: number, text: string) => `${ESC}${y};1H${text}${ESC}0m`;
    let out = row(1, `${ESC}7m${cut(` ${state.header}`, W)}`);
    for (let r = 0; r < body; r++) out += row(r + 2, `${left[leftTop + r] ?? " ".repeat(L)}${ESC}2m│${ESC}0m${cut(rightView[r] ?? "", R)}`);
    const hint =
      focus === "list"
        ? "↑↓ select · Enter open · Del remove · type to write · PgUp/PgDn scroll · Ctrl+C quit"
        : "↑↓ select · Enter send (empty: open selected) · Esc list · /help · Ctrl+C quit";
    out += row(H - 1, `${ESC}2m${cut(` ${state.status || hint}`, W)}`);
    const prompt = focus === "input" ? "> " : "  ";
    let shown = input;
    while (width(shown) > W - 3) shown = [...shown].slice(1).join("");
    out += row(H, cut(prompt + shown, W - 1)) + `${ESC}${H};${Math.min(W, prompt.length + width(shown) + 1)}H${focus === "input" ? `${ESC}?25h` : `${ESC}?25l`}`;
    process.stdout.write(out);
  };
  const render = () => {
    if (!queued) {
      queued = true;
      setImmediate(draw);
    }
  };

  process.stdout.write(`${ESC}?1049h${ESC}2J`); // alternate screen: the shell's scrollback comes back on quit
  const restore = () => process.stdout.write(`${ESC}?25h${ESC}?1049l`);
  process.on("exit", restore);
  process.stdout.on("resize", render);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.on("keypress", (str: string | undefined, key: { name?: string; ctrl?: boolean }) => {
    if (key.ctrl && key.name === "c") return on.quit();
    if (key.name !== "delete") confirmDelete = -1;
    const pick = (i: number) => {
      sel = Math.max(0, Math.min(state.convs.length - 1, i));
      selKey = state.convs[sel]?.key ?? "";
    };
    const openSelected = () => {
      if (!state.convs.length) return;
      scroll = 0;
      state.panel = null;
      focus = "input";
      on.openAt(sel);
    };
    // ↑↓ always move through the list, also while typing: nothing else in the input needs them
    if (key.name === "up") pick(sel - 1);
    else if (key.name === "down") pick(sel + 1);
    else if (key.name === "pageup") scroll += 5;
    else if (key.name === "pagedown") scroll = Math.max(0, scroll - 5);
    else if (key.name === "tab") focus = focus === "list" ? "input" : "list";
    else if (key.name === "escape") {
      state.panel = null;
      focus = "list";
    } else if (key.name === "return") {
      const text = input.trim();
      input = "";
      if (focus === "list" || !text) openSelected();
      else {
        scroll = 0;
        on.submit(text);
      }
    } else if (key.name === "delete" && focus === "list" && state.convs.length) {
      // twice, so one stray key never drops a conversation
      if (confirmDelete === sel) {
        confirmDelete = -1;
        on.deleteAt(sel);
      } else {
        confirmDelete = sel;
        state.status = `Press Del again to remove ${state.convs[sel].label} from your list.`;
      }
    } else if (key.name === "backspace") input = [...input].slice(0, -1).join("");
    else if (str && !key.ctrl && str >= " ") {
      focus = "input"; // typing goes to the input whatever has focus
      input += str;
    }
    render();
  });
  render();
  return { render };
}
