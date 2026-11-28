// In-app dialogs (TASK-012): promise-based replacements for native confirm/prompt/alert.
// No DOM access at import time: Node tests import this module. Keep it out of ui/cli.

export type ToastType = "info" | "warning" | "error";

export interface ConfirmOptions {
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PromptOptions {
  defaultValue?: string;
  placeholder?: string;
  okLabel?: string;
  cancelLabel?: string;
  /** Copy fallback: value preselected, one Close button, resolves null. */
  readOnly?: boolean;
}

export type DialogRequest =
  | ({ kind: "confirm"; message: string } & ConfirmOptions)
  | ({ kind: "prompt"; message: string } & PromptOptions);

export type DialogResult = boolean | string | null;
export type DialogAction = "ok" | "cancel" | null;

/** Pure key mapping. `focused` = which dialog button has focus, if any. */
export function dialogKeyAction(
  key: string,
  ctx: { kind: "confirm" | "prompt"; inInput: boolean; focused: "ok" | "cancel" | null },
): DialogAction {
  if (key === "Escape" || key === "Esc") return "cancel";
  if (key !== "Enter") return null;
  if (ctx.kind === "prompt" && ctx.inInput) return "ok";
  return ctx.focused;
}

/** FIFO queue: only one dialog renders at a time; later requests wait. */
export function createDialogQueue<Req, Res>(render: (req: Req) => Promise<Res>): (req: Req) => Promise<Res> {
  let tail: Promise<unknown> = Promise.resolve();
  return (req: Req) => {
    const result = tail.then(() => render(req));
    tail = result.catch(() => undefined); // a failed render must not block the queue
    return result;
  };
}

let open: ((req: DialogRequest) => Promise<DialogResult>) | null = null;
const enqueue = (req: DialogRequest) => (open ??= createDialogQueue(renderDialog))(req);

export function confirmDialog(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  return enqueue({ kind: "confirm", message, ...opts }) as Promise<boolean>;
}

/** Resolves the typed value (untrimmed, like native prompt) or null on cancel. */
export function promptDialog(message: string, opts: PromptOptions = {}): Promise<string | null> {
  return enqueue({ kind: "prompt", message, ...opts }) as Promise<string | null>;
}

let dialogSeq = 0;

function renderDialog(req: DialogRequest): Promise<DialogResult> {
  return new Promise((resolve) => {
    const previous = document.activeElement as HTMLElement | null;
    const id = `app-dialog-${++dialogSeq}`;
    const readOnly = req.kind === "prompt" && !!req.readOnly;

    const backdrop = document.createElement("div");
    backdrop.className = "app-dialog-backdrop";
    const dialog = document.createElement("div");
    dialog.className = req.kind === "confirm" && req.danger ? "app-dialog app-dialog-danger" : "app-dialog";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", `${id}-msg`);

    const msg = document.createElement("p");
    msg.className = "app-dialog-message";
    msg.id = `${id}-msg`;
    msg.textContent = req.message; // plain text only: caller text never reaches innerHTML
    dialog.appendChild(msg);

    let input: HTMLInputElement | null = null;
    if (req.kind === "prompt") {
      input = document.createElement("input");
      input.type = "text";
      input.className = "app-dialog-input";
      input.value = req.defaultValue ?? "";
      if (req.placeholder) input.placeholder = req.placeholder;
      input.readOnly = readOnly;
      input.setAttribute("aria-labelledby", `${id}-msg`);
      dialog.appendChild(input);
    }

    const actions = document.createElement("div");
    actions.className = "app-dialog-actions";
    let cancelBtn: HTMLButtonElement | null = null;
    if (!readOnly) {
      cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "app-dialog-cancel";
      cancelBtn.setAttribute("data-dialog-cancel", "");
      cancelBtn.textContent = req.cancelLabel ?? "Cancel";
      actions.appendChild(cancelBtn);
    }
    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = req.kind === "confirm" && req.danger ? "app-dialog-ok danger" : "app-dialog-ok";
    okBtn.setAttribute("data-dialog-ok", "");
    okBtn.textContent = readOnly ? "Close" : (req.okLabel ?? "OK");
    actions.appendChild(okBtn);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);

    const finish = (action: "ok" | "cancel") => {
      backdrop.remove();
      if (previous?.isConnected) previous.focus?.();
      if (req.kind === "confirm") resolve(action === "ok");
      else resolve(action === "ok" && !readOnly ? (input?.value ?? "") : null);
    };

    okBtn.addEventListener("click", () => finish("ok"));
    cancelBtn?.addEventListener("click", () => finish("cancel"));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) finish("cancel");
    });
    dialog.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        const items = [input, cancelBtn, okBtn].filter((el): el is HTMLInputElement | HTMLButtonElement => !!el);
        const i = items.indexOf(document.activeElement as HTMLInputElement | HTMLButtonElement);
        const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length;
        items[next].focus();
        e.preventDefault();
        return;
      }
      const active = document.activeElement;
      const action = dialogKeyAction(e.key, {
        kind: req.kind,
        inInput: active === input,
        focused: active === okBtn ? "ok" : active === cancelBtn ? "cancel" : null,
      });
      if (!action) return;
      e.preventDefault(); // stops the native button click from firing a second time
      e.stopPropagation(); // page-level Escape handlers must not close the modal underneath
      finish(action);
    });

    document.body.appendChild(backdrop);
    if (input) {
      input.focus();
      input.select();
    } else if (req.kind === "confirm" && req.danger && cancelBtn) {
      cancelBtn.focus(); // a stray Enter must not delete
    } else {
      okBtn.focus();
    }
  });
}

/** Moved from main.ts. Error toasts default to 6 s; explicit durations win. */
export function showToast(message: string, type: ToastType = "info", duration = type === "error" ? 6000 : 3500) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 200);
  }, duration);
}
