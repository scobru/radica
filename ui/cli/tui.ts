// Full-screen terminal UI for the terminal chat (chat.ts keeps the logic): conversations on the left, the open one on
// the right, a status line and the input at the bottom. Plain ANSI on the alternate screen, redrawn whole on change.
import { emitKeypressEvents } from "node:readline";

export interface TuiConv {
  /** Stable identity of the row: the selection follows it when the list is refreshed or reordered. */
  key: string;
  label: string;
  secret: boolean;
}
export interface TuiMsg {
  time: string;
  who: string;
  mine: boolean;
  text: string;
  /** Dim suffix after the name: "sending…", "local network". */
  note?: string;
}
export interface TuiState {
  header: string;
  convs: TuiConv[];
  /** Index in convs of the open conversation, or -1. */
  open: number;
  /** The open conversation, one entry per message (wrapped and colored here). */
  lines: TuiMsg[];
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
    const R = W - L - 2;
    const body = H - 3;
    const keep = state.convs.findIndex((c) => c.key === selKey);
    sel = keep >= 0 ? keep : Math.min(sel, Math.max(0, state.convs.length - 1));
    selKey = state.convs[sel]?.key ?? "";

    // palette: a stable color per name, so people are told apart at a glance
    const PALETTE = [81, 213, 221, 114, 209, 147, 180, 117];
    const colorOf = (name: string) => PALETTE[[...name].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
    const fg = (c: number, t: string) => `${ESC}38;5;${c}m${t}${ESC}39m`;
    const dim = (t: string) => `${ESC}2m${t}${ESC}22m`;
    const cap = body - 1; // the first left row is the title
    const left = state.convs.map((c, i) => {
      const mark = i === state.open ? "●" : " ";
      const text = cut(` ${mark} ${c.label}${c.secret ? " 🔒" : ""}`, L);
      // the selection always shows (reverse; underlined while typing), the open one is bold
      const style = i === sel ? (focus === "list" ? "7" : "4") : i === state.open ? "1" : "";
      return style ? `${ESC}${style}m${text}${ESC}0m` : text;
    });
    if (!left.length) left.push(dim(cut(" No chats yet", L)), dim(cut(" /open <who> or /nearby", L)));
    const leftTop = Math.max(0, Math.min(sel - cap + 1, state.convs.length - cap));

    // right pane rows: colored text and its visible width, so padding stays exact
    type Row = { s: string; w: number };
    const plain = (t: string, f = (x: string) => x): Row[] => wrap(t, R).map((l) => ({ s: f(l), w: width(l) }));
    let rows: Row[];
    if (state.panel) rows = plain(state.panel);
    else if (!state.lines.length)
      rows = plain(state.open >= 0 ? "No messages yet: type below and press Enter." : "Pick a chat on the left (↑ ↓ Enter), or type /help.", dim);
    else {
      rows = [];
      for (const m of state.lines) {
        const name = m.mine ? `${ESC}1;38;5;114m${m.who}${ESC}0m` : `${ESC}1;38;5;${colorOf(m.who)}m${m.who}${ESC}0m`;
        const head = `${dim(m.time)} ${name}${m.note ? dim(`  ${m.note}`) : ""}`;
        rows.push({ s: head, w: width(m.time) + 1 + width(m.who) + (m.note ? 2 + width(m.note) : 0) });
        for (const l of wrap(m.text, R - 2)) rows.push({ s: `  ${l}`, w: 2 + width(l) });
        rows.push({ s: "", w: 0 });
      }
      rows.pop();
    }
    scroll = Math.max(0, Math.min(scroll, rows.length - body));
    const rightView = rows.slice(Math.max(0, rows.length - body - scroll), rows.length - scroll);
    const pad = (r?: Row) => (r ? r.s + " ".repeat(Math.max(0, R - r.w)) : " ".repeat(R));

    // every row at its own position: a row that overflows can never scroll the screen
    const row = (y: number, text: string) => `${ESC}${y};1H${text}${ESC}0m`;
    const bar = `${dim("│")} `;
    let out = row(1, `${ESC}1;97;48;5;61m${cut(` ${state.header}`, W)}`);
    out += row(2, `${ESC}1;38;5;147m${cut(" CHATS", L)}${ESC}0m${bar}${dim(cut(state.open >= 0 && state.convs[state.open] ? ` ${state.convs[state.open].label} · ${state.convs[state.open].secret ? "Secret Chat 🔒" : "DM"}` : "", R))}`);
    for (let r = 0; r < cap; r++) out += row(r + 3, `${left[leftTop + r] ?? " ".repeat(L)}${bar}${pad(rightView[r])}`);
    const hint =
      focus === "list"
        ? "↑↓ select · Enter open · Del remove · type to write · PgUp/PgDn scroll · Ctrl+C quit"
        : "↑↓ select · Enter send (empty: open selected) · Esc list · /help · Ctrl+C quit";
    out += row(H - 1, `${ESC}48;5;236m${ESC}38;5;250m${cut(` ${state.status || hint}`, W)}`);
    const prompt = focus === "input" ? "> " : "  ";
    let shown = input;
    while (width(shown) > W - 3) shown = [...shown].slice(1).join("");
    out += row(H, `${ESC}38;5;81m${prompt}${ESC}39m${cut(shown, W - 1 - prompt.length)}`) + `${ESC}${H};${Math.min(W, prompt.length + width(shown) + 1)}H${focus === "input" ? `${ESC}?25h` : `${ESC}?25l`}`;
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
