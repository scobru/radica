// Full-screen terminal UI for the terminal chat (chat.ts keeps the logic): conversations on the left, the open one on
// the right, a status line and the input at the bottom. Plain ANSI on the alternate screen, redrawn whole on change.
import { emitKeypressEvents } from "node:readline";

export interface TuiConv {
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
const width = (s: string) => [...s].length; // shortcut: counts code points, so wide CJK/emoji misalign by a column; use a wcwidth table if that matters
const cut = (s: string, w: number) => ([...s].length <= w ? s + " ".repeat(w - width(s)) : [...s].slice(0, Math.max(0, w - 1)).join("") + "…");

function wrap(text: string, w: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      if (width(line) + width(word) + (line ? 1 : 0) <= w) line = line ? `${line} ${word}` : word;
      else {
        if (line) out.push(line);
        // a word longer than the pane (a key, a contact card) is split
        let rest = [...word];
        while (rest.length > w) {
          out.push(rest.slice(0, w).join(""));
          rest = rest.slice(w);
        }
        line = rest.join("");
      }
    }
    out.push(line);
  }
  return out;
}

export function startTui(state: TuiState, on: TuiHandlers): { render(): void } {
  let focus: "list" | "input" = "list";
  let sel = 0;
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
    sel = Math.min(sel, Math.max(0, state.convs.length - 1));

    const left = state.convs.length
      ? state.convs.map((c, i) => {
          const mark = i === state.open ? "●" : " ";
          const text = cut(`${mark} ${c.label}${c.secret ? " 🔒" : ""}`, L);
          return i === sel && focus === "list" ? `${ESC}7m${text}${ESC}0m` : i === state.open ? `${ESC}1m${text}${ESC}0m` : text;
        })
      : [cut(" No conversations yet", L), cut(" /open <who> or /nearby", L)];
    const leftTop = Math.max(0, Math.min(sel - body + 1, state.convs.length - body));

    const empty = state.open >= 0 ? "No messages yet: type below and press Enter." : "Pick a conversation on the left (↑ ↓ Enter), or type /help.";
    const right = wrap(state.panel ?? (state.lines.length ? state.lines.join("\n") : empty), R);
    scroll = Math.max(0, Math.min(scroll, right.length - body));
    const rightView = right.slice(Math.max(0, right.length - body - scroll), right.length - scroll);

    let out = `${ESC}H${ESC}7m${cut(` ${state.header}`, W)}${ESC}0m\n`;
    for (let r = 0; r < body; r++) out += `${left[leftTop + r] ?? " ".repeat(L)}${ESC}2m│${ESC}0m${cut(rightView[r] ?? "", R)}\n`;
    const hint =
      focus === "list"
        ? "↑↓ select · Enter open · Del remove · Tab write · PgUp/PgDn scroll · Ctrl+C quit"
        : "Enter send · Tab/Esc list · /help commands · PgUp/PgDn scroll · Ctrl+C quit";
    out += `${ESC}2m${cut(` ${state.status || hint}`, W)}${ESC}0m\n`;
    const prompt = focus === "input" ? "> " : "  ";
    const shown = [...input].slice(-(W - 3)).join("");
    out += `${cut(prompt + shown, W)}${ESC}${H};${Math.min(W, prompt.length + width(shown) + 1)}H${focus === "input" ? `${ESC}?25h` : `${ESC}?25l`}`;
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
    if (key.name === "pageup") scroll += 5;
    else if (key.name === "pagedown") scroll = Math.max(0, scroll - 5);
    else if (key.name === "tab") focus = focus === "list" ? "input" : "list";
    else if (key.name === "escape") {
      state.panel = null;
      focus = "list";
    } else if (focus === "list") {
      if (key.name === "up") sel = Math.max(0, sel - 1);
      else if (key.name === "down") sel = Math.min(state.convs.length - 1, sel + 1);
      else if (key.name === "return" && state.convs.length) {
        scroll = 0;
        state.panel = null;
        focus = "input";
        on.openAt(sel);
      } else if (key.name === "delete" && state.convs.length) {
        // twice, so one stray key never drops a conversation
        if (confirmDelete === sel) {
          confirmDelete = -1;
          on.deleteAt(sel);
        } else {
          confirmDelete = sel;
          state.status = `Press Del again to remove ${state.convs[sel].label} from your list.`;
        }
      } else if (str && !key.ctrl && str >= " ") {
        focus = "input"; // typing goes to the input whatever has focus
        input += str;
      }
    } else if (key.name === "return") {
      const text = input.trim();
      input = "";
      scroll = 0;
      if (text) on.submit(text);
    } else if (key.name === "backspace") input = [...input].slice(0, -1).join("");
    else if (str && !key.ctrl && str >= " ") input += str;
    render();
  });
  render();
  return { render };
}
